import type { FoodItem, Macros } from './types';
import { calcMacros } from './foods';

export interface Suggestion {
  kind: 'protein' | 'carb' | 'fat' | 'balanced';
  label: string;
  food: FoodItem;
  qty: number;
  macros: Macros;
}

/** Hash déterministe : les suggestions ne changent pas à chaque re-rendu. */
function seedFrom(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * Propose de quoi compléter la journée avec ce qui reste en macros.
 * `remaining` = cible - consommé. Les aliments déjà loggés sont évités.
 */
export function suggestFoods(remaining: Macros, foods: FoodItem[], loggedNames: Set<string>, seed: string): Suggestion[] {
  if (remaining.cal <= 0) return [];
  const rnd = seedFrom(seed);
  const out: Suggestion[] = [];
  // Les aliments créés par le chat IA (plats, pâtisseries…) ne sont proposés que s'ils sont en favori.
  const pool = foods.filter((f) => !loggedNames.has(f.name) && !f.pcs && f.source !== 'recipe' && (f.source !== 'ai' || f.favorite));

  const tryAdd = (kind: Suggestion['kind'], label: string, need: number, key: 'p' | 'g' | 'l', filter: (f: FoodItem) => boolean, maxQ: number) => {
    if (need <= 5 || remaining.cal < 80) return;
    const cands = pool.filter(filter);
    if (!cands.length) return;
    const pick = cands[(rnd + out.length * 7) % Math.min(3, cands.length)];
    const per = pick[key] / 100 || 1;
    const qty = Math.round(Math.min(need / per, remaining.cal / (pick.cal / 100 || 1), maxQ) / 5) * 5;
    if (qty < 10) return;
    out.push({ kind, label, food: pick, qty, macros: calcMacros(pick, qty) });
  };

  tryAdd('protein', 'Protéines', remaining.p, 'p', (f) => f.p >= 15 && f.cal <= 250, 250);
  tryAdd('carb', 'Glucides', remaining.g, 'g', (f) => f.g >= 20 && f.cal <= 200, 300);
  tryAdd('fat', 'Lipides', remaining.l, 'l', (f) => f.l >= 5 && f.cal <= 700, 60);
  if (!out.length && remaining.cal > 100) {
    const fb = pool.find((f) => f.name.startsWith('Yaourt grec 0%')) ?? pool.find((f) => f.p >= 8 && f.cal <= 100);
    if (fb) out.push({ kind: 'balanced', label: 'Snack', food: fb, qty: 170, macros: calcMacros(fb, 170) });
  }
  return out;
}
