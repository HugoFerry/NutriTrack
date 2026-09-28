import 'fake-indexeddb/auto';
import { afterAll, describe, expect, it } from 'vitest';
import type { ArtifactCollection, ArtifactDb, ArtifactDocSnapshot } from '../../services/artifact';
import { db, initDb } from '../db';
import { updateSettings } from '../repos';
import { onNewerVersion, resync, startSync, stopSync } from '../sync';
import { PROG, SEED_PROGRAMS, exId } from '../training-seed';

// Stockage de l'artefact simulé en mémoire, branché comme le fait claude.ai (window.claude.use('db')).
const server = new Map<string, Map<string, Record<string, unknown>>>();
const col = (name: string) => {
  if (!server.has(name)) server.set(name, new Map());
  return server.get(name)!;
};
const snap = (id: string, data?: Record<string, unknown>): ArtifactDocSnapshot => ({ id, exists: !!data, data: () => (data ? structuredClone(data) : undefined) });
function collection(name: string): ArtifactCollection {
  const c: ArtifactCollection = {
    doc: (id) => ({
      id,
      get: async () => snap(id, col(name).get(id)),
      set: async (d) => void col(name).set(id, structuredClone(d)),
      delete: async () => void col(name).delete(id),
    }),
    get: async () => ({ docs: [...col(name)].map(([id, d]) => snap(id, d)), docChanges: () => [] }),
    limit: () => c,
    onSnapshot: () => () => {},
  };
  return c;
}
const fakeDb: ArtifactDb = { collection, doc: () => { throw new Error('non utilisé'); } };
(globalThis as unknown as { window: unknown }).window = { setTimeout: globalThis.setTimeout.bind(globalThis), claude: { use: async () => fakeDb } };

afterAll(() => stopSync());

const flatKeys = (d?: Record<string, unknown>) => Object.keys(d ?? {}).filter((k) => k.includes('.'));

describe('synchro de la version web', () => {
  it("démarrage : l'ancienne version d'origine d'une séance type est remise à jour, une séance modifiée ailleurs est gardée, les réglages abîmés sont réparés", async () => {
    const jambes = SEED_PROGRAMS.find((p) => p.id === PROG.jambes)!;
    const pecs = SEED_PROGRAMS.find((p) => p.id === PROG.pecs)!;
    // Serveur : Jambes encore avec la presse (version d'origine précédente), Pecs modifiée sur un autre appareil.
    const ancienne = jambes.blocks.map((b) => (b.kind === 'serie' && b.exerciseId === exId('hip-thrust') ? { ...b, exerciseId: exId('presse-cuisses') } : b));
    col('programs').set(PROG.jambes, { ...jambes, blocks: ancienne, source: 'seed', createdAt: 1, updatedAt: 1000 });
    col('programs').set(PROG.pecs, { ...pecs, name: 'Pecs perso', source: 'custom', createdAt: 1, updatedAt: 2000 });

    await db.delete();
    await db.open();
    await initDb();
    // Réglages : justes sur l'appareil, abîmés sur le serveur par l'ancien hook (ancien profil + chemins à plat), même horodatage.
    const s = (await db.settings.get('app'))!;
    await db.settings.put({ ...s, profile: { ...s.profile, weight: 89.7, trainingDays: [2, 5, 6, 3, 0] }, updatedAt: 5000 });
    col('settings').set('app', { ...s, profile: { ...s.profile, weight: 89.2, trainingDays: [2, 5, 6, 3] }, 'profile.weight': 89.7, 'profile.trainingDays': [2, 5, 6, 3, 0], updatedAt: 5000 });

    const avant = Date.now();
    expect(await startSync()).toBe(true);

    const local = await db.programs.get(PROG.jambes);
    expect(local!.blocks).toEqual(jambes.blocks);
    expect(local!.updatedAt).toBeGreaterThanOrEqual(avant);
    expect(col('programs').get(PROG.jambes)).toMatchObject({ blocks: jambes.blocks, source: 'seed' });

    expect(await db.programs.get(PROG.pecs)).toMatchObject({ name: 'Pecs perso', source: 'custom', updatedAt: 2000 });
    expect(col('programs').get(PROG.pecs)).toMatchObject({ name: 'Pecs perso', updatedAt: 2000 });
    expect(col('programs').has(PROG.dos)).toBe(true);

    const distant = col('settings').get('app')!;
    expect(flatKeys(distant)).toEqual([]);
    expect(distant.profile).toMatchObject({ weight: 89.7, trainingDays: [2, 5, 6, 3, 0] });
    expect(distant.updatedAt).toBe(5000); // la version locale, saine, remplace la copie abîmée sans nouvel horodatage
  });

  it('un changement de profil part au serveur rangé dans le profil, pas à plat', async () => {
    const s = (await db.settings.get('app'))!;
    await updateSettings({ profile: { ...s.profile, weight: 88 } });
    await new Promise((r) => setTimeout(r, 700)); // envoi groupé après 400 ms
    const distant = col('settings').get('app')!;
    expect(flatKeys(distant)).toEqual([]);
    expect(distant.profile).toMatchObject({ weight: 88, trainingDays: [2, 5, 6, 3, 0] });
  });

  it('la version qui ouvre la base y inscrit sa date de construction', () => {
    expect(col('app').get('version')).toMatchObject({ build: '2026-09-28T12:00:00.000Z' });
  });

  it("resync : une pesée faite ailleurs pendant que l'écoute était coupée (veille) est récupérée", async () => {
    // Le serveur simulé ne pousse aucun changement : c'est le cas d'une écoute coupée par une mise en veille.
    col('weights').set('2026-09-29', { date: '2026-09-29', kg: 89.4, createdAt: 1, updatedAt: Date.now() });
    expect(await db.weights.get('2026-09-29')).toBeUndefined();
    expect(await resync()).toBe(true);
    expect(await db.weights.get('2026-09-29')).toMatchObject({ kg: 89.4 });
  });

  it('un appareil resté sur une ancienne version voit qu’une plus récente a été publiée', async () => {
    const vu: boolean[] = [];
    const stop = onNewerVersion((v) => vu.push(v));
    col('app').set('version', { build: '2026-10-01T08:00:00.000Z', updatedAt: Date.now() });
    await resync();
    stop();
    expect(vu).toEqual([false, true]);
    expect(col('app').get('version')).toMatchObject({ build: '2026-10-01T08:00:00.000Z' }); // jamais rétrogradée
  });
});
