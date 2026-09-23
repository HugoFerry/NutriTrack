import { describe, expect, it } from 'vitest';
import { buildCatalog, foodKey, resolveAiFoods, type AiFood } from '../aiFoods';
import { matchesQuery } from '../foods';
import type { FoodItem, Recipe } from '../types';

const food = (over: Partial<FoodItem> & Pick<FoodItem, 'id' | 'name'>): FoodItem => ({
  category: 'Protéines', unit: 'g', cal: 100, p: 10, g: 5, l: 2, fib: 0, source: 'seed', favorite: false, createdAt: 0, ...over,
});
const pates = food({ id: 'seed:pates-sec', name: 'Pâtes (poids sec)', category: 'Féculents', cal: 350, p: 12, g: 72, l: 1.5, fib: 3, dry: 2.2, dryNote: 'cuites' });
const oeuf = food({ id: 'seed:oeuf', name: 'Oeuf entier', cal: 155, p: 13, g: 1.1, l: 11, unit: 'pcs', pcs: 60, pcsLabel: 'oeuf' });
const lait = food({ id: 'seed:lait', name: "Lait d'avoine", category: 'Laitiers', unit: 'ml', cal: 45, p: 1, g: 6.5, l: 1.5 });
const tarte: Recipe = {
  id: 'r:tarte', name: 'Tarte au thon', servings: 6, createdAt: 0, favorite: true,
  items: [{ foodId: 'x', name: 'x', qty: 1, macros: { cal: 2712, p: 120, g: 100, l: 200, fib: 6 } }],
};

// Valeurs absentes par défaut (NaN), comme dans une réponse incomplète : une référence est alors suivie telle quelle.
const ai = (over: Partial<AiFood>): AiFood => ({
  ref: '', name: '', brand: '', meal: 'lunch', grams: 0, unit: 'g', pieces: 0, pieceLabel: '', per100: { cal: NaN, p: NaN, g: NaN, l: NaN, fib: 0 }, ...over,
});
let n = 0;
const opts = { now: 1000, newId: () => `id${++n}` };
const empty = buildCatalog([], []);

describe('buildCatalog', () => {
  it('références courtes, ordre stable et unités lisibles', () => {
    const c = buildCatalog([oeuf, pates, lait], [tarte]);
    expect([...c.refs.keys()]).toEqual(['a1', 'a2', 'a3', 'r1']);
    expect(c.refs.get('a1')).toEqual({ kind: 'food', food: pates });
    expect(c.text).toContain('a1 | Pâtes (poids sec) | 350 kcal P12 G72 L1.5 pour 100 g | g, poids sec');
    expect(c.text).toContain("a2 | Lait d'avoine | 45 kcal P1 G6.5 L1.5 pour 100 ml | ml");
    expect(c.text).toContain('a3 | Oeuf entier | 155 kcal P13 G1.1 L11 pour 100 g | pièce : 1 oeuf = 60 g');
    expect(c.text).toContain('r1 | Tarte au thon | recette, 1 portion = 452 kcal');
  });
  it('ignore les recettes vides', () => {
    expect(buildCatalog([], [{ ...tarte, items: [] }]).refs.size).toBe(0);
  });
});

