/** Identifiants de niveau d'activité (facteur PAL appliqué au BMR). */
export type ActivityId = 'sedentary' | 'light' | 'moderate' | 'active' | 'extreme';
/** Vitesse de perte : déficit calorique journalier. */
export type DeficitId = 'maintain' | 'slow' | 'moderate' | 'aggressive';
export type Sex = 'male' | 'female';
export type Meal = 'breakfast' | 'lunch' | 'dinner' | 'snack';
export type FoodUnit = 'g' | 'ml' | 'pcs';
export type FoodSource = 'seed' | 'custom' | 'off' | 'ai' | 'recipe';

/** Date locale au format YYYY-MM-DD. */
export type DateKey = string;

export interface Profile {
  weight: number;
  height: number;
  age: number;
  sex: Sex;
  activity: ActivityId;
  deficit: DeficitId;
  /** g de protéines par kg de poids de corps. */
  proteinPerKg: number;
  /** g de lipides par kg de poids de corps. */
  fatPerKg: number;
  /** Jours d'entraînement par défaut (0 = dimanche ... 6 = samedi). */
  trainingDays: number[];
  /** Cyclage des glucides : plus de kcal les jours d'entraînement, moins au repos. */
  carbCycling: boolean;
  /** kcal ajoutées un jour d'entraînement (retirées proportionnellement au repos). */
  trainingBonusKcal: number;
}

export interface Macros {
  cal: number;
  p: number;
  g: number;
  l: number;
  fib: number;
}

/** Aliment de référence : valeurs pour 100 g (ou 100 ml). */
/** Champ commun aux lignes synchronisées (version web) : dernière modification locale. */
export interface Synced {
  updatedAt?: number;
}

export interface FoodItem extends Macros, Synced {
  id: string;
  name: string;
  brand?: string;
  category: string;
  unit: FoodUnit;
  /** Poids en g d'une pièce quand unit = 'pcs'. */
  pcs?: number;
  pcsLabel?: string;
  /** Facteur poids cuit / poids sec (pâtes, riz...). */
  dry?: number;
  dryNote?: string;
  note?: string;
  source: FoodSource;
  barcode?: string;
  favorite: boolean;
  createdAt: number;
  /** Portions rapides proposées à la saisie (en unité de l'aliment). */
  quickQty?: number[];
}

export interface RecipeItem {
  foodId: string;
  name: string;
  qty: number;
  macros: Macros;
}

export interface Recipe extends Synced {
  id: string;
  name: string;
  items: RecipeItem[];
  servings: number;
  createdAt: number;
  favorite: boolean;
}

export interface JournalEntry extends Macros, Synced {
  id: string;
  date: DateKey;
  meal: Meal;
  name: string;
  foodId?: string;
  recipeId?: string;
  /** Quantité saisie dans l'unité de l'aliment. */
  qty: number;
  /** Texte affiché (ex: "80g sec > 176g cuites"). */
  qtyLabel: string;
  createdAt: number;
}

export interface WeightEntry extends Synced {
  date: DateKey;
  kg: number;
  createdAt: number;
  /** 'health' = importée de Health Connect ; absent = saisie manuelle. */
  source?: 'health';
}

export interface WorkoutSummary {
  type: string;
  /** Libellé lisible (ex : Musculation). */
  label: string;
  minutes: number;
  kcal: number;
  source: string;
  start: number;
}

export interface DayMeta extends Synced {
  date: DateKey;
  /** Surcharge manuelle du type de jour ; null = suit le profil (ou les séances importées). */
  training: boolean | null;
  waterMl: number;
  /** Pas importés de Health Connect. */
  steps: number | null;
  /** Calories actives importées de Health Connect. */
  activeKcal: number | null;
  /** Séances importées de Health Connect. */
  workouts: WorkoutSummary[];
  note: string;
}

export interface HealthPrefs {
  /** L'utilisateur a lié Health Connect (permissions demandées au moins une fois). */
  connected: boolean;
  /** Marquer automatiquement un jour comme entraînement s'il contient une séance. */
  autoTraining: boolean;
  /** Importer les pesées (balance connectée) quand aucune pesée manuelle n'existe ce jour-là. */
  importWeight: boolean;
  /** Durée minimale d'une séance pour compter comme entraînement (minutes). */
  minWorkoutMinutes: number;
  lastSync: number | null;
}

export interface ChatMessage extends Synced {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  /** Miniature base64 (data URL) quand une photo a été envoyée. */
  image?: string;
  createdAt: number;
}

export interface NotificationPrefs {
  weighIn: boolean;
  weighInTime: string;
  journal: boolean;
  journalTime: string;
}

export interface Settings extends Synced {
  id: 'app';
  profile: Profile;
  apiKey: string;
  model: string;
  notifications: NotificationPrefs;
  /** Utiliser le TDEE adaptatif (mesuré) pour la cible quand il est disponible. */
  useAdaptiveTdee: boolean;
  waterGoalMl: number;
  fiberGoal: number;
  /** Poids objectif (kg), optionnel. */
  goalWeight?: number;
  health: HealthPrefs;
  onboarded: boolean;
}

export interface DailyTargets extends Macros {
  bmr: number;
  tdeeFormula: number;
  tdee: number;
  isTraining: boolean;
  deficit: number;
}
