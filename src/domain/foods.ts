import type { FoodItem, Macros, Recipe } from './types';

export const EMPTY_MACROS: Macros = { cal: 0, p: 0, g: 0, l: 0, fib: 0 };

const r1 = (n: number) => Math.round(n * 10) / 10;

/** Convertit une quantité saisie (pièces, g, ml) en grammes. */
export function toGrams(food: Pick<FoodItem, 'pcs'>, qty: number): number {
  return food.pcs ? qty * food.pcs : qty;
}

/** Macros pour une quantité donnée. */
export function calcMacros(food: Macros & Pick<FoodItem, 'pcs'>, qty: number): Macros {
  const ratio = toGrams(food, qty) / 100;
  return {
    cal: Math.round(food.cal * ratio),
    p: r1(food.p * ratio),
    g: r1(food.g * ratio),
    l: r1(food.l * ratio),
    fib: r1((food.fib ?? 0) * ratio),
  };
}

export function sumMacros(list: Macros[]): Macros {
  return list.reduce(
    (acc, m) => ({
      cal: acc.cal + m.cal,
      p: r1(acc.p + m.p),
      g: r1(acc.g + m.g),
      l: r1(acc.l + m.l),
      fib: r1(acc.fib + (m.fib ?? 0)),
    }),
    { ...EMPTY_MACROS },
  );
}

/** Valeurs montrées par le formulaire d'aliment : par pièce pour un aliment compté, sinon pour 100 g. */
export function formValues(food: Macros & Pick<FoodItem, 'pcs'>): Macros {
  const k = food.pcs ? food.pcs / 100 : 1;
  const r2 = (n: number) => Math.round(n * k * 100) / 100;
  return { cal: r2(food.cal), p: r2(food.p), g: r2(food.g), l: r2(food.l), fib: r2(food.fib ?? 0) };
}

/** Inverse de formValues : ramène des valeurs saisies par pièce (si `pcs`) à 100 g. */
export function valuesPer100(m: Macros, pcs?: number): Macros {
  const k = pcs ? 100 / pcs : 1;
  return { cal: Math.round(m.cal * k), p: r1(m.p * k), g: r1(m.g * k), l: r1(m.l * k), fib: r1(m.fib * k) };
}

export function scaleMacros(m: Macros, factor: number): Macros {
  return { cal: Math.round(m.cal * factor), p: r1(m.p * factor), g: r1(m.g * factor), l: r1(m.l * factor), fib: r1(m.fib * factor) };
}

export function qtyLabel(food: Pick<FoodItem, 'pcs' | 'pcsLabel' | 'dry' | 'dryNote' | 'unit'>, qty: number): string {
  if (food.pcs) {
    const label = food.pcsLabel ?? 'pièce';
    // Pas de « s » ajouté à un libellé qui finit déjà par s ou x (« c.à.s », « noix »).
    return `${fmtQty(qty)} ${label}${qty > 1 && !/[sx]$/i.test(label) ? 's' : ''}`;
  }
  if (food.dry) return `${fmtQty(qty)}g sec › ${Math.round(qty * food.dry)}g ${food.dryNote ?? 'cuit'}`;
  return `${fmtQty(qty)}${food.unit === 'ml' ? 'ml' : 'g'}`;
}

export function fmtQty(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10);
}

export function qtyPlaceholder(food: Pick<FoodItem, 'pcs' | 'pcsLabel' | 'dry' | 'unit'>): string {
  if (food.pcs) return `Nombre de ${food.pcsLabel ?? 'pièces'}s`;
  if (food.dry) return 'Poids sec (g)';
  return food.unit === 'ml' ? 'Quantité (ml)' : 'Quantité (g)';
}

/** Macros d'une recette entière et par portion. */
export function recipeMacros(recipe: Recipe): { total: Macros; perServing: Macros } {
  const total = sumMacros(recipe.items.map((i) => i.macros));
  const perServing = scaleMacros(total, 1 / Math.max(1, recipe.servings));
  return { total, perServing };
}

export function normalize(s: string): string {
  return s
    .toLowerCase()
    // Ligatures non décomposées par NFD : « bœuf » doit trouver « boeuf ».
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();
}

/** Recherche tolérante : chaque mot de la requête doit apparaître. */
export function matchesQuery(name: string, query: string): boolean {
  const n = normalize(name);
  return normalize(query)
    .split(/\s+/)
    .filter(Boolean)
    .every((w) => n.includes(w));
}
