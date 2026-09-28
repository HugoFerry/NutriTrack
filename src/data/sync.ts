/**
 * Synchronisation Dexie <-> stockage serveur de l'artefact Claude.
 *
 * Principe : Dexie reste la source de vérité locale et réactive. Chaque ligne porte un
 * `updatedAt`. Au démarrage on réconcilie (la version la plus récente gagne, par ligne),
 * puis chaque écriture locale est poussée et chaque changement distant est appliqué.
 * Les suppressions laissent une pierre tombale `{ deleted: true }` côté serveur.
 */
import type { Table } from 'dexie';
import { db, ensureSeedPrograms, type NutriDB } from './db';
import { appBuild, artifactDb, type ArtifactDb, type ArtifactCollection } from '../services/artifact';

type Row = Record<string, unknown> & { updatedAt?: number };
type RemoteDoc = Row & { deleted?: boolean };

export const SYNCED_TABLES = ['entries', 'weights', 'foods', 'recipes', 'days', 'chat', 'settings', 'exercises', 'programs', 'workouts'] as const;
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

/** Une ligne de base (seed) non favorite ne mérite pas d'aller sur le serveur ; les exercices de base non plus. */
export function shouldSync(table: SyncedTable, row: Row): boolean {
  if (table === 'foods') return row.source !== 'seed' || row.favorite === true;
  if (table === 'exercises') return row.source !== 'seed';
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

function setPath(o: Record<string, unknown>, path: string, v: unknown): void {
  const parts = path.split('.');
  let cur = o;
  for (const p of parts.slice(0, -1)) {
    if (typeof cur[p] !== 'object' || cur[p] === null) cur[p] = {};
    cur = cur[p] as Record<string, unknown>;
  }
  const last = parts[parts.length - 1];
  if (v === undefined) delete cur[last];
  else cur[last] = v;
}

/**
 * Ligne après une modification Dexie. Dexie décrit un changement dans un objet imbriqué par chemin
 * (« profile.weight ») : il faut l'appliquer dans l'objet, pas l'étaler à plat à côté de l'ancien.
 */
export function applyMods<T extends Row>(obj: T, mods: Record<string, unknown>): T {
  const next = structuredClone(obj) as Record<string, unknown>;
  for (const [k, v] of Object.entries(mods)) setPath(next, k, v);
  return next as T;
}

const hasFlatKeys = (row: Row) => Object.keys(row).some((k) => k.includes('.'));

/**
 * Répare une copie abîmée par l'ancien hook de synchro, qui étalait les chemins à plat
 * (réglages : `profile` ancien + « profile.weight » récent) : chaque champ à plat reprend sa place.
 */
export function unflatten<T extends Row>(row: T): T {
  if (!hasFlatKeys(row)) return row;
  const out = structuredClone(row) as Record<string, unknown>;
  for (const k of Object.keys(out).filter((x) => x.includes('.'))) {
    const v = out[k];
    delete out[k];
    setPath(out, k, v);
  }
  return out as T;
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
      const merged = applyMods(obj, mods as Record<string, unknown>);
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
      const damaged = hasFlatKeys(r);
      const { deleted: _d, ...row } = unflatten(r);
      // Copie abîmée : pas de marque, l'écriture locale est donc horodatée et la version réparée repoussée.
      if (!damaged) remoteMarks.add(mark(t, key, row.updatedAt));
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
    if ((d === 'push' || d === 'none') && hasFlatKeys(local)) {
      // Ligne locale abîmée par l'ancien hook (tirée d'un autre appareil) : réparée et réécrite ; les hooks l'horodatent et la poussent.
      await table.put(unflatten(local));
      continue;
    }
    if (d === 'none' && r && hasFlatKeys(r) && shouldSync(t, local)) {
      // Seule la copie du serveur est abîmée : la version locale, saine, la remplace, sans nouvel horodatage
      // (si l'envoi échoue, le prochain démarrage réessaie sans lui donner l'avantage sur une modification faite ailleurs).
      enqueue({ table: t, key, data: toRemote(local) });
      continue;
    }
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
    // Une ancienne version d'origine d'une séance type a pu revenir du serveur : remise à jour, horodatée et poussée.
    await ensureSeedPrograms();
    await flush();
    await checkVersion(rdb);
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

let resyncing: Promise<boolean> | null = null;

/**
 * Resynchronise tout : réconciliation complète et écoute des changements relancées. Une mise en veille ou un onglet
 * laissé en arrière-plan peut couper l'écoute sans prévenir ; l'appareil garderait alors des données (et des cibles)
 * périmées. Sert au retour au premier plan, au bouton « Actualiser » et à « Réessayer » après une erreur.
 */
export function resync(): Promise<boolean> {
  if (!resyncing) {
    resyncing = (async () => {
      stopSync(); // les écritures en attente restent dans la file et partent après la réconciliation
      try {
        return await startSync();
      } finally {
        resyncing = null;
      }
    })();
  }
  return resyncing;
}

// ---------- Version publiée ----------

let newerVersion = false;
const versionListeners = new Set<(newer: boolean) => void>();

/** Prévient quand une version plus récente de l'app a déjà tourné sur un autre appareil. */
export function onNewerVersion(l: (newer: boolean) => void): () => void {
  versionListeners.add(l);
  l(newerVersion);
  return () => versionListeners.delete(l);
}

/**
 * La base de l'artefact garde la date de construction la plus récente qui l'a ouverte (`app/version`).
 * Une version plus récente l'y inscrit ; un appareil resté sur une ancienne version le voit et le signale.
 */
async function checkVersion(rdb: ArtifactDb): Promise<void> {
  const mine = appBuild();
  if (!mine) return;
  try {
    const ref = rdb.collection('app').doc('version');
    const snap = await ref.get();
    const known = snap.exists ? String(snap.data()?.build ?? '') : '';
    if (known > mine) {
      newerVersion = true;
      versionListeners.forEach((l) => l(true));
    } else if (known < mine) {
      await ref.set({ build: mine, updatedAt: Date.now() });
    }
  } catch {
    // Information de confort : la synchro n'en dépend pas.
  }
}
