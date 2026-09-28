import Dexie, { type EntityTable } from 'dexie';
import type { ChatMessage, DayMeta, Exercise, FoodItem, JournalEntry, Program, Recipe, Settings, WeightEntry, Workout } from '../domain/types';
import { DEFAULT_PROFILE } from '../domain/nutrition';
import { SEED_RECIPES, SEED_RECIPES_VERSION, SEED_VERSION, seedFoods, seedId } from './seed';
import { calcMacros, qtyLabel } from '../domain/foods';
import { stableJson } from '../domain/json';
import { SEED_PROGRAMS, SEED_TRAINING_VERSION, seedExercises } from './training-seed';

interface Meta {
  key: string;
  value: number | string;
}

export class NutriDB extends Dexie {
  settings!: EntityTable<Settings, 'id'>;
  foods!: EntityTable<FoodItem, 'id'>;
  recipes!: EntityTable<Recipe, 'id'>;
  entries!: EntityTable<JournalEntry, 'id'>;
  weights!: EntityTable<WeightEntry, 'date'>;
  days!: EntityTable<DayMeta, 'date'>;
  chat!: EntityTable<ChatMessage, 'id'>;
  meta!: EntityTable<Meta, 'key'>;
  exercises!: EntityTable<Exercise, 'id'>;
  programs!: EntityTable<Program, 'id'>;
  workouts!: EntityTable<Workout, 'id'>;

  constructor(name = 'nutritrack') {
    super(name);
    this.version(1).stores({
      settings: 'id',
      foods: 'id, name, category, source, barcode, favorite',
      recipes: 'id, name',
      entries: 'id, date, [date+meal], foodId, createdAt',
      weights: 'date',
      days: 'date',
      chat: 'id, createdAt',
      meta: 'key',
    });
    // v2 : sport (catalogue d'exercices, programme, séances). Les tables de la v1 restent telles quelles.
    this.version(2).stores({
      exercises: 'id, source',
      programs: 'id, order',
      workouts: 'id, date, programId, createdAt',
    });
  }
}

export const DEFAULT_SETTINGS: Settings = {
  id: 'app',
  profile: DEFAULT_PROFILE,
  apiKey: '',
  model: 'claude-opus-5',
  notifications: { weighIn: false, weighInTime: '08:00', journal: false, journalTime: '20:30' },
  useAdaptiveTdee: false,
  waterGoalMl: 2500,
  fiberGoal: 30,
  health: { connected: false, autoTraining: true, importWeight: true, minWorkoutMinutes: 20, lastSync: null },
  onboarded: false,
};

export const db = new NutriDB();

/**
 * Initialise la base : réglages par défaut et aliments de base.
 * Le seed est (ré)appliqué quand sa version change, sans écraser les favoris.
 */
export async function initDb(database: NutriDB = db): Promise<void> {
  let seedChanged = false;
  await database.transaction('rw', database.settings, database.foods, database.meta, async () => {
    const s = await database.settings.get('app');
    if (!s) await database.settings.put(DEFAULT_SETTINGS);
    else await database.settings.put({ ...DEFAULT_SETTINGS, ...s, profile: { ...DEFAULT_PROFILE, ...s.profile }, notifications: { ...DEFAULT_SETTINGS.notifications, ...s.notifications }, health: { ...DEFAULT_SETTINGS.health, ...s.health } });

    const v = await database.meta.get('seedVersion');
    if (!v || Number(v.value) < SEED_VERSION) {
      const existing = await database.foods.where('source').equals('seed').toArray();
      const favs = new Map(existing.map((f) => [f.id, f.favorite]));
      const fresh = seedFoods().map((f) => ({ ...f, favorite: favs.get(f.id) ?? false }));
      await database.foods.bulkPut(fresh);
      const freshIds = new Set(fresh.map((f) => f.id));
      const stale = existing.filter((f) => !freshIds.has(f.id)).map((f) => f.id);
      if (stale.length) await database.foods.bulkDelete(stale);
      await database.meta.put({ key: 'seedVersion', value: SEED_VERSION });
      seedChanged = true;
    }
  });
  await seedRecipes(database);
  await repairSeedRecipes(database);
  if (seedChanged) await refreshRecipeMacros(database);
  await seedTraining(database);
}

/**
 * Catalogue d'exercices de base, (ré)écrit quand SEED_TRAINING_VERSION change (il reste local, hors synchro),
 * puis séances types de départ. Les exercices perso et les séances réalisées ne sont jamais touchés.
 */
async function seedTraining(database: NutriDB): Promise<void> {
  const v = await database.meta.get('trainingSeedVersion');
  if (!v || Number(v.value) < SEED_TRAINING_VERSION) {
    await database.transaction('rw', database.exercises, database.meta, async () => {
      await database.exercises.bulkPut(seedExercises());
      await database.meta.put({ key: 'trainingSeedVersion', value: SEED_TRAINING_VERSION });
    });
  }
  await ensureSeedPrograms(database);
}

