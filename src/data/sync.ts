/**
 * Synchronisation Dexie <-> stockage serveur de l'artefact Claude.
 *
 * Principe : Dexie reste la source de vérité locale et réactive. Chaque ligne porte un
 * `updatedAt`. Au démarrage on réconcilie (la version la plus récente gagne, par ligne),
 * puis chaque écriture locale est poussée et chaque changement distant est appliqué.
 * Les suppressions laissent une pierre tombale `{ deleted: true }` côté serveur.
 */
import type { Table } from 'dexie';
import { db, type NutriDB } from './db';
import { artifactDb, type ArtifactDb, type ArtifactCollection } from '../services/artifact';

type Row = Record<string, unknown> & { updatedAt?: number };
type RemoteDoc = Row & { deleted?: boolean };

export const SYNCED_TABLES = ['entries', 'weights', 'foods', 'recipes', 'days', 'chat', 'settings'] as const;
export type SyncedTable = (typeof SYNCED_TABLES)[number];

export type SyncState = 'off' | 'connecting' | 'syncing' | 'online' | 'error';
type Listener = (s: SyncState, detail?: string) => void;

const listeners = new Set<Listener>();
let state: SyncState = 'off';
let detail = '';
function setState(s: SyncState, d = '') {
  state = s;
  detail = d;
  listeners.forEach((l) => l(s, d));
}
export function onSyncState(l: Listener): () => void {
  listeners.add(l);
  l(state, detail);
  return () => listeners.delete(l);
}
export function syncState(): { state: SyncState; detail: string } {
  return { state, detail };
}

/** Une ligne de base (seed) non favorite ne mérite pas d'aller sur le serveur. */
export function shouldSync(table: SyncedTable, row: Row): boolean {
  if (table === 'foods') return row.source !== 'seed' || row.favorite === true;
  return true;
}

/** Décision de fusion par ligne : qui gagne entre local et distant. */
export function decide(local: Row | undefined, remote: RemoteDoc | undefined): 'push' | 'pull' | 'delete-local' | 'none' {
  const lt = local?.updatedAt ?? 0;
  const rt = remote?.updatedAt ?? 0;
  if (local && !remote) return 'push';
  if (!local && remote) return remote.deleted ? 'none' : 'pull';
  if (!local || !remote) return 'none';
  if (remote.deleted) return rt >= lt ? 'delete-local' : 'push';
  if (rt > lt) return 'pull';
  if (lt > rt) return 'push';
  return 'none';
}

/**
 * Copie envoyable au serveur : un aller-retour JSON retire les champs `undefined`
 * (laissés par les formulaires) au lieu de dépendre de la façon dont le stockage les traite.
 */
export function toRemote<T extends Row>(row: T): T {
  return JSON.parse(JSON.stringify(row)) as T;
}

/** Marques des écritures issues du serveur : évite de les repousser en boucle. */
const remoteMarks = new Set<string>();
const mark = (table: string, key: unknown, updatedAt: unknown) => `${table}|${String(key)}|${String(updatedAt)}`;

interface Pending {
  table: SyncedTable;
  key: string;
  data: RemoteDoc | null;
}
const queue = new Map<string, Pending>();
let flushTimer: number | null = null;
let remote: ArtifactDb | null = null;
let hooksInstalled = false;

function keyOf(table: SyncedTable, row: Row): string {
  return String(table === 'weights' || table === 'days' ? row.date : row.id);
}

function enqueue(p: Pending) {
  queue.set(`${p.table}/${p.key}`, p);
  if (flushTimer === null) flushTimer = window.setTimeout(flush, 400);
}

async function flush() {
  flushTimer = null;
  if (!remote || queue.size === 0) return;
  const batch = [...queue.values()];
  queue.clear();
  setState('syncing');
  let failed = 0;
  for (const p of batch) {
    try {
      const ref = remote.collection(p.table).doc(p.key);
      if (p.data) await ref.set(p.data);
    } catch {
      failed++;
      queue.set(`${p.table}/${p.key}`, p);
    }
  }
  if (failed) {
    setState('error', `${failed} écriture(s) en attente`);
    flushTimer = window.setTimeout(flush, 5000);
  } else setState('online');
}