describe('resolveAiFoods', () => {
  it("référence au catalogue : l'aliment de la base et sa quantité, sans création", () => {
    const c = buildCatalog([pates, oeuf], []);
    const r = resolveAiFoods([ai({ ref: 'a1', name: 'Pâtes sèches', grams: 152 }), ai({ ref: 'A2', name: 'Oeufs', pieces: 2, grams: 120 })], c, [pates, oeuf], opts);
    expect(r.created).toEqual([]);
    expect(r.items).toEqual([
      { kind: 'food', food: pates, qty: 152, meal: 'lunch' },
      { kind: 'food', food: oeuf, qty: 2, meal: 'lunch' },
    ]);
  });

  it('aliment compté sans nombre de pièces : converti depuis les grammes', () => {
    const r = resolveAiFoods([ai({ ref: 'a1', grams: 90 })], buildCatalog([oeuf], []), [oeuf], opts);
    expect(r.items[0]).toMatchObject({ food: oeuf, qty: 1.5 });
  });

  it('référence à une recette : nombre de portions, 1 par défaut', () => {
    const c = buildCatalog([], [tarte]);
    const r = resolveAiFoods([ai({ ref: 'r1', name: 'Tarte au thon', pieces: 2, meal: 'dinner' }), ai({ ref: 'r1', name: 'Tarte au thon' })], c, [], opts);
    expect(r.items).toEqual([
      { kind: 'recipe', recipe: tarte, servings: 2, meal: 'dinner' },
      { kind: 'recipe', recipe: tarte, servings: 1, meal: 'lunch' },
    ]);
  });

  it('sans référence, retrouve un aliment existant par son nom (accents, ligature, marque, ordre des mots)', () => {
    const boulettes = food({ id: 'perso1', name: 'Boulettes de boeuf', brand: 'Picard', source: 'ai', unit: 'pcs', pcs: 25, pcsLabel: 'boulette', cal: 215 });
    const r = resolveAiFoods([ai({ name: 'Boulettes de bœuf Picard', pieces: 9, grams: 225, per100: { cal: 199, p: 15, g: 5, l: 13, fib: 0 } })], empty, [boulettes], opts);
    expect(r.created).toEqual([]);
    expect(r.items[0]).toMatchObject({ food: boulettes, qty: 9 });
  });

  it('aliment nouveau : créé en perso, à vérifier, avec ses valeurs pour 100 g', () => {
    const r = resolveAiFoods([ai({ name: ' Éclair  au chocolat ', grams: 100, per100: { cal: 262, p: 5.4, g: 32.6, l: 12.1, fib: 1.2 } })], empty, [], { now: 42, newId: () => 'nouveau' });
    expect(r.created).toEqual([
      { id: 'nouveau', name: 'Éclair au chocolat', category: 'Perso', unit: 'g', cal: 262, p: 5.4, g: 32.6, l: 12.1, fib: 1.2, source: 'ai', favorite: false, createdAt: 42, toReview: true },
    ]);
    expect(r.items).toEqual([{ kind: 'food', food: r.created[0], qty: 100, meal: 'lunch' }]);
  });

  it("aliment nouveau compté en pièces : poids d'une pièce déduit, doublons de la réponse fusionnés", () => {
    const per100 = { cal: 199, p: 15, g: 5, l: 12.9, fib: 0 };
    const r = resolveAiFoods([
      ai({ name: 'Boulettes de bœuf', brand: 'Picard', pieces: 12, pieceLabel: 'boulette', grams: 240, per100 }),
      ai({ name: 'boulettes de boeuf picard', pieces: 3, grams: 60, meal: 'snack', per100 }),
    ], empty, [], opts);
    expect(r.created).toHaveLength(1);
    expect(r.created[0]).toMatchObject({ brand: 'Picard', unit: 'pcs', pcs: 20, pcsLabel: 'boulette', quickQty: [1, 2, 12] });
    expect(r.items.map((i) => (i.kind === 'food' ? i.qty : null))).toEqual([12, 3]);
  });

  it("référence qui ne concorde pas avec les valeurs recopiées : ignorée au profit du nom, sinon d'un aliment à vérifier", () => {
    const beurre = food({ id: 'seed:beurre', name: 'Beurre doux', category: 'Matières grasses', cal: 717, p: 0.7, g: 0.6, l: 81 });
    const riz = food({ id: 'seed:riz', name: 'Riz blanc cuit', category: 'Féculents', cal: 130, p: 2.7, g: 28, l: 0.3 });
    const c = buildCatalog([beurre, riz], []); // a1 = riz, a2 = beurre
    const rizLike = { cal: 130, p: 2.7, g: 28, l: 0.3, fib: 0.4 };
    const r = resolveAiFoods([
      ai({ ref: 'a2', name: 'Riz blanc cuit', grams: 150, per100: rizLike }),
      ai({ ref: 'a2', name: 'Riz basmati cuit', grams: 150, per100: rizLike }),
      ai({ ref: 'a1', name: 'Riz', grams: 100, per100: { ...rizLike, cal: 140 } }),
    ], c, [beurre, riz], opts);
    expect(r.items[0]).toMatchObject({ food: riz, qty: 150 });
    expect(r.created).toHaveLength(1);
    expect(r.created[0]).toMatchObject({ name: 'Riz basmati cuit', cal: 130, toReview: true });
    expect(r.items[2]).toMatchObject({ food: riz, qty: 100 });
  });

  it('recette référencée avec un poids mais sans nombre de portions : ignorée plutôt que comptée 1 portion', () => {
    const r = resolveAiFoods([ai({ ref: 'r1', name: 'Tarte au thon', grams: 300 })], buildCatalog([], [tarte]), [], opts);
    expect(r).toEqual({ items: [], created: [], skipped: 1 });
  });

  it("poids de pièce absurde (pièces et grammes inversés) : l'aliment n'est pas créé", () => {
    const r = resolveAiFoods([ai({ name: 'Boulettes', pieces: 240, grams: 12, per100: { cal: 199, p: 15, g: 5, l: 13, fib: 0 } })], empty, [], opts);
    expect(r).toEqual({ items: [], created: [], skipped: 1 });
  });

  it('ignore les entrées inutilisables, référence inconnue comprise', () => {
    const r = resolveAiFoods([
      ai({ name: 'Sans poids', per100: { cal: 100, p: 1, g: 1, l: 1, fib: 0 } }),
      ai({ ref: 'a99', name: 'Valeurs absurdes', grams: 50, per100: { cal: 2000, p: 1, g: 1, l: 1, fib: 0 } }),
      ai({ name: 'Valeurs manquantes', grams: 50, per100: { cal: Number.NaN, p: 1, g: 1, l: 1, fib: 0 } }),
    ], empty, [], opts);
    expect(r).toEqual({ items: [], created: [], skipped: 3 });
  });
});

describe('foodKey', () => {
  it('insensible aux accents, ligatures, ponctuation et ordre des mots', () => {
    expect(foodKey('Boulettes de bœuf', 'Picard')).toBe(foodKey('Picard : boulettes de BOEUF'));
    expect(foodKey('Boulettes de bœuf')).not.toBe(foodKey('Boulettes de bœuf', 'Picard'));
  });
  it('la recherche trouve « bœuf » en tapant « boeuf »', () => {
    expect(matchesQuery('Boulettes de bœuf', 'boeuf')).toBe(true);
  });
});