const seedContent = (p: Pick<Program, 'name' | 'order' | 'blocks' | 'notDayAfter' | 'onlyAfter'>) =>
  stableJson({ name: p.name, order: p.order, blocks: p.blocks, notDayAfter: p.notDayAfter ?? [], onlyAfter: p.onlyAfter ?? [] });

/**
 * Règle : une séance type d'origine (source « seed ») a toujours le contenu du programme de départ du code ;
 * une séance type modifiée dans l'app (« custom ») n'est jamais touchée.
 * Appelée au démarrage puis, dans la version web, de nouveau après la réconciliation de la synchro :
 * l'écriture du démarrage n'est pas horodatée, donc une séance modifiée sur un autre appareil l'emporte,
 * et une ancienne version d'origine tirée du serveur est remise à jour ici, horodatée et repoussée.
 */
export async function ensureSeedPrograms(database: NutriDB = db): Promise<void> {
  for (const p of SEED_PROGRAMS) {
    const current = await database.programs.get(p.id);
    if (current?.source === 'custom') continue;
    if (current && seedContent(current) === seedContent(p)) continue;
    await database.programs.put({ ...p, source: 'seed', createdAt: current?.createdAt ?? Date.now() });
  }
}

/** Recalcule les macros des recettes à partir des valeurs actuelles des aliments (après édition ou mise à jour). */
export async function refreshRecipeMacros(database: NutriDB = db, onlyFoodId?: string): Promise<void> {
  const recipes = await database.recipes.toArray();
  for (const r of recipes) {
    if (onlyFoodId && !r.items.some((i) => i.foodId === onlyFoodId)) continue;
    let changed = false;
    const items = [];
    for (const it of r.items) {
      const food = it.foodId ? await database.foods.get(it.foodId) : undefined;
      if (!food) { items.push(it); continue; }
      const macros = calcMacros(food, it.qty);
      const name = `${food.name} · ${qtyLabel(food, it.qty)}`;
      if (JSON.stringify(macros) !== JSON.stringify(it.macros) || name !== it.name) changed = true;
      items.push({ ...it, name, macros });
    }
    if (changed) await database.recipes.put({ ...r, items });
  }
}

/** Recettes de départ : créées une fois, jamais réécrites (l'utilisateur peut les modifier ou les supprimer). */
async function seedRecipes(database: NutriDB): Promise<void> {
  const v = await database.meta.get('recipeSeedVersion');
  if (v && Number(v.value) >= SEED_RECIPES_VERSION) return;
  await database.transaction('rw', database.recipes, database.foods, database.meta, async () => {
    for (const r of SEED_RECIPES) {
      const current = await database.recipes.get(r.id);
      // Montée de version : la composition de référence est réécrite (nom, portions et favori de l'utilisateur conservés).
      const items = [];
      for (const it of r.items) {
        const food = await database.foods.get(seedId(it.category, it.food));
        if (!food) continue;
        items.push({ foodId: food.id, name: `${food.name} · ${qtyLabel(food, it.qty)}`, qty: it.qty, macros: calcMacros(food, it.qty) });
      }
      // Recette déjà là (montée de version) : horodatée, sinon la synchro, branchée ensuite, rétablirait l'ancienne
      // composition du serveur. Recette créée (premier lancement sur cet appareil) : sans horodatage, pour que la copie
      // du serveur, peut-être modifiée ou supprimée ailleurs, l'emporte.
      if (items.length) await database.recipes.put({ id: r.id, name: current?.name ?? r.name, items, servings: current?.servings ?? r.servings, createdAt: current?.createdAt ?? Date.now(), favorite: current?.favorite ?? true, ...(current ? { updatedAt: Date.now() } : {}) });
    }
    await database.meta.put({ key: 'recipeSeedVersion', value: SEED_RECIPES_VERSION });
  });
}

/**
 * Une recette de départ dont un ingrédient n'existe plus (aliment de base renommé ou retiré par une montée de
 * version, alors que l'ancienne composition était revenue du serveur) reprend la composition de départ actuelle,
 * en gardant son nom, ses portions et son favori. Sans ça, l'ingrédient disparu ne se modifie plus nulle part.
 * Appelée au démarrage (écriture sans horodatage, la synchro tranche) puis après la réconciliation : une ancienne
 * composition revenue du serveur y est alors réparée, horodatée par les hooks et repoussée.
 */
export async function repairSeedRecipes(database: NutriDB = db): Promise<void> {
  for (const r of SEED_RECIPES) {
    const current = await database.recipes.get(r.id);
    if (!current) continue;
    const found = await database.foods.bulkGet(current.items.map((i) => i.foodId));
    if (found.every(Boolean)) continue;
    const items = [];
    for (const it of r.items) {
      const food = await database.foods.get(seedId(it.category, it.food));
      if (food) items.push({ foodId: food.id, name: `${food.name} · ${qtyLabel(food, it.qty)}`, qty: it.qty, macros: calcMacros(food, it.qty) });
    }
    const { updatedAt: _stamp, ...rest } = current;
    if (items.length) await database.recipes.put({ ...rest, items });
  }
}

export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
