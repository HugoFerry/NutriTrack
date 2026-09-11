import Dexie, { type EntityTable } from 'dexie';
import type { ChatMessage, DayMeta, FoodItem, JournalEntry, Recipe, Settings, WeightEntry } from '../domain/types';
import { DEFAULT_PROFILE } from '../domain/nutrition';
import { SEED_VERSION, seedFoods } from './seed';

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
      await database.meta.put({ key: 'seedVersion', value: SEED_VERSION });
    }
  });
}

export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
