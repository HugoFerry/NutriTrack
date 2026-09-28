import { describe, expect, it } from 'vitest';
import { defaultMix, fromInput, inputUnit, mixHints, mixLabel, mixMacros, startMix, toInput, type MixFood } from '../recipeMix';
import type { Recipe } from '../types';

// Ingrédients du shaker, valeurs de la base (pour 100 g / 100 ml).
const whey: MixFood = { id: 'whey', name: 'Whey isolat Nutripure', unit: 'pcs', pcs: 30, cal: 380, p: 87, g: 3, l: 1.8, fib: 0 };
const avoine: MixFood = { id: 'avoine', name: "Flocons d'avoine", unit: 'g', cal: 372, p: 13, g: 60, l: 7, fib: 10 };
const lait: MixFood = { id: 'lait', name: "Lait d'avoine", unit: 'ml', cal: 46, p: 1, g: 6.6, l: 1.5, fib: 0.8 };
const banane: MixFood = { id: 'banane', name: 'Banane', unit: 'pcs', pcs: 120, cal: 89, p: 1.1, g: 23, l: 0.3, fib: 2.6 };
const collagene: MixFood = { id: 'collagene', name: 'Peptides de collagène Nutripure', unit: 'pcs', pcs: 10, cal: 360, p: 90, g: 0, l: 0, fib: 0 };
const creatine: MixFood = { id: 'creatine', name: 'Créatine', unit: 'pcs', pcs: 5, cal: 0, p: 0, g: 0, l: 0, fib: 0 };

const shaker: Recipe = {
  id: 'seed-recipe:shaker', name: 'Mon shaker', servings: 1, createdAt: 0, favorite: true,
  items: [
    { foodId: 'whey', name: '', qty: 1, macros: { cal: 0, p: 0, g: 0, l: 0, fib: 0 } },
    { foodId: 'creatine', name: '', qty: 1, macros: { cal: 0, p: 0, g: 0, l: 0, fib: 0 } },
    { foodId: 'collagene', name: '', qty: 1, macros: { cal: 0, p: 0, g: 0, l: 0, fib: 0 } },
    { foodId: 'lait', name: '', qty: 400, macros: { cal: 0, p: 0, g: 0, l: 0, fib: 0 } },
    { foodId: 'avoine', name: '', qty: 50, macros: { cal: 0, p: 0, g: 0, l: 0, fib: 0 } },
    { foodId: 'banane', name: '', qty: 1, macros: { cal: 0, p: 0, g: 0, l: 0, fib: 0 } },
  ],
};
const foods = new Map([whey, avoine, lait, banane, collagene, creatine].map((f) => [f.id, f]));
const withFoods = (items: { foodId: string; qty: number }[]) => items.map((i) => ({ food: foods.get(i.foodId)!, qty: i.qty }));

describe('composition ajustable d’une recette', () => {
  it('saisie en grammes (doses et pièces converties) et en centilitres pour un liquide', () => {
    expect([inputUnit(whey), inputUnit(banane), inputUnit(lait), inputUnit(avoine)]).toEqual(['g', 'g', 'cl', 'g']);
    expect([toInput(whey, 1), toInput(banane, 1), toInput(lait, 400), toInput(creatine, 1)]).toEqual([30, 120, 40, 5]);
    expect([fromInput(whey, 45), fromInput(lait, 30), fromInput(avoine, 60)]).toEqual([1.5, 300, 60]);
  });

  it('composition de départ : la dernière fois pour les ingrédients encore là, sinon la recette ramenée à une portion', () => {
    expect(defaultMix({ ...shaker, servings: 2 })[3]).toEqual({ foodId: 'lait', qty: 200 });
    const last = [{ foodId: 'lait', qty: 300 }, { foodId: 'avoine', qty: 60 }, { foodId: 'retire', qty: 99 }];
    expect(startMix(shaker, last)).toEqual([
      { foodId: 'whey', qty: 1 }, { foodId: 'creatine', qty: 1 }, { foodId: 'collagene', qty: 1 },
      { foodId: 'lait', qty: 300 }, { foodId: 'avoine', qty: 60 }, { foodId: 'banane', qty: 1 },
    ]);
  });

  it('totaux et libellé du shaker de la base : 627 kcal, 46,9 g de protéines', () => {
    const items = withFoods(defaultMix(shaker));
    expect(mixMacros(items)).toEqual({ cal: 627, p: 46.9, g: 84.9, l: 10.4, fib: 11.3 });
    expect(mixLabel(items)).toBe("Whey isolat Nutripure 30 g · Créatine 5 g · Peptides de collagène Nutripure 10 g · Lait d'avoine 40 cl · Flocons d'avoine 50 g · Banane 120 g");
    expect(mixLabel(withFoods([{ foodId: 'whey', qty: 0 }, { foodId: 'lait', qty: 250 }]))).toBe("Lait d'avoine 25 cl");
  });

  it('coups de pouce : baisser ce qui dépasse, monter le plus riche si ça reste raisonnable', () => {
    const items = withFoods(defaultMix(shaker));
    // 12 g de glucides de trop : les flocons (30 g) en apportent le plus → −20 g ; 20 g de protéines à finir → +20 g de whey.
    expect(mixHints(items, { cal: 0, p: 20, g: -12, l: 0, fib: 0 })).toEqual([
      '+20 g de Whey isolat Nutripure pour finir tes protéines',
      "−20 g de Flocons d'avoine pour ne pas dépasser tes glucides",
    ]);
    // Le matin, 150 g de protéines restent : pas de « +170 g de whey ».
    expect(mixHints(items, { cal: 1500, p: 150, g: 200, l: 50, fib: 0 })).toEqual([]);
  });
});
