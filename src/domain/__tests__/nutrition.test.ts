import { describe, expect, it } from 'vitest';
import { calcBMR, calcTargets, DEFAULT_PROFILE } from '../nutrition';
import { calcMacros, formValues, matchesQuery, qtyLabel, sumMacros, valuesPer100 } from '../foods';
import { addDays, daysBetween, toDateKey, weekday } from '../dates';
import { suggestFoods } from '../suggestions';

describe('calcBMR', () => {
  it('Mifflin-St Jeor homme', () => {
    expect(calcBMR(90, 173, 24, 'male')).toBe(10 * 90 + 6.25 * 173 - 5 * 24 + 5);
  });
  it('Mifflin-St Jeor femme', () => {
    expect(calcBMR(60, 165, 30, 'female')).toBe(10 * 60 + 6.25 * 165 - 5 * 30 - 161);
  });
});

describe('calcTargets', () => {
  const p = { ...DEFAULT_PROFILE, carbCycling: false };
  it('applique le déficit et les macros par kg', () => {
    const t = calcTargets(p, '2026-09-07'); // lundi
    expect(t.tdee).toBe(Math.round(Math.round(calcBMR(90, 173, 24, 'male')) * 1.725));
    expect(t.cal).toBe(t.tdee - 500);
    expect(t.p).toBe(180);
    expect(t.l).toBe(81);
    expect(t.g).toBe(Math.round((t.cal - 180 * 4 - 81 * 9) / 4));
  });
  it('utilise le TDEE adaptatif quand fourni', () => {
    const t = calcTargets(p, '2026-09-07', { adaptiveTdee: 3000 });
    expect(t.tdee).toBe(3000);
    expect(t.cal).toBe(2500);
  });
  it('ignore un TDEE adaptatif aberrant', () => {
    expect(calcTargets(p, '2026-09-07', { adaptiveTdee: 500 }).tdee).toBe(calcTargets(p, '2026-09-07').tdee);
  });
  it('cyclage : conserve la moyenne hebdo', () => {
    const cyc = { ...p, carbCycling: true, trainingDays: [1, 2, 4, 5], trainingBonusKcal: 150 };
    const week = ['2026-09-06', '2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11', '2026-09-12'];
    const cals = week.map((d) => calcTargets(cyc, d).cal);
    const base = calcTargets(p, '2026-09-07').cal;
    const avg = cals.reduce((a, b) => a + b, 0) / 7;
    expect(Math.abs(avg - base)).toBeLessThan(1);
    expect(calcTargets(cyc, '2026-09-07').isTraining).toBe(true);
    expect(calcTargets(cyc, '2026-09-06').isTraining).toBe(false);
    expect(calcTargets(cyc, '2026-09-07').cal).toBe(base + 150);
  });
  it('surcharge manuelle du type de jour', () => {
    const cyc = { ...p, carbCycling: true };
    expect(calcTargets(cyc, '2026-09-06', { trainingOverride: true }).isTraining).toBe(true);
  });
});

describe('foods', () => {
  const pasta = { cal: 350, p: 12, g: 72, l: 1.5, fib: 3, dry: 2.2, dryNote: 'cuites', unit: 'g' as const };
  const egg = { cal: 155, p: 13, g: 1.1, l: 11, fib: 0, pcs: 60, pcsLabel: 'oeuf', unit: 'pcs' as const };
  it('calcule les macros au poids sec', () => {
    expect(calcMacros(pasta, 80)).toEqual({ cal: 280, p: 9.6, g: 57.6, l: 1.2, fib: 2.4 });
  });
  it('convertit les pièces en grammes', () => {
    expect(calcMacros(egg, 2).cal).toBe(186);
  });
  it('libellés de quantité', () => {
    expect(qtyLabel(pasta, 80)).toBe('80g sec › 176g cuites');
    expect(qtyLabel(egg, 2)).toBe('2 oeufs');
    expect(qtyLabel(egg, 1)).toBe('1 oeuf');
    expect(qtyLabel({ ...egg, pcs: 14, pcsLabel: 'c.à.s' }, 2)).toBe('2 c.à.s');
  });
  it('somme arrondie', () => {
    expect(sumMacros([{ cal: 1, p: 0.1, g: 0.2, l: 0.3, fib: 0 }, { cal: 2, p: 0.2, g: 0.1, l: 0.3, fib: 1 }])).toEqual({ cal: 3, p: 0.3, g: 0.3, l: 0.6, fib: 1 });
  });
  it('recherche sans accents et multi-mots', () => {
    expect(matchesQuery('Pâtes cuites', 'pates cui')).toBe(true);
    expect(matchesQuery('Riz blanc cuit', 'riz complet')).toBe(false);
  });
  it('formulaire : valeurs par pièce pour un aliment compté, et retour exact à 100 g', () => {
    expect(formValues(egg)).toEqual({ cal: 93, p: 7.8, g: 0.66, l: 6.6, fib: 0 });
    expect(valuesPer100(formValues(egg), egg.pcs)).toEqual({ cal: 155, p: 13, g: 1.1, l: 11, fib: 0 });
    const boulette = { cal: 199, p: 15, g: 5, l: 12.9, fib: 0, pcs: 20 };
    expect(valuesPer100(formValues(boulette), boulette.pcs)).toEqual({ cal: 199, p: 15, g: 5, l: 12.9, fib: 0 });
    expect(formValues(pasta)).toEqual({ cal: 350, p: 12, g: 72, l: 1.5, fib: 3 });
    expect(valuesPer100(formValues(pasta))).toEqual({ cal: 350, p: 12, g: 72, l: 1.5, fib: 3 });
  });
});

describe('dates', () => {
  it('clé locale, pas UTC', () => {
    const d = new Date(2026, 0, 31, 23, 30);
    expect(toDateKey(d)).toBe('2026-01-31');
  });
  it('arithmétique', () => {
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
    expect(daysBetween('2026-01-01', '2026-01-08')).toBe(7);
    expect(weekday('2026-09-07')).toBe(1);
  });
});

describe('suggestFoods', () => {
  const base = { category: 'x', unit: 'g' as const, fib: 0, favorite: false, createdAt: 0 };
  const amandes = { ...base, id: 'seed:amandes', name: 'Amandes', cal: 579, p: 21, g: 22, l: 50, source: 'seed' as const };
  const eclair = { ...base, id: '0-eclair', name: 'Éclair au chocolat', cal: 300, p: 5, g: 33, l: 17, source: 'ai' as const, toReview: true };
  const reste = { cal: 600, p: 0, g: 0, l: 40, fib: 0 };
  it("n'utilise pas les aliments créés par le chat IA, sauf en favori", () => {
    expect(suggestFoods(reste, [eclair, amandes], new Set(), 'j').map((s) => s.food.name)).toEqual(['Amandes']);
    expect(suggestFoods(reste, [{ ...eclair, favorite: true }], new Set(), 'j').map((s) => s.food.name)).toEqual(['Éclair au chocolat']);
  });
});
