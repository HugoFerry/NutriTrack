import type { ChatMessage, DateKey, DayMeta, FoodItem, JournalEntry, Macros, Meal, Recipe, Settings, WeightEntry } from '../domain/types';
import { calcMacros, qtyLabel, recipeMacros, scaleMacros } from '../domain/foods';
import { db, newId, refreshRecipeMacros } from './db';

// ---------- Réglages ----------
export async function getSettings(): Promise<Settings> {
  return (await db.settings.get('app'))!;
}
export async function updateSettings(patch: Partial<Settings>): Promise<void> {
  const s = await getSettings();
  await db.settings.put({ ...s, ...patch });
}

// ---------- Journal ----------
export function entryFromFood(food: FoodItem, qty: number, date: DateKey, meal: Meal): JournalEntry {
  return {
    id: newId(),
    date,
    meal,
    name: food.name,
    foodId: food.id,
    qty,
    qtyLabel: qtyLabel(food, qty),
    ...calcMacros(food, qty),
    createdAt: Date.now(),
  };
}

export function entryFromRecipe(recipe: Recipe, servings: number, date: DateKey, meal: Meal): JournalEntry {
  const { perServing } = recipeMacros(recipe);
  return {
    id: newId(),
    date,
    meal,
    name: recipe.name,
    recipeId: recipe.id,
    qty: servings,
    qtyLabel: `${servings} portion${servings > 1 ? 's' : ''}`,
    ...scaleMacros(perServing, servings),
    createdAt: Date.now(),
  };
}

export function entryRaw(name: string, macros: Macros, label: string, date: DateKey, meal: Meal): JournalEntry {
  return { id: newId(), date, meal, name, qty: 1, qtyLabel: label, ...macros, createdAt: Date.now() };
}

export async function addEntries(list: JournalEntry[]): Promise<void> {
  await db.entries.bulkAdd(list);
}
export async function updateEntry(e: JournalEntry): Promise<void> {
  await db.entries.put(e);
}
export async function deleteEntry(id: string): Promise<void> {
  await db.entries.delete(id);
}
export async function entriesForDate(date: DateKey): Promise<JournalEntry[]> {
  return db.entries.where('date').equals(date).sortBy('createdAt');
}
export async function entriesBetween(from: DateKey, to: DateKey): Promise<JournalEntry[]> {
  return db.entries.where('date').between(from, to, true, true).toArray();
}
/** Copie les entrées d'un jour (ou d'un repas) vers un autre jour. */
export async function copyEntries(fromDate: DateKey, toDate: DateKey, meal?: Meal): Promise<number> {
  const src = (await entriesForDate(fromDate)).filter((e) => !meal || e.meal === meal);
  const now = Date.now();
  await db.entries.bulkAdd(src.map((e, i) => ({ ...e, id: newId(), date: toDate, createdAt: now + i })));
  return src.length;
}
/** Aliments récemment utilisés (distincts), les plus récents d'abord. */
export async function recentFoods(limit = 20): Promise<FoodItem[]> {
  const recent = await db.entries.orderBy('createdAt').reverse().limit(300).toArray();
  const ids: string[] = [];
  for (const e of recent) if (e.foodId && !ids.includes(e.foodId)) ids.push(e.foodId);
  const foods = await db.foods.bulkGet(ids.slice(0, limit));
  return foods.filter((f): f is FoodItem => !!f);
}
/** Dernière quantité saisie pour un aliment. */
export async function lastQtyFor(foodId: string): Promise<number | null> {
  const e = await db.entries.where('foodId').equals(foodId).reverse().sortBy('createdAt');
  return e[0]?.qty ?? null;
}

// ---------- Aliments ----------
export async function allFoods(): Promise<FoodItem[]> {
  return db.foods.toArray();
}
export async function saveFood(f: FoodItem): Promise<void> {
  await db.foods.put(f);
  await refreshRecipeMacros(db, f.id);
}
export async function deleteFood(id: string): Promise<void> {
  await db.foods.delete(id);
}
export async function toggleFavorite(id: string): Promise<void> {
  const f = await db.foods.get(id);
  if (f) await db.foods.put({ ...f, favorite: !f.favorite });
}
export async function findByBarcode(code: string): Promise<FoodItem | undefined> {
  return db.foods.where('barcode').equals(code).first();
}
export function newFood(partial: Partial<FoodItem> & Pick<FoodItem, 'name' | 'cal' | 'p' | 'g' | 'l'>): FoodItem {
  return {
    id: newId(),
    category: 'Perso',
    unit: 'g',
    fib: 0,
    source: 'custom',
    favorite: false,
    createdAt: Date.now(),
    ...partial,
  };
}

// ---------- Recettes ----------
export async function allRecipes(): Promise<Recipe[]> {
  return db.recipes.toArray();
}
export async function saveRecipe(r: Recipe): Promise<void> {
  await db.recipes.put(r);
}
export async function deleteRecipe(id: string): Promise<void> {
  await db.recipes.delete(id);
}
export function newRecipe(name: string): Recipe {
  return { id: newId(), name, items: [], servings: 1, createdAt: Date.now(), favorite: false };
}

// ---------- Poids ----------
export async function upsertWeight(date: DateKey, kg: number): Promise<void> {
  await db.weights.put({ date, kg, createdAt: Date.now() });
}
export async function deleteWeight(date: DateKey): Promise<void> {
  await db.weights.delete(date);
}
export async function allWeights(): Promise<WeightEntry[]> {
  return db.weights.orderBy('date').toArray();
}

// ---------- Jour ----------
export const EMPTY_DAY = (date: DateKey): DayMeta => ({ date, training: null, waterMl: 0, steps: null, activeKcal: null, workouts: [], note: '' });
export async function getDay(date: DateKey): Promise<DayMeta> {
  return { ...EMPTY_DAY(date), ...(await db.days.get(date)) };
}
export async function updateDay(date: DateKey, patch: Partial<DayMeta>): Promise<void> {
  const d = await getDay(date);
  await db.days.put({ ...d, ...patch, date });
}
export async function daysBetween(from: DateKey, to: DateKey): Promise<DayMeta[]> {
  return db.days.where('date').between(from, to, true, true).toArray();
}

// ---------- Chat ----------
export async function addChat(m: Omit<ChatMessage, 'id' | 'createdAt'>): Promise<ChatMessage> {
  const msg: ChatMessage = { ...m, id: newId(), createdAt: Date.now() };
  await db.chat.add(msg);
  return msg;
}
export async function chatHistory(limit = 60): Promise<ChatMessage[]> {
  const list = await db.chat.orderBy('createdAt').reverse().limit(limit).toArray();
  return list.reverse();
}
export async function clearChat(): Promise<void> {
  await db.chat.clear();
}
