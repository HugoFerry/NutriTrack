import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, initDb } from '../db';

beforeEach(async () => {
  await db.delete();
  await db.open();
  await initDb();
});

describe('recettes de départ', () => {
  it("un shaker resté sur d'anciens aliments (cas réel du 28/09) reprend la composition actuelle, sans perdre nom, portions ni favori", async () => {
    const r = (await db.recipes.get('seed-recipe:shaker'))!;
    const ancien = [
      { ...r.items[0], foodId: 'seed:proteines-whey-proteine', name: 'Whey protéine · 1 scoop' },
      ...r.items.slice(1, 2),
      { ...r.items[2], foodId: 'seed:supplements-collagene', name: 'Collagène · 1 dose' },
      ...r.items.slice(3),
    ];
    await db.recipes.put({ ...r, name: 'Mon shaker du matin', favorite: false, servings: 1, items: ancien, updatedAt: 1000 });

    await initDb();
    const apres = (await db.recipes.get('seed-recipe:shaker'))!;
    expect(apres.items.map((i) => i.foodId)).toContain('seed:proteines-whey-isolat-nutripure');
    expect(apres.items.map((i) => i.foodId)).toContain('seed:supplements-peptides-de-collagene-nutripure');
    expect(apres.items.find((i) => i.foodId === 'seed:proteines-whey-isolat-nutripure')).toMatchObject({ qty: 1, macros: { cal: 114, p: 26.1 } });
    expect([apres.name, apres.favorite, apres.updatedAt]).toEqual(['Mon shaker du matin', false, undefined]); // sans horodatage : la synchro tranche
  });

  it("une recette dont tous les aliments existent n'est pas touchée (quantités de l'utilisateur gardées)", async () => {
    const r = (await db.recipes.get('seed-recipe:shaker'))!;
    await db.recipes.put({ ...r, items: r.items.map((i) => ({ ...i, qty: i.qty * 2 })), updatedAt: 1000 });
    const avant = await db.recipes.get('seed-recipe:shaker');
    await initDb();
    expect(await db.recipes.get('seed-recipe:shaker')).toEqual(avant);
  });
});
