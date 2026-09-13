import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, initDb } from '../db';
import { exportBackup, importBackup } from '../backup';
import { addEntries, entriesForDate, entryFromFood, allFoods, upsertWeight, allWeights, copyEntries, recentFoods, updateSettings, getSettings, saveFood } from '../repos';

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

describe('recettes de départ', () => {
  it('crée « Mon shaker » avec les bons totaux, une seule fois', async () => {
    const r = await db.recipes.get('seed-recipe:shaker');
    expect(r).toBeDefined();
    expect(r!.items).toHaveLength(6);
    const total = r!.items.reduce((s, i) => s + i.macros.cal, 0);
    expect(total).toBeGreaterThan(600);
    expect(total).toBeLessThan(660);
    await db.recipes.delete('seed-recipe:shaker');
    await initDb();
    expect(await db.recipes.get('seed-recipe:shaker')).toBeUndefined();
  });
  it('crée « Tarte au thon » en 6 parts', async () => {
    const r = (await db.recipes.get('seed-recipe:tarte-thon'))!;
    expect(r.items).toHaveLength(4);
    const total = r.items.reduce((s, i) => s + i.macros.cal, 0);
    expect(Math.round(total / r.servings)).toBe(280);
  });
  it('les recettes suivent les aliments modifiés', async () => {
    const r = (await db.recipes.get('seed-recipe:shaker'))!;
    const whey = (await db.foods.get(r.items[0].foodId))!;
    expect(whey.name).toContain('Nutripure');
    expect(r.items[0].macros.cal).toBe(114);
    await saveFood({ ...whey, cal: 400, p: 80 });
    const r2 = (await db.recipes.get('seed-recipe:shaker'))!;
    expect(r2.items[0].macros.cal).toBe(120);
    expect(r2.items[0].macros.p).toBe(24);
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
