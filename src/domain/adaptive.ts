import type { DateKey, JournalEntry, WeightEntry } from './types';
import { addDays, daysBetween, rangeKeys } from './dates';
import { KCAL_PER_KG_FAT } from './nutrition';

export interface WeightPoint {
  date: DateKey;
  kg: number;
  /** Moyenne mobile sur 7 jours (sur les mesures disponibles). */
  ma7: number;
}

/** Moyenne mobile 7 jours : pour chaque mesure, moyenne des mesures des 7 derniers jours. */
export function movingAverage(weights: WeightEntry[], window = 7): WeightPoint[] {
  const sorted = [...weights].sort((a, b) => (a.date < b.date ? -1 : 1));
  return sorted.map((w) => {
    const from = addDays(w.date, -(window - 1));
    const inWin = sorted.filter((x) => x.date >= from && x.date <= w.date);
    const ma7 = inWin.reduce((s, x) => s + x.kg, 0) / inWin.length;
    return { date: w.date, kg: w.kg, ma7: Math.round(ma7 * 100) / 100 };
  });
}

export interface AdaptiveResult {
  /** TDEE mesuré (kcal/j) ou null si pas assez de données. */
  tdee: number | null;
  /** Nombre de jours de la fenêtre utilisée. */
  days: number;
  /** Nombre de jours avec un journal non vide dans la fenêtre. */
  loggedDays: number;
  /** Nombre de pesées dans la fenêtre. */
  weighIns: number;
  avgIntake: number | null;
  /** Variation de poids (moyenne mobile fin - moyenne mobile début) en kg. */
  deltaKg: number | null;
  /** Déficit réel moyen constaté (kcal/j), négatif = déficit. */
  realDeficit: number | null;
  /** Explication lisible pour l'UI. */
  reason: string;
}

/**
 * Estime le TDEE réel : TDEE = apport moyen - (variation de poids * 7700) / jours.
 * Utilise la moyenne mobile 7j au début et à la fin de la fenêtre pour lisser les
 * fluctuations d'eau. Exige au moins `minDays` jours journalisés et 2 pesées espacées.
 */
export function adaptiveTdee(
  entries: JournalEntry[],
  weights: WeightEntry[],
  endDate: DateKey,
  windowDays = 21,
  minDays = 10,
): AdaptiveResult {
  const startDate = addDays(endDate, -(windowDays - 1));
  const keys = rangeKeys(startDate, endDate);
  const byDay = new Map<DateKey, number>();
  for (const e of entries) {
    if (e.date >= startDate && e.date <= endDate) byDay.set(e.date, (byDay.get(e.date) ?? 0) + e.cal);
  }
  const loggedDays = keys.filter((k) => (byDay.get(k) ?? 0) > 0).length;
  const wIn = weights.filter((w) => w.date >= startDate && w.date <= endDate);
  const empty = (reason: string): AdaptiveResult => ({
    tdee: null, days: windowDays, loggedDays, weighIns: wIn.length, avgIntake: null, deltaKg: null, realDeficit: null, reason,
  });
  if (loggedDays < minDays) return empty(`Il faut au moins ${minDays} jours de journal sur ${windowDays} (${loggedDays} pour l'instant).`);
  if (wIn.length < 4) return empty(`Il faut au moins 4 pesées sur ${windowDays} jours (${wIn.length} pour l'instant).`);

  const sorted = [...wIn].sort((a, b) => (a.date < b.date ? -1 : 1));
  const span = daysBetween(sorted[0].date, sorted[sorted.length - 1].date);
  if (span < 7) return empty('Les pesées doivent couvrir au moins 7 jours.');

  // Tendance de poids par régression linéaire (kg/jour) : insensible au bruit
  // journalier et sans le retard d'une moyenne mobile.
  const xs = sorted.map((w) => daysBetween(startDate, w.date));
  const ys = sorted.map((w) => w.kg);
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const my = ys.reduce((a, b) => a + b, 0) / ys.length;
  let num = 0;
  let den = 0;
  for (let i = 0; i < xs.length; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  const slope = den === 0 ? 0 : num / den;

  // Apport moyen sur les jours journalisés uniquement (un jour vide = non saisi, pas un jeûne).
  const logged = keys.filter((k) => (byDay.get(k) ?? 0) > 0);
  const avgIntake = logged.reduce((s, k) => s + (byDay.get(k) ?? 0), 0) / logged.length;
  const deltaKg = slope * span;
  const dailyBalance = slope * KCAL_PER_KG_FAT;
  const tdee = Math.round(avgIntake - dailyBalance);
  return {
    tdee,
    days: windowDays,
    loggedDays,
    weighIns: wIn.length,
    avgIntake: Math.round(avgIntake),
    deltaKg: Math.round(deltaKg * 100) / 100,
    realDeficit: Math.round(dailyBalance),
    reason: `Basé sur ${logged.length} jours journalisés et ${wIn.length} pesées.`,
  };
}

export interface DayStat {
  date: DateKey;
  cal: number;
  p: number;
  g: number;
  l: number;
  fib: number;
  target: number;
  logged: boolean;
}

export interface WeekStats {
  days: DayStat[];
  avgCal: number;
  avgP: number;
  avgG: number;
  avgL: number;
  avgFib: number;
  avgTarget: number;
  /** Part des jours journalisés dont l'apport est dans ±10 % de la cible. */
  adherence: number;
  loggedDays: number;
  /** Écart moyen apport - cible sur les jours journalisés. */
  avgDelta: number;
}

export function weekStats(entries: JournalEntry[], targets: Map<DateKey, number>, from: DateKey, to: DateKey): WeekStats {
  const keys = rangeKeys(from, to);
  const days: DayStat[] = keys.map((k) => {
    const list = entries.filter((e) => e.date === k);
    const sum = (f: (e: JournalEntry) => number) => list.reduce((s, e) => s + f(e), 0);
    return {
      date: k,
      cal: sum((e) => e.cal),
      p: Math.round(sum((e) => e.p)),
      g: Math.round(sum((e) => e.g)),
      l: Math.round(sum((e) => e.l)),
      fib: Math.round(sum((e) => e.fib ?? 0)),
      target: targets.get(k) ?? 0,
      logged: list.length > 0,
    };
  });
  const logged = days.filter((d) => d.logged);
  const n = Math.max(1, logged.length);
  const avg = (f: (d: DayStat) => number) => Math.round(logged.reduce((s, d) => s + f(d), 0) / n);
  const inRange = logged.filter((d) => d.target > 0 && Math.abs(d.cal - d.target) / d.target <= 0.1).length;
  return {
    days,
    avgCal: avg((d) => d.cal),
    avgP: avg((d) => d.p),
    avgG: avg((d) => d.g),
    avgL: avg((d) => d.l),
    avgFib: avg((d) => d.fib),
    avgTarget: avg((d) => d.target),
    adherence: logged.length ? Math.round((inRange / logged.length) * 100) : 0,
    loggedDays: logged.length,
    avgDelta: avg((d) => d.cal - d.target),
  };
}

/** Projection : semaines nécessaires pour atteindre un poids cible au déficit constaté. */
export function projectWeeks(currentKg: number, goalKg: number, dailyDeficit: number): number | null {
  if (dailyDeficit >= 0 || currentKg <= goalKg) return null;
  const kgPerWeek = (-dailyDeficit * 7) / KCAL_PER_KG_FAT;
  return Math.ceil((currentKg - goalKg) / kgPerWeek);
}
