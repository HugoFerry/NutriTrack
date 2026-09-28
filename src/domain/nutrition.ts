import type { ActivityId, DailyTargets, DateKey, DeficitId, Profile } from './types';
import { weekday } from './dates';

export const ACTIVITY: { id: ActivityId; label: string; desc: string; f: number }[] = [
  { id: 'sedentary', label: 'Sédentaire', desc: "Peu ou pas d'exercice", f: 1.2 },
  { id: 'light', label: 'Légèrement actif', desc: '1-2 séances / sem', f: 1.375 },
  { id: 'moderate', label: 'Modérément actif', desc: '3-4 séances / sem', f: 1.55 },
  { id: 'active', label: 'Très actif', desc: '4-5 séances + cardio', f: 1.725 },
  { id: 'extreme', label: 'Extrêmement actif', desc: '6-7 séances intenses', f: 1.9 },
];

export const DEFICIT: { id: DeficitId; label: string; def: number; desc: string }[] = [
  { id: 'maintain', label: 'Maintien', def: 0, desc: 'Stabiliser' },
  { id: 'slow', label: 'Lent', def: 300, desc: '~0,3 kg / sem' },
  { id: 'moderate', label: 'Modéré', def: 500, desc: '~0,5 kg / sem' },
  { id: 'aggressive', label: 'Agressif', def: 700, desc: '~0,7 kg / sem' },
];

export const KCAL_PER_KG_FAT = 7700;

export const DEFAULT_PROFILE: Profile = {
  weight: 90,
  height: 173,
  age: 24,
  sex: 'male',
  activity: 'active',
  deficit: 'moderate',
  proteinPerKg: 2,
  fatPerKg: 0.9,
  trainingDays: [1, 2, 4, 5],
  carbCycling: false,
  trainingBonusKcal: 150,
};

/** Mifflin-St Jeor. */
export function calcBMR(weight: number, height: number, age: number, sex: 'male' | 'female'): number {
  const base = 10 * weight + 6.25 * height - 5 * age;
  return sex === 'male' ? base + 5 : base - 161;
}

export function activityFactor(id: ActivityId): number {
  return ACTIVITY.find((a) => a.id === id)?.f ?? 1.55;
}

export function deficitKcal(id: DeficitId): number {
  return DEFICIT.find((d) => d.id === id)?.def ?? 500;
}

/**
 * Type de jour. La surcharge (séance enregistrée, Health Connect, bascule du journal) l'emporte ;
 * sinon, en mode « selon mes séances », un jour sans séance est un repos, et avant ce mode on suit les jours fixes.
 */
export function isTrainingDay(profile: Profile, date: DateKey, override: boolean | null = null): boolean {
  if (override !== null) return override;
  if (profile.sessionDays && date >= profile.sessionDays.since) return false;
  return profile.trainingDays.includes(weekday(date));
}

/** Nombre de jours d'entraînement par semaine, pour répartir le cyclage (1 à 6 : il faut au moins un repos). */
export function trainingPerWeek(profile: Profile): number {
  return Math.min(6, Math.max(1, profile.sessionDays?.perWeek ?? profile.trainingDays.length));
}

/** Glucides minimum d'un jour d'entraînement (g/kg) : de quoi nourrir la séance, même en sèche. */
export const MIN_TRAINING_CARBS_PER_KG = 2.5;
/** Lipides minimum (g/kg) : en dessous, les hormones en pâtissent. Les lipides baissent jusque-là avant les glucides. */
export const MIN_FAT_PER_KG = 0.7;

/** Minimums d'un jour d'entraînement, en grammes et en kcal : protéines du profil, glucides et lipides minimum. */
export function trainingMinimums(profile: Profile): { p: number; g: number; l: number; kcal: number } {
  const p = Math.round(profile.weight * profile.proteinPerKg);
  const g = Math.round(profile.weight * MIN_TRAINING_CARBS_PER_KG);
  const l = Math.round(profile.weight * Math.min(MIN_FAT_PER_KG, profile.fatPerKg));
  return { p, g, l, kcal: p * 4 + g * 4 + l * 9 };
}

/**
 * Cibles du jour. Si un TDEE mesuré (adaptatif) est fourni, il remplace la formule.
 *
 * Répartition de la semaine (moyenne visée : dépense − déficit) :
 * 1. un jour d'entraînement vaut la moyenne + le bonus du cyclage, et jamais moins que ses minimums
 *    (protéines, 2,5 g/kg de glucides, lipides au minimum) : la séance passe avant la vitesse de perte ;
 * 2. les jours de repos paient ce supplément, sans descendre sous le métabolisme de base ;
 * 3. s'ils ne peuvent pas tout payer, le bonus du cyclage (facultatif) fond d'abord ; les minimums restent,
 *    et c'est alors le déficit réel qui diminue (`realDeficit`, `restFloored`, `fueled`).
 *
 * Macros : protéines fixes ; un jour d'entraînement, les lipides descendent vers leur minimum avant que les
 * glucides passent sous 2,5 g/kg ; un jour de repos, les glucides prennent le reste.
 */
export function calcTargets(
  profile: Profile,
  date: DateKey,
  opts: { trainingOverride?: boolean | null; adaptiveTdee?: number | null } = {},
): DailyTargets {
  const bmr = Math.round(calcBMR(profile.weight, profile.height, profile.age, profile.sex));
  const tdeeFormula = Math.round(bmr * activityFactor(profile.activity));
  const tdee = opts.adaptiveTdee && opts.adaptiveTdee > 800 ? Math.round(opts.adaptiveTdee) : tdeeFormula;
  const deficit = deficitKcal(profile.deficit);
  const base = tdee - deficit;
  const training = isTrainingDay(profile, date, opts.trainingOverride ?? null);

  const nTrain = trainingPerWeek(profile);
  const nRest = 7 - nTrain;
  const min = trainingMinimums(profile);
  const withBonus = base + (profile.carbCycling ? profile.trainingBonusKcal : 0);
  let train = Math.max(withBonus, min.kcal);
  // Les jours de repos financent le supplément des jours d'entraînement, jusqu'au métabolisme de base.
  const wanted = Math.round(((train - base) * nTrain) / nRest);
  const cut = Math.max(0, Math.min(wanted, base - bmr));
  const restFloored = cut < wanted;
  if (restFloored) train = Math.max(base + Math.round((cut * nRest) / nTrain), min.kcal);
  const rest = base - cut;
  const fueled = train === min.kcal && min.kcal > withBonus;
  const weekAvg = Math.round((train * nTrain + rest * nRest) / 7);
  const cal = training ? train : rest;

  const p = min.p;
  let l = Math.round(profile.weight * profile.fatPerKg);
  if (training && (cal - p * 4 - l * 9) / 4 < min.g) l = Math.max(min.l, Math.floor((cal - p * 4 - min.g * 4) / 9));
  const g = Math.round(Math.max(cal - p * 4 - l * 9, 200) / 4);
  return { bmr, tdeeFormula, tdee, deficit, isTraining: training, restFloored, fueled, weekAvg, realDeficit: tdee - weekAvg, cal, p, g, l, fib: 30 };
}

/** Perte de poids attendue (kg/semaine) pour un déficit réel moyen (kcal/j). */
export const kgPerWeek = (realDeficit: number) => Math.round(((realDeficit * 7) / KCAL_PER_KG_FAT) * 100) / 100;

export function macroKcal(m: { p: number; g: number; l: number }): { p: number; g: number; l: number } {
  return { p: m.p * 4, g: m.g * 4, l: m.l * 9 };
}
