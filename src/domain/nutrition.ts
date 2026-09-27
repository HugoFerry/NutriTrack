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

/**
 * Cibles du jour. Si un TDEE mesuré (adaptatif) est fourni, il remplace la formule.
 * Le cyclage des glucides redistribue les kcal entre jours d'entraînement et repos
 * en conservant la moyenne hebdomadaire ; l'écart est porté par les glucides.
 * Plancher : le cyclage ne fait jamais descendre un jour de repos sous le métabolisme de base ;
 * quand il bute dessus, le bonus des jours d'entraînement est réduit d'autant (moyenne inchangée).
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

  let cal = base;
  let restFloored = false;
  if (profile.carbCycling) {
    const nTrain = trainingPerWeek(profile);
    const nRest = 7 - nTrain;
    const wanted = Math.round((profile.trainingBonusKcal * nTrain) / nRest);
    // Retrait par jour de repos, borné par le métabolisme de base (aucun retrait si la cible est déjà dessous).
    const cut = Math.max(0, Math.min(wanted, base - bmr));
    restFloored = cut < wanted;
    cal = training ? base + Math.round((cut * nRest) / nTrain) : base - cut;
  }

  const p = Math.round(profile.weight * profile.proteinPerKg);
  const l = Math.round(profile.weight * profile.fatPerKg);
  const carbKcal = Math.max(cal - p * 4 - l * 9, 200);
  const g = Math.round(carbKcal / 4);
  return { bmr, tdeeFormula, tdee, deficit, isTraining: training, restFloored, cal, p, g, l, fib: 30 };
}

export function macroKcal(m: { p: number; g: number; l: number }): { p: number; g: number; l: number } {
  return { p: m.p * 4, g: m.g * 4, l: m.l * 9 };
}
