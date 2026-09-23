import type { FoodItem, Macros, Meal, Recipe } from './types';
import { normalize, recipeMacros } from './foods';

/**
 * Aliment tel que le renvoie le chat IA : soit une référence au catalogue de
 * l'utilisateur, soit un aliment nouveau décrit par ses valeurs pour 100 g.
 */
export interface AiFood {
  /** Référence du catalogue (« a12 » aliment, « r1 » recette) ou chaîne vide. */
  ref: string;
  /** Nom court, sans quantité. */
  name: string;
  /** Marque, ou chaîne vide. */
  brand: string;
  meal: Meal;
  /** Quantité consommée en g (ou ml) ; poids sec pour un aliment du catalogue en poids sec. */
  grams: number;
  unit: 'g' | 'ml';
  /** Nombre de pièces (ou de portions d'une recette) quand l'utilisateur compte ainsi, sinon 0. */
  pieces: number;
  /** Nom d'une pièce au singulier, ou chaîne vide. */
  pieceLabel: string;
  /** Valeurs pour 100 g (ou 100 ml). */
  per100: Macros;
}

export type CatalogItem = { kind: 'food'; food: FoodItem } | { kind: 'recipe'; recipe: Recipe };

export interface Catalog {
  /** Une ligne par aliment ou recette, envoyée à l'IA. */
  text: string;
  refs: Map<string, CatalogItem>;
}

export type AiResolved =
  | { kind: 'food'; food: FoodItem; qty: number; meal: Meal }
  | { kind: 'recipe'; recipe: Recipe; servings: number; meal: Meal };

export interface AiResolution {
  items: AiResolved[];
  /** Aliments perso créés pour l'occasion, à enregistrer avec les entrées. */
  created: FoodItem[];
  /** Entrées inutilisables (quantité ou valeurs manquantes). */
  skipped: number;
}

const r1 = (n: number) => Math.round(n * 10) / 10;
const fmt = (n: number) => String(r1(n));

/** Clé de rapprochement : mots du nom et de la marque, sans accents, ordre et ponctuation ignorés. */
export function foodKey(name: string, brand = ''): string {
  const words = normalize(`${name} ${brand}`).split(/[^a-z0-9]+/).filter(Boolean);
  return [...new Set(words)].sort().join(' ');
}

function foodLine(ref: string, f: FoodItem): string {
  const name = f.brand && !normalize(f.name).includes(normalize(f.brand)) ? `${f.name} (${f.brand})` : f.name;
  const per = f.unit === 'ml' ? '100 ml' : '100 g';
  const unit = f.pcs ? `pièce : 1 ${f.pcsLabel ?? 'pièce'} = ${fmt(f.pcs)} g` : f.dry ? 'g, poids sec' : f.unit === 'ml' ? 'ml' : 'g';
  return `${ref} | ${name} | ${Math.round(f.cal)} kcal P${fmt(f.p)} G${fmt(f.g)} L${fmt(f.l)} pour ${per} | ${unit}`;
}

function recipeLine(ref: string, r: Recipe): string {
  const m = recipeMacros(r).perServing;
  return `${ref} | ${r.name} | recette, 1 portion = ${m.cal} kcal P${fmt(m.p)} G${fmt(m.g)} L${fmt(m.l)} | portions (${r.servings} par recette)`;
}

/** Catalogue compact des aliments et recettes de l'utilisateur, avec des références courtes. */
export function buildCatalog(foods: FoodItem[], recipes: Recipe[]): Catalog {
  const refs = new Map<string, CatalogItem>();
  const lines: string[] = [];
  // Ordre déterministe : le texte reste identique tant que la base ne change pas (le prompt reste en cache) ;
  // un aliment ajouté le modifie et renumérote les suivants.
  const sortedFoods = [...foods].sort((a, b) => a.category.localeCompare(b.category, 'fr') || a.name.localeCompare(b.name, 'fr') || a.id.localeCompare(b.id));
  sortedFoods.forEach((food, i) => {
    const ref = `a${i + 1}`;
    refs.set(ref, { kind: 'food', food });
    lines.push(foodLine(ref, food));
  });
  const sortedRecipes = recipes.filter((r) => r.items.length > 0).sort((a, b) => a.name.localeCompare(b.name, 'fr') || a.id.localeCompare(b.id));
  sortedRecipes.forEach((recipe, i) => {
    const ref = `r${i + 1}`;
    refs.set(ref, { kind: 'recipe', recipe });
    lines.push(recipeLine(ref, recipe));
  });
  return { text: lines.join('\n'), refs };
}

