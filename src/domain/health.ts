import type { DateKey, DayMeta, Profile, WorkoutSummary } from './types';
import { toDateKey } from './dates';

/** Données brutes telles que renvoyées par Health Connect (indépendant du plugin). */
export interface RawWorkout {
  startDate: string;
  endDate: string;
  workoutType: string;
  duration: number; // secondes
  calories?: number;
  sourceBundleId?: string;
  sourceName?: string;
}
export interface RawDaily {
  startDate: string;
  value: number;
}

const LABELS: Record<string, string> = {
  STRENGTH_TRAINING: 'Musculation',
  WEIGHTLIFTING: 'Musculation',
  CALISTHENICS: 'Poids du corps',
  HIGH_INTENSITY_INTERVAL_TRAINING: 'HIIT',
  RUNNING: 'Course',
  RUNNING_TREADMILL: 'Tapis',
  WALKING: 'Marche',
  HIKING: 'Randonnée',
  BIKING: 'Vélo',
  BIKING_STATIONARY: 'Vélo d’appartement',
  ELLIPTICAL: 'Elliptique',
  ROWING: 'Aviron',
  ROWING_MACHINE: 'Rameur',
  SWIMMING_POOL: 'Natation',
  SWIMMING_OPEN_WATER: 'Natation',
  STAIR_CLIMBING: 'Escaliers',
  STAIR_CLIMBING_MACHINE: 'Stepper',
  YOGA: 'Yoga',
  PILATES: 'Pilates',
  BOXING: 'Boxe',
  MARTIAL_ARTS: 'Arts martiaux',
  SOCCER: 'Football',
  FOOTBALL_AMERICAN: 'Football',
  BASKETBALL: 'Basket',
  TENNIS: 'Tennis',
  BADMINTON: 'Badminton',
  TABLE_TENNIS: 'Ping-pong',
  DANCING: 'Danse',
  EXERCISE_CLASS: 'Cours collectif',
  BOOT_CAMP: 'Boot camp',
  OTHER: 'Séance',
};

export function workoutLabel(type: string): string {
  if (LABELS[type]) return LABELS[type];
  const t = type.toLowerCase().replace(/_/g, ' ');
  return t.charAt(0).toUpperCase() + t.slice(1);
}

const SOURCES: Record<string, string> = {
  'com.sec.android.app.shealth': 'Samsung Health',
  'com.google.android.apps.fitness': 'Google Fit',
  'com.garmin.android.apps.connectmobile': 'Garmin',
  'com.fitbit.FitbitMobile': 'Fitbit',
  'com.strava': 'Strava',
};

export function sourceLabel(bundle?: string): string {
  if (!bundle) return 'Health Connect';
  return SOURCES[bundle] ?? bundle.split('.').pop() ?? bundle;
}

/** Regroupe les séances par jour local. Les séances de moins d'une minute sont ignorées. */
export function groupWorkouts(raw: RawWorkout[]): Map<DateKey, WorkoutSummary[]> {
  const m = new Map<DateKey, WorkoutSummary[]>();
  for (const w of raw) {
    const start = new Date(w.startDate);
    if (Number.isNaN(start.getTime())) continue;
    if ((w.duration ?? 0) < 60) continue;
    const minutes = Math.max(1, Math.round(w.duration / 60));
    const key = toDateKey(start);
    const list = m.get(key) ?? [];
    list.push({ type: w.workoutType, label: workoutLabel(w.workoutType), minutes, kcal: Math.round(w.calories ?? 0), source: sourceLabel(w.sourceBundleId), start: start.getTime() });
    m.set(key, list.sort((a, b) => a.start - b.start));
  }
  return m;
}

/** Agrégats journaliers (pas, kcal actives) indexés par jour local. */
export function groupDaily(raw: RawDaily[]): Map<DateKey, number> {
  const m = new Map<DateKey, number>();
  for (const d of raw) {
    const start = new Date(d.startDate);
    if (Number.isNaN(start.getTime())) continue;
    const key = toDateKey(start);
    m.set(key, Math.round((m.get(key) ?? 0) + (d.value ?? 0)));
  }
  return m;
}

/** Un jour compte comme entraînement si une séance atteint la durée minimale. */
export function hasTrainingWorkout(day: Pick<DayMeta, 'workouts'>, minMinutes: number): boolean {
  return (day.workouts ?? []).some((w) => w.minutes >= minMinutes);
}

/**
 * Type de jour effectif : surcharge manuelle > séance importée (si activé) > planning du profil.
 * Renvoie null quand il faut suivre le planning (calcTargets s'en charge).
 */
export function trainingOverride(day: Pick<DayMeta, 'training' | 'workouts'>, autoTraining: boolean, minMinutes: number, _profile?: Profile): boolean | null {
  if (day.training !== null) return day.training;
  if (autoTraining && hasTrainingWorkout(day, minMinutes)) return true;
  return null;
}

export function fmtSteps(n: number): string {
  return n.toLocaleString('fr-FR');
}
