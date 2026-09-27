import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, initDb, NutriDB } from '../db';
import { exportBackup, importBackup } from '../backup';
import { addChat, clearChat, saveWorkout } from '../repos';
import { PROG, SEED_PROGRAMS, SEED_TRAINING_VERSION, exId, seedExercises } from '../training-seed';
import { shouldSync } from '../sync';

beforeEach(async () => {
  await db.delete();
  await db.open();
  await initDb();
});

describe('programme de départ', () => {
  it('4 séances, et chaque exercice cité existe dans le catalogue', async () => {
    const programs = await db.programs.orderBy('order').toArray();
    expect(programs.map((p) => p.name)).toEqual(['Dos', 'Pecs', 'Jambes', 'Bras / Épaules']);
    const ids = new Set(seedExercises().map((e) => e.id));
    const cites = SEED_PROGRAMS.flatMap((p) => p.blocks.flatMap((b) => (b.kind === 'serie' ? [b.exerciseId] : b.items.map((it) => it.exerciseId))));
    expect(cites.filter((id) => !ids.has(id))).toEqual([]);
    expect(await db.exercises.count()).toBe(seedExercises().length);
  });

  it("les règles d'enchaînement citent des séances qui existent", () => {
    const ids = new Set(SEED_PROGRAMS.map((p) => p.id));
    const regles = SEED_PROGRAMS.flatMap((p) => [...(p.notDayAfter ?? []), ...(p.onlyAfter ?? [])]);
    expect(regles.length).toBeGreaterThan(0);
    expect(regles.every((id) => ids.has(id))).toBe(true);
  });
});

describe('migration de la base v1 → v2', () => {
  it('garde les données existantes et ajoute le sport', async () => {
    const name = 'nutritrack-migration-test';
    await Dexie.delete(name);
    const v1 = new Dexie(name);
    v1.version(1).stores({
      settings: 'id', foods: 'id, name, category, source, barcode, favorite', recipes: 'id, name',
      entries: 'id, date, [date+meal], foodId, createdAt', weights: 'date', days: 'date', chat: 'id, createdAt', meta: 'key',
    });
    await v1.open();
    await v1.table('entries').add({ id: 'e1', date: '2026-09-20', meal: 'lunch', name: 'Pain blanc', qty: 70, qtyLabel: '70g', cal: 186, p: 5.6, g: 35, l: 2.1, fib: 1.9, createdAt: 1 });
    await v1.table('chat').add({ id: 'c1', role: 'user', content: 'ancien message', createdAt: 1 });
    v1.close();

    const v2 = new NutriDB(name);
    await initDb(v2);
    expect(v2.verno).toBe(2);
    expect(await v2.entries.get('e1')).toMatchObject({ name: 'Pain blanc', cal: 186 });
    expect(await v2.chat.get('c1')).toMatchObject({ content: 'ancien message' });
    expect(await v2.programs.count()).toBe(4);
    expect(await v2.workouts.count()).toBe(0);
    v2.close();
    await Dexie.delete(name);
  });
});

describe('séances, sauvegarde et chat', () => {
  const seance = { id: 'w1', date: '2026-09-26', programId: PROG.pecs, name: 'Pecs', blocks: [], startedAt: 1, finishedAt: 2, durationMin: 55, rpe: 7, createdAt: 1 };

  it("l'export contient séances et programme ; une ancienne sauvegarde sans sport s'importe", async () => {
    await saveWorkout(seance);
    const json = JSON.parse(await exportBackup());
    expect(json.workouts).toHaveLength(1);
    expect(json.programs).toHaveLength(4);
    expect(json.exercises).toEqual([]); // le catalogue de base n'est pas exporté
    delete json.workouts;
    delete json.programs;
    delete json.exercises;
    await importBackup(JSON.stringify(json), 'replace');
    expect(await db.workouts.count()).toBe(0);
    expect(await db.programs.count()).toBe(4);
  });

  it("effacer une conversation ne touche pas l'autre (sans canal = nutrition)", async () => {
    await addChat({ role: 'user', content: 'nutrition' });
    await addChat({ role: 'user', content: 'coach', channel: 'coach' });
    await clearChat('coach');
    expect((await db.chat.toArray()).map((m) => m.content)).toEqual(['nutrition']);
    await addChat({ role: 'user', content: 'coach 2', channel: 'coach' });
    await clearChat();
    expect((await db.chat.toArray()).map((m) => m.content)).toEqual(['coach 2']);
  });

  it('synchro : les exercices de base restent locaux, les perso partent', () => {
    expect(shouldSync('exercises', { source: 'seed' })).toBe(false);
    expect(shouldSync('exercises', { source: 'custom' })).toBe(true);
    expect(shouldSync('workouts', {})).toBe(true);
  });
});