/** Branche les hooks Dexie : toute écriture locale est horodatée et poussée. */
export function installSyncHooks(database: NutriDB = db): void {
  if (hooksInstalled) return;
  hooksInstalled = true;
  for (const t of SYNCED_TABLES) {
    const table = database.table(t) as Table<Row, string>;
    table.hook('creating', function (_pk, obj) {
      const stamp = mark(t, keyOf(t, obj), obj.updatedAt);
      if (remoteMarks.delete(stamp)) return; // ligne posée par la synchro
      obj.updatedAt = Date.now();
      if (shouldSync(t, obj)) enqueue({ table: t, key: keyOf(t, obj), data: toRemote(obj) });
    });
    table.hook('updating', function (mods, _pk, obj) {
      const merged = { ...obj, ...(mods as Row) };
      const stamp = mark(t, keyOf(t, merged), merged.updatedAt);
      if (remoteMarks.delete(stamp)) return undefined;
      const updatedAt = Date.now();
      const next = { ...merged, updatedAt };
      if (shouldSync(t, next)) enqueue({ table: t, key: keyOf(t, next), data: toRemote(next) });
      return { updatedAt };
    });
    table.hook('deleting', function (_pk, obj) {
      if (remoteMarks.delete(mark(t, keyOf(t, obj), 'deleted'))) return;
      if (shouldSync(t, obj)) enqueue({ table: t, key: keyOf(t, obj), data: { deleted: true, updatedAt: Date.now() } });
    });
  }
}

async function applyRemoteRows(t: SyncedTable, rows: RemoteDoc[]): Promise<void> {
  const table = db.table(t) as Table<Row, string>;
  const puts: Row[] = [];
  const dels: string[] = [];
  for (const r of rows) {
    const key = keyOf(t, r);
    const local = await table.get(key);
    const d = decide(local, r);
    if (d === 'pull') {
      const { deleted: _d, ...row } = r;
      remoteMarks.add(mark(t, key, row.updatedAt));
      puts.push(row);
    } else if (d === 'delete-local') {
      remoteMarks.add(mark(t, key, 'deleted'));
      dels.push(key);
    }
  }
  if (puts.length) await table.bulkPut(puts);
  if (dels.length) await table.bulkDelete(dels);
}

/** Réconciliation complète d'une table : pousse ce qui est plus récent localement, tire le reste. */
async function reconcile(t: SyncedTable, col: ArtifactCollection): Promise<void> {
  const snap = await col.limit(1000).get();
  const remoteRows = new Map<string, RemoteDoc>();
  for (const d of snap.docs) if (d.exists) remoteRows.set(d.id, { ...(d.data() as RemoteDoc) });
  const table = db.table(t) as Table<Row, string>;
  const locals = await table.toArray();
  const toApply: RemoteDoc[] = [];
  const seen = new Set<string>();
  for (const local of locals) {
    const key = keyOf(t, local);
    seen.add(key);
    const r = remoteRows.get(key);
    const d = decide(local, r);
    if (d === 'push' && shouldSync(t, local)) {
      const data = local.updatedAt ? local : { ...local, updatedAt: (local.createdAt as number) || Date.now() };
      if (!local.updatedAt) {
        remoteMarks.add(mark(t, key, data.updatedAt));
        await table.put(data);
      }
      enqueue({ table: t, key, data: toRemote(data) });
    } else if (d === 'pull' || d === 'delete-local') toApply.push(r!);
  }
  for (const [key, r] of remoteRows) if (!seen.has(key) && !r.deleted) toApply.push(r);
  await applyRemoteRows(t, toApply);
}

let unsubscribers: (() => void)[] = [];

/** Démarre la synchronisation (idempotent). Ne fait rien hors artefact. */
export async function startSync(): Promise<boolean> {
  if (remote) return true;
  setState('connecting');
  const rdb = await artifactDb();
  if (!rdb) {
    setState('off');
    return false;
  }
  remote = rdb;
  installSyncHooks();
  try {
    for (const t of SYNCED_TABLES) await reconcile(t, rdb.collection(t));
    await flush();
    unsubscribers = SYNCED_TABLES.map((t) =>
      rdb.collection(t).onSnapshot(
        (snap) => {
          const rows = snap.docChanges().filter((c) => c.type !== 'removed' && c.doc.exists).map((c) => c.doc.data() as RemoteDoc);
          if (rows.length) applyRemoteRows(t, rows).catch(() => {});
        },
        () => {},
      ),
    );
    setState('online');
    return true;
  } catch (e) {
    setState('error', e instanceof Error ? e.message : 'Synchronisation impossible');
    return false;
  }
}

export function stopSync(): void {
  unsubscribers.forEach((u) => u());
  unsubscribers = [];
  remote = null;
  setState('off');
}
