import { z } from 'zod';
import { db, DEFAULT_SETTINGS, initDb } from './db';

export const BACKUP_VERSION = 1;

const macros = { cal: z.number(), p: z.number(), g: z.number(), l: z.number(), fib: z.number().default(0) };

const BackupSchema = z.object({
  app: z.literal('nutritrack'),
  version: z.number(),
  exportedAt: z.string(),
  settings: z.record(z.string(), z.unknown()).nullable(),
  foods: z.array(z.object({ id: z.string(), name: z.string(), ...macros }).passthrough()),
  recipes: z.array(z.object({ id: z.string(), name: z.string() }).passthrough()),
  entries: z.array(z.object({ id: z.string(), date: z.string(), meal: z.string(), name: z.string(), ...macros }).passthrough()),
  weights: z.array(z.object({ date: z.string(), kg: z.number() }).passthrough()),
  days: z.array(z.object({ date: z.string() }).passthrough()),
  chat: z.array(z.object({ id: z.string(), role: z.string(), content: z.string() }).passthrough()).default([]),
});

export type Backup = z.infer<typeof BackupSchema>;

/** Sérialise toute la base (la clé API est incluse : le fichier est personnel). */
export async function exportBackup(includeApiKey = true): Promise<string> {
  const settings = await db.settings.get('app');
  const payload = {
    app: 'nutritrack' as const,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    settings: settings ? { ...settings, apiKey: includeApiKey ? settings.apiKey : '' } : null,
    foods: await db.foods.toArray(),
    recipes: await db.recipes.toArray(),
    entries: await db.entries.toArray(),
    weights: await db.weights.toArray(),
    days: await db.days.toArray(),
    chat: await db.chat.toArray(),
  };
  return JSON.stringify(payload, null, 1);
}

export interface ImportSummary {
  entries: number;
  weights: number;
  foods: number;
  recipes: number;
}

/**
 * Restaure une sauvegarde.
 * - replace : vide tout puis réimporte (restauration sur un nouveau téléphone).
 * - merge : ajoute / met à jour par identifiant sans supprimer l'existant.
 */
export async function importBackup(json: string, mode: 'replace' | 'merge'): Promise<ImportSummary> {
  const parsed = BackupSchema.safeParse(JSON.parse(json));
  if (!parsed.success) throw new Error('Fichier de sauvegarde invalide : ' + parsed.error.issues[0]?.message);
  const b = parsed.data;
  if (b.version > BACKUP_VERSION) throw new Error(`Sauvegarde trop récente (v${b.version}), mets l'application à jour.`);

  await db.transaction('rw', db.tables, async () => {
    if (mode === 'replace') {
      await Promise.all(db.tables.map((t) => t.clear()));
    }
    if (b.settings) {
      const current = mode === 'merge' ? await db.settings.get('app') : undefined;
      await db.settings.put({ ...DEFAULT_SETTINGS, ...current, ...(b.settings as object), id: 'app' } as typeof DEFAULT_SETTINGS);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anyRows = (rows: unknown[]) => rows as any[];
    await db.foods.bulkPut(anyRows(b.foods));
    await db.recipes.bulkPut(anyRows(b.recipes));
    await db.entries.bulkPut(anyRows(b.entries));
    await db.weights.bulkPut(anyRows(b.weights));
    await db.days.bulkPut(anyRows(b.days));
    await db.chat.bulkPut(anyRows(b.chat));
  });
  await initDb();
  return { entries: b.entries.length, weights: b.weights.length, foods: b.foods.length, recipes: b.recipes.length };
}

export async function wipeAll(): Promise<void> {
  await db.transaction('rw', db.tables, async () => {
    await Promise.all(db.tables.map((t) => t.clear()));
  });
  await initDb();
}
