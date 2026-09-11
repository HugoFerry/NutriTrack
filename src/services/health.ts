import { Health, type HealthPermission } from 'capacitor-health';
import { db } from '../data/db';
import { getSettings, updateSettings } from '../data/repos';
import { addDays, fromDateKey, rangeKeys, todayKey } from '../domain/dates';
import { groupDaily, groupWorkouts } from '../domain/health';
import type { DateKey, DayMeta } from '../domain/types';
import { isNative } from './platform';

const PERMS: HealthPermission[] = ['READ_STEPS', 'READ_ACTIVE_CALORIES', 'READ_WORKOUTS', 'READ_WEIGHT'];
const SYNC_MIN_INTERVAL_MS = 10 * 60 * 1000;

export async function healthAvailable(): Promise<boolean> {
  if (!isNative()) return false;
  try {
    return (await Health.isHealthAvailable()).available;
  } catch {
    return false;
  }
}

export async function healthPermissionsGranted(): Promise<boolean> {
  try {
    const res = await Health.checkHealthPermissions({ permissions: PERMS });
    return res.permissions.some((p) => Object.values(p).some(Boolean));
  } catch {
    return false;
  }
}

/** Demande les permissions Health Connect ; renvoie true si au moins une est accordée. */
export async function connectHealth(): Promise<boolean> {
  const res = await Health.requestHealthPermissions({ permissions: PERMS });
  const ok = res.permissions.some((p) => Object.values(p).some(Boolean));
  await updateSettings({ health: { ...(await getSettings()).health, connected: ok } });
  return ok;
}

export async function openHealthSettings(): Promise<void> {
  await Health.openHealthConnectSettings();
}
export async function installHealthConnect(): Promise<void> {
  await Health.showHealthConnectInPlayStore();
}

export interface SyncResult {
  days: number;
  workouts: number;
  weights: number;
}

/**
 * Importe pas, calories actives, séances et pesées des `daysBack` derniers jours.
 * Les valeurs importées écrasent les précédentes importations, jamais les saisies manuelles.
 */
export async function syncHealth(daysBack = 30, opts: { force?: boolean } = {}): Promise<SyncResult | null> {
  if (!isNative()) return null;
  const settings = await getSettings();
  if (!settings.health.connected) return null;
  if (!opts.force && settings.health.lastSync && Date.now() - settings.health.lastSync < SYNC_MIN_INTERVAL_MS) return null;

  const today = todayKey();
  const from = addDays(today, -daysBack);
  const startDate = fromDateKey(from).toISOString();
  const endDate = new Date(fromDateKey(today).getTime() + 86_400_000).toISOString();

  const [stepsRes, kcalRes, workoutsRes, weightRes] = await Promise.all([
    Health.queryAggregated({ startDate, endDate, dataType: 'steps', bucket: 'day' }).catch(() => ({ aggregatedData: [] })),
    Health.queryAggregated({ startDate, endDate, dataType: 'active-calories', bucket: 'day' }).catch(() => ({ aggregatedData: [] })),
    Health.queryWorkouts({ startDate, endDate, includeHeartRate: false, includeRoute: false, includeSteps: false }).catch(() => ({ workouts: [] })),
    settings.health.importWeight ? Health.queryRecords({ startDate, endDate, dataType: 'weight' }).catch(() => ({ records: [] })) : Promise.resolve({ records: [] }),
  ]);

  const steps = groupDaily(stepsRes.aggregatedData);
  const kcal = groupDaily(kcalRes.aggregatedData);
  const workouts = groupWorkouts(workoutsRes.workouts);

  const keys = rangeKeys(from, today);
  const existing = new Map((await db.days.where('date').between(from, today, true, true).toArray()).map((d) => [d.date, d]));
  const toPut: DayMeta[] = [];
  let workoutCount = 0;
  for (const k of keys) {
    const cur = existing.get(k);
    const s = steps.get(k) ?? null;
    const c = kcal.get(k) ?? null;
    const w = workouts.get(k) ?? [];
    workoutCount += w.length;
    if (!cur && s === null && c === null && !w.length) continue;
    const next: DayMeta = { date: k, training: cur?.training ?? null, waterMl: cur?.waterMl ?? 0, note: cur?.note ?? '', steps: s, activeKcal: c, workouts: w };
    if (!cur || JSON.stringify(cur) !== JSON.stringify(next)) toPut.push(next);
  }
  if (toPut.length) await db.days.bulkPut(toPut);

  // Pesées : une par jour (la dernière mesure du jour), sans écraser une saisie manuelle.
  let weightCount = 0;
  const byDay = new Map<DateKey, number>();
  for (const r of weightRes.records) {
    const d = new Date(r.startDate);
    if (Number.isNaN(d.getTime()) || !(r.value > 20)) continue;
    byDay.set(todayKeyOf(d), Math.round(r.value * 10) / 10);
  }
  for (const [date, kg] of byDay) {
    const cur = await db.weights.get(date);
    if (cur && cur.source !== 'health') continue;
    if (cur && cur.kg === kg) continue;
    await db.weights.put({ date, kg, createdAt: Date.now(), source: 'health' });
    weightCount++;
  }
  if (byDay.has(today)) {
    const s2 = await getSettings();
    const kg = byDay.get(today)!;
    if (s2.profile.weight !== kg) await updateSettings({ profile: { ...s2.profile, weight: kg } });
  }

  await updateSettings({ health: { ...(await getSettings()).health, lastSync: Date.now() } });
  return { days: toPut.length, workouts: workoutCount, weights: weightCount };
}

function todayKeyOf(d: Date): DateKey {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