/** Quantité dans l'unité de l'aliment : pièces pour un aliment compté, sinon g ou ml. */
function qtyFor(food: FoodItem, e: AiFood): number | null {
  if (food.pcs) {
    if (e.pieces > 0) return r1(e.pieces);
    return e.grams > 0 ? r1(e.grams / food.pcs) || null : null;
  }
  return e.grams > 0 ? r1(e.grams) || null : null;
}

/**
 * L'IA recopie dans per100 les valeurs de l'aliment qu'elle référence : un écart grossier
 * trahit une référence erronée (ligne voisine du catalogue, numéro inventé).
 */
function refMatches(food: FoodItem, m: Macros): boolean {
  if (!Number.isFinite(m.cal)) return true; // rien à comparer : on garde la référence
  const diff = Math.abs(m.cal - food.cal);
  return diff <= 60 || diff <= 0.35 * food.cal;
}

function validPer100(m: Macros | undefined): m is Macros {
  if (!m) return false;
  const values = [m.cal, m.p, m.g, m.l, m.fib];
  return values.every((v) => Number.isFinite(v) && v >= 0) && m.cal <= 950 && m.p + m.g + m.l <= 105;
}

function newAiFood(e: AiFood, now: number, newId: () => string): { food: FoodItem; qty: number } | null {
  const name = e.name.replace(/\s+/g, ' ').trim();
  if (!name || !(e.grams > 0) || !validPer100(e.per100)) return null;
  const pieces = e.pieces > 0 ? r1(e.pieces) : 0;
  const pcs = pieces ? r1(e.grams / pieces) : 0;
  // Un poids de pièce absurde trahit une confusion entre pièces et grammes.
  if (pieces && (pcs < 0.5 || pcs > 2000)) return null;
  const m = e.per100;
  const food: FoodItem = {
    id: newId(),
    name,
    category: 'Perso',
    unit: pcs ? 'pcs' : e.unit === 'ml' ? 'ml' : 'g',
    cal: Math.round(m.cal),
    p: r1(m.p),
    g: r1(m.g),
    l: r1(m.l),
    fib: r1(m.fib),
    source: 'ai',
    favorite: false,
    createdAt: now,
    toReview: true,
  };
  // Champs optionnels ajoutés seulement s'ils existent : pas de clé à undefined.
  const brand = e.brand.trim();
  if (brand) food.brand = brand;
  if (pcs) {
    food.pcs = pcs;
    food.pcsLabel = e.pieceLabel.trim() || 'pièce';
    food.quickQty = [...new Set([1, 2, pieces])].sort((a, b) => a - b);
  }
  return { food, qty: pcs ? pieces : r1(e.grams) };
}

/**
 * Traduit les aliments renvoyés par l'IA en entrées reliées à la base :
 * référence du catalogue (si ses valeurs concordent avec celles recopiées par
 * l'IA), sinon aliment existant du même nom, sinon aliment perso créé (source
 * « ai », à vérifier). Un même aliment nouveau cité deux fois dans la réponse
 * n'est créé qu'une fois.
 */
export function resolveAiFoods(list: AiFood[], catalog: Catalog, foods: FoodItem[], opts: { now: number; newId: () => string }): AiResolution {
  const pool = [...foods];
  const items: AiResolved[] = [];
  const created: FoodItem[] = [];
  let skipped = 0;
  for (const e of list) {
    const hit = catalog.refs.get(e.ref.trim().toLowerCase());
    if (hit?.kind === 'recipe') {
      // Une recette se compte en portions : un poids seul ne se convertit pas (aucun poids total connu).
      if (e.pieces > 0 || !(e.grams > 0)) items.push({ kind: 'recipe', recipe: hit.recipe, servings: e.pieces > 0 ? r1(e.pieces) : 1, meal: e.meal });
      else skipped++;
      continue;
    }
    const byRef = hit?.kind === 'food' && refMatches(hit.food, e.per100) ? hit.food : undefined;
    const key = foodKey(e.name, e.brand);
    const known = byRef ?? (key ? pool.find((f) => foodKey(f.name, f.brand) === key) : undefined);
    if (known) {
      const qty = qtyFor(known, e);
      if (qty) items.push({ kind: 'food', food: known, qty, meal: e.meal });
      else skipped++;
      continue;
    }
    const fresh = newAiFood(e, opts.now, opts.newId);
    if (!fresh) {
      skipped++;
      continue;
    }
    pool.push(fresh.food);
    created.push(fresh.food);
    items.push({ kind: 'food', food: fresh.food, qty: fresh.qty, meal: e.meal });
  }
  return { items, created, skipped };
}
