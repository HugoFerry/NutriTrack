import type { FoodItem, Macros, Recipe } from './types';
import { calcMacros, fmtQty, sumMacros } from './foods';

/**
 * Composition ajustable d'une recette au moment de la saisir (le shaker du matin, par exemple) :
 * une quantité par ingrédient, saisie dans l'unité qu'on pèse vraiment (grammes, centilitres pour un
 * liquide) plutôt qu'en doses ou en pièces. `qty` reste dans l'unité de l'aliment, comme partout ailleurs.
 */
export interface MixItem {
  foodId: string;
  qty: number;
}

export type MixFood = Pick<FoodItem, 'id' | 'name' | 'unit' | 'pcs' | 'cal' | 'p' | 'g' | 'l' | 'fib'>;
export type InputUnit = 'g' | 'cl' | 'pièce';

/** Unité de saisie : grammes pour un aliment pesé ou compté avec un poids par pièce, centilitres pour un liquide. */
export function inputUnit(f: Pick<FoodItem, 'unit' | 'pcs'>): InputUnit {
  if (f.pcs) return 'g';
  if (f.unit === 'ml') return 'cl';
  if (f.unit === 'pcs') return 'pièce';
  return 'g';
}

/** Quantité de l'aliment (g, ml ou pièces) → valeur affichée dans son unité de saisie. */
export function toInput(f: Pick<FoodItem, 'unit' | 'pcs'>, qty: number): number {
  if (f.pcs) return qty * f.pcs;
  return inputUnit(f) === 'cl' ? qty / 10 : qty;
}

/** Valeur saisie → quantité dans l'unité de l'aliment. */
export function fromInput(f: Pick<FoodItem, 'unit' | 'pcs'>, v: number): number {
  if (f.pcs) return v / f.pcs;
  return inputUnit(f) === 'cl' ? v * 10 : v;
}

/** Composition par défaut : celle de la recette, ramenée à une portion. */
export function defaultMix(recipe: Recipe): MixItem[] {
  const n = Math.max(1, recipe.servings);
  return recipe.items.map((i) => ({ foodId: i.foodId, qty: i.qty / n }));
}

/**
 * Composition de départ : les quantités de la dernière fois pour les ingrédients encore dans la recette,
 * celles de la recette pour les autres (un ingrédient retiré de la recette disparaît).
 */
export function startMix(recipe: Recipe, last?: MixItem[]): MixItem[] {
  return defaultMix(recipe).map((d) => last?.find((l) => l.foodId === d.foodId) ?? d);
}

export function mixMacros(items: { food: MixFood; qty: number }[], fixed?: Macros): Macros {
  return sumMacros([...items.map((i) => calcMacros(i.food, i.qty)), ...(fixed ? [fixed] : [])]);
}

const shown = (f: MixFood, qty: number) => {
  const v = toInput(f, qty);
  return inputUnit(f) === 'cl' ? Math.round(v * 10) / 10 : Math.round(v);
};

/** « Whey isolat Nutripure 35 g · Flocons d'avoine 60 g · Lait d'avoine 30 cl » (ingrédients à zéro omis). */
export function mixLabel(items: { food: MixFood; qty: number }[]): string {
  return items
    .filter((i) => i.qty > 0)
    .map((i) => `${i.food.name} ${fmtQty(shown(i.food, i.qty))} ${inputUnit(i.food) === 'pièce' ? 'pce' : inputUnit(i.food)}`)
    .join(' · ');
}

const MACRO_FR = { p: 'protéines', g: 'glucides' } as const;

/**
 * Coups de pouce pour tomber juste sur le reste du jour, protéines et glucides, en jouant sur l'ingrédient
 * qui en apporte déjà le plus (la whey pour les protéines plutôt que le collagène, protéine incomplète) :
 * - reste dépassé : de combien le baisser ;
 * - reste positif : de combien le monter, si ça tient dans un doublement de sa quantité
 *   (le matin, le reste de la journée entière ne doit pas finir dans le shaker).
 */
export function mixHints(items: { food: MixFood; qty: number }[], remainingAfter: Macros): string[] {
  const hints: string[] = [];
  for (const k of ['p', 'g'] as const) {
    const rem = remainingAfter[k];
    if (Math.abs(rem) < 2) continue;
    // Grammes du nutriment par unité de saisie (valeurs pour 100 g ou 100 ml ; 1 cl = 10 ml).
    const per = (f: MixFood) => (inputUnit(f) === 'cl' ? f[k] / 10 : f[k] / 100);
    const top = [...items].filter((i) => i.qty > 0 && per(i.food) > 0).sort((a, b) => calcMacros(b.food, b.qty)[k] - calcMacros(a.food, a.qty)[k])[0];
    if (!top) continue;
    const s = inputUnit(top.food) === 'g' ? 5 : 1;
    const unit = `${inputUnit(top.food)} de ${top.food.name}`;
    if (rem < 0) {
      const delta = Math.min(shown(top.food, top.qty), Math.ceil(-rem / per(top.food) / s) * s);
      hints.push(`−${fmtQty(delta)} ${unit} pour ne pas dépasser tes ${MACRO_FR[k]}`);
    } else {
      const delta = Math.floor(rem / per(top.food) / s) * s;
      if (delta >= s && delta <= shown(top.food, top.qty)) hints.push(`+${fmtQty(delta)} ${unit} pour finir tes ${MACRO_FR[k]}`);
    }
  }
  return hints;
}
