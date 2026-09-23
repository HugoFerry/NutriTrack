import { describe, expect, it } from 'vitest';
import { adaptiveTdee, movingAverage, projectWeeks, weekStats } from '../adaptive';
import type { JournalEntry, WeightEntry } from '../types';
import { addDays, rangeKeys } from '../dates';

const entry = (date: string, cal: number): JournalEntry => ({
  id: date + cal, date, meal: 'lunch', name: 'x', qty: 1, qtyLabel: '', cal, p: 0, g: 0, l: 0, fib: 0, createdAt: 0,
});

describe('movingAverage', () => {
  it('moyenne sur 7 jours glissants', () => {
    const w: WeightEntry[] = rangeKeys('2026-09-01', '2026-09-10').map((d, i) => ({ date: d, kg: 90 - i * 0.1, createdAt: 0 }));
    const ma = movingAverage(w);
    expect(ma[0].ma7).toBe(90);
    expect(ma[9].ma7).toBeCloseTo((89.7 + 89.6 + 89.5 + 89.4 + 89.3 + 89.2 + 89.1) / 7, 2);
  });
});

describe('adaptiveTdee', () => {
  const end = '2026-09-21';
  const start = addDays(end, -20);
  it('refuse sans assez de données', () => {
    const r = adaptiveTdee([], [], end);
    expect(r.tdee).toBeNull();
  });
  it('retrouve le TDEE quand le poids baisse de façon cohérente', () => {
    // 2500 kcal/j et perte linéaire de 0,5 kg/sem => TDEE ≈ 2500 + 550
    const keys = rangeKeys(start, end);
    const entries = keys.map((k) => entry(k, 2500));
    const weights = keys.map((k, i) => ({ date: k, kg: 90 - (i * 0.5) / 7, createdAt: 0 }));
    const r = adaptiveTdee(entries, weights, end);
    expect(r.tdee).not.toBeNull();
    expect(Math.abs((r.tdee ?? 0) - 3050)).toBeLessThan(5);
    expect(r.realDeficit).toBeLessThan(0);
  });
  it('ignore les jours non journalisés dans la moyenne', () => {
    const keys = rangeKeys(start, end);
    const entries = keys.filter((_, i) => i % 2 === 0).map((k) => entry(k, 2000));
    const weights = keys.map((k) => ({ date: k, kg: 90, createdAt: 0 }));
    const r = adaptiveTdee(entries, weights, end);
    expect(r.avgIntake).toBe(2000);
    expect(r.tdee).toBe(2000);
  });
  it('ne compte pas la journée en cours, encore incomplète', () => {
    const keys = rangeKeys(start, end);
    const entries = keys.map((k) => entry(k, k === end ? 800 : 2500));
    const weights = keys.map((k) => ({ date: k, kg: 90, createdAt: 0 }));
    const r = adaptiveTdee(entries, weights, end);
    expect(r.avgIntake).toBe(2500);
    expect(r.excludedDays).toEqual([]);
  });
  it('écarte une journée incomplète (repas oublié) et le signale', () => {
    const keys = rangeKeys(start, end);
    const entries = keys.map((k) => entry(k, k === '2026-09-10' ? 1200 : 2500));
    const weights = keys.map((k) => ({ date: k, kg: 90, createdAt: 0 }));
    const r = adaptiveTdee(entries, weights, end);
    expect(r.excludedDays).toEqual(['2026-09-10']);
    expect(r.avgIntake).toBe(2500);
    expect(r.loggedDays).toBe(19);
    expect(r.reason).toContain('1 jour écarté');
  });
  it('les jours écartés ne comptent pas dans le minimum requis', () => {
    const keys = rangeKeys(addDays(end, -10), addDays(end, -1));
    const entries = keys.map((k, i) => entry(k, i === 0 ? 1000 : 2400));
    const weights = keys.map((k) => ({ date: k, kg: 90, createdAt: 0 }));
    const r = adaptiveTdee(entries, weights, end);
    expect(r.tdee).toBeNull();
    expect(r.loggedDays).toBe(9);
    expect(r.reason).toContain('9 pour l');
    expect(r.reason).toContain('1 jour écarté');
  });
});

describe('weekStats', () => {
  it('adhérence et moyennes sur jours journalisés', () => {
    const t = new Map<string, number>();
    const keys = rangeKeys('2026-09-07', '2026-09-13');
    keys.forEach((k) => t.set(k, 2000));
    const entries = [entry('2026-09-07', 2050), entry('2026-09-08', 1500), entry('2026-09-09', 1990)];
    const s = weekStats(entries, t, '2026-09-07', '2026-09-13');
    expect(s.loggedDays).toBe(3);
    expect(s.avgCal).toBe(Math.round((2050 + 1500 + 1990) / 3));
    expect(s.adherence).toBe(67);
  });
});

describe('projectWeeks', () => {
  it('projette la durée au déficit constaté', () => {
    expect(projectWeeks(90, 85, -550)).toBe(10);
    expect(projectWeeks(90, 85, 100)).toBeNull();
  });
});
