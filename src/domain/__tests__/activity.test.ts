import { describe, expect, it } from 'vitest';
import { DEFAULT_COMMUTE, DEFAULT_TREADMILL, commuteHabit, commuteKcal, extrasKcal, extrasText, roundTrip, treadmillKcal } from '../activity';
import { PROG, exId, seedExercises } from '../../data/training-seed';
import { workoutLine } from '../training';
import type { Exercise, Workout } from '../types';

const poids = 89.7;

describe('activité autour de la séance', () => {
  it('trajet habituel : 6 km à vélo en 16 min, soit 12 km et 32 min aller-retour', () => {
    expect(roundTrip(DEFAULT_COMMUTE)).toEqual({ mode: 'velo', km: 12, minutes: 32 });
  });

  it('vélo : 22,5 km/h compte pour 8 MET (plafond du déplacement), soit (8 − 1) × 89,7 kg × 32/60 h ≈ 335 kcal', () => {
    expect(commuteKcal(roundTrip(DEFAULT_COMMUTE), poids)).toBe(335);
    expect(commuteKcal({ mode: 'velo', km: 12, minutes: 60 }, poids)).toBe(269); // 12 km/h : 4 MET
  });

  it('à pied : 2 km en 24 min (5 km/h, 3,5 MET) ≈ 90 kcal ; durée nulle → 0', () => {
    expect(commuteKcal({ mode: 'marche', km: 2, minutes: 24 }, poids)).toBe(90);
    expect(commuteKcal({ mode: 'marche', km: 2, minutes: 0 }, poids)).toBe(0);
  });

  it('tapis incliné (équation de marche de l’ACSM) : 20 min à 5 km/h et 10 % ≈ 199 kcal, 30 min ≈ 299, à plat bien moins', () => {
    expect(treadmillKcal(DEFAULT_TREADMILL, poids)).toBe(199);
    expect(treadmillKcal({ ...DEFAULT_TREADMILL, minutes: 30 }, poids)).toBe(299);
    expect(treadmillKcal({ ...DEFAULT_TREADMILL, inclinePct: 0 }, poids)).toBeLessThan(100);
  });

  it('total et textes pour le suivi et le coach', () => {
    const extras = { commute: roundTrip(DEFAULT_COMMUTE), treadmill: DEFAULT_TREADMILL };
    expect(extrasKcal(extras, poids)).toBe(534);
    expect(extrasKcal(undefined, poids)).toBe(0);
    expect(extrasText(extras)).toBe('vélo 12 km (32 min) · tapis incliné 20 min à 10 %, 5 km/h');
    expect(commuteHabit(DEFAULT_COMMUTE)).toContain('à vélo (6 km et environ 16 min par trajet');
    expect(commuteHabit(DEFAULT_COMMUTE)).toContain('ne les ajoute pas à sa cible');
  });

  it('le coach voit le trajet et le tapis dans la ligne de la séance, avec les kcal si le poids est connu', () => {
    const exercises = new Map<string, Exercise>(seedExercises().map((e) => [e.id, e]));
    const w: Workout = {
      id: 'w', date: '2026-09-28', programId: PROG.bras, name: 'Bras / Épaules', startedAt: 1, finishedAt: 2, createdAt: 1, durationMin: 60,
      blocks: [{ kind: 'serie', exerciseId: exId('halteres-au-front'), target: '12', restSec: 90, sets: [{ kg: 14, reps: 12, done: true }] }],
      extras: { commute: roundTrip(DEFAULT_COMMUTE), treadmill: DEFAULT_TREADMILL },
    };
    expect(workoutLine(w, exercises, poids)).toBe(
      'Bras / Épaules, 60 min, 1 séries, groupes triceps — Haltères au front 14 kg × 12 — autour de la séance : vélo 12 km (32 min) · tapis incliné 20 min à 10 %, 5 km/h (~534 kcal)',
    );
    expect(workoutLine({ ...w, extras: undefined }, exercises, poids)).not.toContain('autour');
  });
});