describe('programme v2 et montée de version', () => {
  it('Jambes : hip thrust 4×10 à la place de la presse, qui reste au catalogue ; Dos finit par un superset', async () => {
    const jambes = await db.programs.get(PROG.jambes);
    const ids = jambes!.blocks.flatMap((b) => (b.kind === 'serie' ? [b.exerciseId] : []));
    expect(ids).toContain(exId('hip-thrust'));
    expect(ids).not.toContain(exId('presse-cuisses'));
    expect(jambes!.blocks.find((b) => b.kind === 'serie' && b.exerciseId === exId('hip-thrust'))).toMatchObject({ sets: 4, target: '10' });
    expect(await db.exercises.get(exId('presse-cuisses'))).toBeDefined();

    const dos = await db.programs.get(PROG.dos);
    const sup = dos!.blocks.filter((b) => b.kind === 'serie' && b.superset);
    expect(sup.map((b) => b.kind === 'serie' && [b.exerciseId, b.sets, b.target])).toEqual([
      [exId('curl-marteau'), 4, '12'], [exId('curl-banc-incline'), 4, '12'],
    ]);
  });

  it('v3 — Bras : haltères au front à la place de la barre (qui reste au catalogue), superset extension triceps poulie + curl haltères à la fin', async () => {
    const bras = await db.programs.get(PROG.bras);
    const series = bras!.blocks.flatMap((b) => (b.kind === 'serie' ? [b] : []));
    expect(series.map((b) => b.exerciseId)).toContain(exId('halteres-au-front'));
    expect(series.map((b) => b.exerciseId)).not.toContain(exId('barre-au-front'));
    expect(await db.exercises.get(exId('barre-au-front'))).toBeDefined();
    expect(series.slice(-2).map((b) => [b.exerciseId, b.superset, b.restSec])).toEqual([
      [exId('extension-triceps-poulie'), 1, 0], [exId('curl-halteres'), 1, 90],
    ]);
  });

  it("remet à jour une séance type d'origine périmée, sans toucher aux séances ni exercices perso", async () => {
    const perso = { id: 'perso', name: 'Mon exo', kind: 'charge' as const, groups: ['dos' as const], source: 'custom' as const, updatedAt: 5 };
    await db.exercises.put(perso);
    const pecs = await db.programs.get(PROG.pecs);
    await db.programs.put({ ...pecs!, name: 'Pecs perso', source: 'custom', updatedAt: 7 });
    await db.programs.put({ ...(await db.programs.get(PROG.jambes))!, blocks: [], updatedAt: 3 }); // ancienne version
    await db.meta.put({ key: 'trainingSeedVersion', value: 1 });
    const dos = await db.programs.get(PROG.dos);

    await initDb();
    const jambes = await db.programs.get(PROG.jambes);
    expect(jambes!.blocks).toEqual(SEED_PROGRAMS.find((p) => p.id === PROG.jambes)!.blocks);
    // Sans horodatage : face au serveur, c'est la synchro qui tranche (voir sync-artefact.test.ts).
    expect(jambes!.updatedAt).toBeUndefined();
    expect(await db.programs.get(PROG.dos)).toEqual(dos); // déjà à jour : pas réécrite
    expect(await db.programs.get(PROG.pecs)).toMatchObject({ name: 'Pecs perso', source: 'custom', updatedAt: 7 });
    expect(await db.exercises.get('perso')).toEqual(perso);
    expect((await db.meta.get('trainingSeedVersion'))!.value).toBe(SEED_TRAINING_VERSION);
  });

  it("recettes de départ : horodatées à la montée de version, pas à la création (la copie du serveur l'emporte)", async () => {
    expect((await db.recipes.toArray()).every((r) => r.updatedAt === undefined)).toBe(true);
    await db.meta.put({ key: 'recipeSeedVersion', value: 0 });
    const avant = Date.now();
    await initDb();
    const recettes = await db.recipes.toArray();
    expect(recettes.length).toBeGreaterThan(0);
    expect(recettes.every((r) => (r.updatedAt ?? 0) >= avant)).toBe(true);
  });
});
