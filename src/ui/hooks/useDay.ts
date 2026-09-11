import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { db } from '../../data/db';
import { EMPTY_DAY } from '../../data/repos';
import { adaptiveTdee } from '../../domain/adaptive';
import { addDays, todayKey } from '../../domain/dates';
import { sumMacros } from '../../domain/foods';
import { calcTargets } from '../../domain/nutrition';
import { trainingOverride } from '../../domain/health';
import type { DailyTargets, DateKey, DayMeta, JournalEntry, Macros, Settings, WeightEntry } from '../../domain/types';

export interface DayData {
  entries: JournalEntry[];
  day: DayMeta;
  targets: DailyTargets;
  consumed: Macros;
  remaining: Macros;
  weight: WeightEntry | undefined;
  adaptive: ReturnType<typeof adaptiveTdee>;
  adaptiveInUse: number | null;
  loading: boolean;
}

/** Données réactives d'une journée : entrées, méta, cibles (avec TDEE adaptatif si activé). */
export function useDay(date: DateKey, settings: Settings): DayData {
  const entries = useLiveQuery(() => db.entries.where('date').equals(date).sortBy('createdAt'), [date]);
  const day = useLiveQuery(() => db.days.get(date), [date]);
  const weight = useLiveQuery(() => db.weights.get(date), [date]);
  const today = todayKey();
  const winStart = addDays(today, -27);
  const winEntries = useLiveQuery(() => db.entries.where('date').between(winStart, today, true, true).toArray(), [winStart, today]);
  const weights = useLiveQuery(() => db.weights.orderBy('date').toArray(), []);

  const adaptive = useMemo(() => adaptiveTdee(winEntries ?? [], weights ?? [], today), [winEntries, weights, today]);
  const adaptiveInUse = settings.useAdaptiveTdee && adaptive.tdee ? adaptive.tdee : null;

  const dayMeta = useMemo(() => ({ ...EMPTY_DAY(date), ...day }), [date, day]);
  const override = trainingOverride(dayMeta, settings.health.autoTraining, settings.health.minWorkoutMinutes);
  const targets = useMemo(
    () => calcTargets(settings.profile, date, { trainingOverride: override, adaptiveTdee: adaptiveInUse }),
    [settings.profile, date, override, adaptiveInUse],
  );
  const consumed = useMemo(() => sumMacros(entries ?? []), [entries]);
  const remaining = useMemo(
    () => ({ cal: targets.cal - consumed.cal, p: targets.p - consumed.p, g: targets.g - consumed.g, l: targets.l - consumed.l, fib: targets.fib - consumed.fib }),
    [targets, consumed],
  );
  return { entries: entries ?? [], day: dayMeta, targets, consumed, remaining, weight, adaptive, adaptiveInUse, loading: entries === undefined };
}
