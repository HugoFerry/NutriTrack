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
  /**
   * Jours d'entraînement selon les séances enregistrées (onglet Sport, journal) plutôt que selon des jours fixes :
   * à partir de `since`, un jour sans séance est un jour de repos. `perWeek` sert à répartir le cyclage.
   */
  sessionDays?: { perWeek: number; since: DateKey };
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
  /** Créé par le chat IA : valeurs estimées, à confirmer (étiquette, fiche produit). */
  toReview?: boolean;
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
  /** Recette saisie avec sa composition ajustée (quantités dans l'unité de chaque aliment), pour la rouvrir. */
  items?: { foodId: string; qty: number }[];
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

export type ChatChannel = 'nutrition' | 'coach';

export interface ChatMessage extends Synced {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  /** Miniature base64 (data URL) quand une photo a été envoyée. */
  image?: string;
  /** Conversation : nutritionniste ou coach sportif. Absent = nutrition (messages d'avant le coach). */
  channel?: ChatChannel;
  createdAt: number;
}

// ---------- Sport ----------

/** Façon de mesurer un exercice : charge × répétitions, poids du corps, durée, aller-retour, cardio (minutes, km). */
export type ExerciseKind = 'charge' | 'pdc' | 'temps' | 'distance' | 'cardio';
export type MuscleGroup = 'dos' | 'pecs' | 'epaules' | 'biceps' | 'triceps' | 'jambes' | 'abdos' | 'cardio';

export interface Exercise extends Synced {
  id: string;
  name: string;
  kind: ExerciseKind;
  groups: MuscleGroup[];
  /** Unilatéral : les répétitions se comptent par côté. */
  perSide?: boolean;
  source: 'seed' | 'custom';
}

/** Bloc d'une séance type : un exercice en séries, ou un circuit enchaîné plusieurs tours. */
export type ProgramBlock =
  | { kind: 'serie'; exerciseId: string; sets: number; /** « 8 », « 10-12 », « échec », « 1 AR », « 10 D/G » */ target: string; restSec: number; /** Blocs consécutifs de même numéro : superset, enchaînés sans repos entre eux. */ superset?: number }
  | { kind: 'circuit'; rounds: number; items: { exerciseId: string; target: string }[]; /** Effort / récupération par exercice (40/20). */ workSec?: number; /** Repos entre exercices (circuit 40/20) ou en fin de tour. */ restSec?: number };

/** Séance type du programme. */
export interface Program extends Synced {
  id: string;
  name: string;
  order: number;
  blocks: ProgramBlock[];
  /** Règle d'enchaînement : jamais le lendemain de ces séances (ids). */
  notDayAfter?: string[];
  /** Règle d'enchaînement : la séance précédente doit être l'une de celles-ci (ids). */
  onlyAfter?: string[];
  source: 'seed' | 'custom';
  createdAt: number;
}

export interface LoggedSet {
  reps?: number;
  /** Charge, ou lest pour un exercice au poids du corps. */
  kg?: number;
  sec?: number;
  done: boolean;
}

export type WorkoutBlock =
  | { kind: 'serie'; exerciseId: string; target?: string; restSec?: number; superset?: number; sets: LoggedSet[] }
  | { kind: 'circuit'; items: { exerciseId: string; target: string }[]; workSec?: number; restSec?: number; rounds: number; roundsDone: number }
  | { kind: 'cardio'; exerciseId: string; minutes: number; km?: number };

/** Trajet jusqu'à la salle : aller simple dans les réglages, aller-retour sur une séance. */
export interface Commute {
  mode: 'velo' | 'marche';
  km: number;
  minutes: number;
}

/** Tapis incliné après la séance. */
export interface Treadmill {
  minutes: number;
  inclinePct: number;
  speedKmh: number;
}

/** Autour de la séance, hors exercices et hors séance type : trajet, tapis incliné. */
export interface WorkoutExtras {
  commute?: Commute;
  treadmill?: Treadmill;
}

/** Séance réalisée (ou en cours tant que `finishedAt` est absent). */
export interface Workout extends Synced {
  id: string;
  date: DateKey;
  programId?: string;
  name: string;
  blocks: WorkoutBlock[];
  startedAt: number;
  finishedAt?: number;
  durationMin?: number;
  /** Ressenti de 1 (très facile) à 10 (maximal). */
  rpe?: number;
  notes?: string;
  extras?: WorkoutExtras;
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
  /** Trajet habituel jusqu'à la salle (aller simple), coché d'office sur chaque séance. */
  commute?: Commute;
  onboarded: boolean;
}

export interface DailyTargets extends Macros {
  bmr: number;
  tdeeFormula: number;
  tdee: number;
  isTraining: boolean;
  /** Cyclage borné par le métabolisme de base : repos moins réduit, bonus d'entraînement moins élevé. */
  restFloored: boolean;
  /** Jour d'entraînement porté aux minimums (protéines, 2,5 g/kg de glucides, lipides minimum) : le déficit réel baisse. */
  fueled: boolean;
  /** Moyenne de la semaine (kcal/j) avec cette répartition. */
  weekAvg: number;
  /** Déficit réel moyen (kcal/j) : dépense − moyenne de la semaine. Moins que `deficit` si les minimums l'imposent. */
  realDeficit: number;
  deficit: number;
}
