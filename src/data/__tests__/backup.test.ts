import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, initDb } from '../db';
import { exportBackup, importBackup } from '../backup';
import { addEntries, entriesForDate, entryFromFood, allFoods, upsertWeight, allWeights, copyEntries, recentFoods, updateSettings, getSettings } from '../repos';

beforeEach(async () => {
  await db.delete();
  await db.open();
  await initDb();
});

describe('initDb', () => {
  it('crée les réglages et le seed', async () => {
    const foods = await allFoods();
    expect(foods.length).toBeGreaterThan(50);
    expect((await getSettings()).profile.weight).toBe(90);
  });
  it('ré-applique le seed sans perdre les favoris', async () => {
    const foods = await allFoods();
    await db.foods.put({ ...foods[0], favorite: true });
    await db.meta.put({ key: 'seedVersion', value: 0 });
    await initDb();
    expect((await db.foods.get(foods[0].id))?.favorite).toBe(true);
  });
});

describe('journal', () => {
  it('ajoute, liste et copie', async () => {
    const foods = await allFoods();
    const egg = foods.find((f) => f.name === 'Oeuf entier')!;
    await addEntries([entryFromFood(egg, 2, '2026-09-10', 'breakfast')]);
    const list = await entriesForDate('2026-09-10');
    expect(list).toHaveLength(1);
    expect(list[0].cal).toBe(186);
    expect(list[0].qtyLabel).toBe('2 oeufs');
    expect(await copyEntries('2026-09-10', '2026-09-11')).toBe(1);
    expect(await entriesForDate('2026-09-11')).toHaveLength(1);
    expect((await recentFoods())[0].id).toBe(egg.id);
  });
});

describe('backup', () => {
  it('export puis import replace restaure tout', async () => {
    const foods = await allFoods();
    await addEntries([entryFromFood(foods[0], 100, '2026-09-10', 'lunch')]);
    await upsertWeight('2026-09-10', 89.4);
    await updateSettings({ apiKey: 'sk-test' });
    const json = await exportBackup();

    await db.delete();
    await db.open();
    await initDb();
    expect(await entriesForDate('2026-09-10')).toHaveLength(0);

    const s = await importBackup(json, 'replace');
    expect(s.entries).toBe(1);
    expect(await entriesForDate('2026-09-10')).toHaveLength(1);
    expect((await allWeights())[0].kg).toBe(89.4);
    expect((await getSettings()).apiKey).toBe('sk-test');
  });
  it('rejette un fichier invalide', async () => {
    await expect(importBackup('{"app":"other"}', 'replace')).rejects.toThrow();
  });
});
