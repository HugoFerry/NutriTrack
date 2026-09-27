import { describe, expect, it } from 'vitest';
import { PROG, SEED_PROGRAMS, exId, seedExercises } from '../../data/training-seed';
import {
  fmtSets, intakeAverages, lastPerformance, pace, progressionHint, recentTrainingText, sessionStats, suggestSession, suggestionText, targetReps, workoutFromProgram,
} from '../training';
import type { Exercise, LoggedSet, Program, Workout } from '../types';

const programs: Program[] = SEED_PROGRAMS.map((p) => ({ ...p, source: 'seed', createdAt: 0 }));
const exercises = new Map<string, Exercise>(seedExercises().map((e) => [e.id, e]));
const byId = (id: string) => programs.find((p) => p.id === id)!;

let n = 0;
const fait = (date: string, programId: string, extra: Partial<Workout> = {}): Workout => ({
  id: `w${++n}`, date, programId, name: byId(programId).name, blocks: [], startedAt: n, finishedAt: n + 1, createdAt: n, ...extra,
});
const series = (exerciseId: string, sets: [number, number][], done = true) => ({
  kind: 'serie' as const, exerciseId, target: '6', restSec: 150, sets: sets.map(([kg, reps]): LoggedSet => ({ kg, reps, done })),
});

describe('suggestSession', () => {
  it('sans historique : la première séance du programme ; Bras / Épaules écartée', () => {
    const s = suggestSession(programs, [], '2026-09-21');
    expect(s.program?.id).toBe(PROG.dos);
    expect(s.excluded.map((e) => [e.program.id, e.why])).toEqual([[PROG.bras, 'seulement après Dos ou Pecs']]);
  });

  it('semaine type : jeudi Bras (après Dos, Pecs interdite le lendemain de Dos), samedi on refait Pecs', () => {
    const semaine = [fait('2026-09-21', PROG.pecs), fait('2026-09-22', PROG.jambes), fait('2026-09-23', PROG.dos)];
    const jeudi = suggestSession(programs, semaine, '2026-09-24');
    expect(jeudi.program?.id).toBe(PROG.bras);
    expect(jeudi.excluded.map((e) => [e.program.id, e.why])).toContainEqual([PROG.pecs, 'pas le lendemain de Dos']);

    const samedi = suggestSession(programs, [...semaine, fait('2026-09-25', PROG.bras)], '2026-09-26');
    expect(samedi.program?.id).toBe(PROG.pecs);
    expect(samedi.reason).toContain('il y a 5 jours');
  });

  it("dans l'autre sens, la cinquième séance refait Dos", () => {
    const semaine = [fait('2026-09-21', PROG.dos), fait('2026-09-22', PROG.jambes), fait('2026-09-23', PROG.pecs), fait('2026-09-25', PROG.bras)];
    expect(suggestSession(programs, semaine, '2026-09-26').program?.id).toBe(PROG.dos);
  });

  it('ignore les séances en cours et celles du jour même', () => {
    const enCours = { ...fait('2026-09-21', PROG.dos), finishedAt: undefined };
    expect(suggestSession(programs, [enCours], '2026-09-22').program?.id).toBe(PROG.dos);
    expect(suggestSession(programs, [fait('2026-09-22', PROG.dos)], '2026-09-22').program?.id).toBe(PROG.dos);
  });
});

describe('dernière performance et progression', () => {
  const dc = exId('developpe-couche-halteres');
  const avant = fait('2026-09-14', PROG.pecs, { blocks: [series(dc, [[24, 6], [24, 6], [24, 5], [24, 5]])] });

  it('lastPerformance : séries faites de la dernière séance terminée, hors séance en cours', () => {
    const enCours = { ...fait('2026-09-21', PROG.pecs, { blocks: [series(dc, [[26, 6]])] }), finishedAt: undefined };
    const perf = lastPerformance(dc, [avant, enCours]);
    expect(perf?.date).toBe('2026-09-14');
    expect(fmtSets(perf!.sets)).toBe('24 kg × 6, 6, 5, 5');
    expect(lastPerformance(dc, [avant], avant.id)).toBeNull();
  });

  it('workoutFromProgram pré-remplit avec la dernière fois, sinon avec les reps visées', () => {
    const w = workoutFromProgram(byId(PROG.pecs), [avant], '2026-09-21', 1000, 'nouvelle');
    expect(w).toMatchObject({ id: 'nouvelle', date: '2026-09-21', programId: PROG.pecs, name: 'Pecs', startedAt: 1000 });
    expect(w.finishedAt).toBeUndefined();
    const [dcBloc, incline] = w.blocks;
    expect(dcBloc).toMatchObject({ kind: 'serie', exerciseId: dc, target: '6' });
    expect(dcBloc.kind === 'serie' && dcBloc.sets).toEqual([
      { kg: 24, reps: 6, done: false }, { kg: 24, reps: 6, done: false }, { kg: 24, reps: 5, done: false }, { kg: 24, reps: 5, done: false },
    ]);
    expect(incline.kind === 'serie' && incline.sets[0]).toEqual({ kg: undefined, reps: 8, done: false });
    expect(w.blocks[5]).toMatchObject({ kind: 'circuit', rounds: 4, roundsDone: 0, workSec: 40, restSec: 20 });
  });

  it('séance saisie a posteriori : pré-remplie avec les séances antérieures à sa date, pas les suivantes', () => {
    const apres = fait('2026-09-28', PROG.pecs, { blocks: [series(dc, [[30, 6]])] });
    const w = workoutFromProgram(byId(PROG.pecs), [avant, apres], '2026-09-21', 1000, 'passee');
    expect(w.blocks[0].kind === 'serie' && w.blocks[0].sets[0].kg).toBe(24);
  });

  it('progressionHint : double progression, seulement quand toutes les séries prévues sont au haut de la fourchette', () => {
    const plein = { date: 'x', sets: [6, 6, 6, 6].map((reps): LoggedSet => ({ kg: 24, reps, done: true })) };
    expect(progressionHint('6', 4, plein, 'charge')).toBe('Toutes les séries à 6 reps la dernière fois : tente 26.5 kg.');
    expect(progressionHint('6', 4, lastPerformance(dc, [avant]), 'charge')).toBeNull();
    expect(progressionHint('10-12', 4, plein, 'charge')).toBeNull();
    expect(progressionHint('6', 4, { date: 'x', sets: plein.sets.slice(0, 3) }, 'charge')).toBeNull();
    expect(progressionHint('6', 4, { date: 'x', sets: plein.sets.map((s) => ({ ...s, kg: undefined })) }, 'pdc')).toContain('lest');
  });

  it('targetReps : haut de la fourchette ; rien pour échec ou aller-retour', () => {
    expect([targetReps('8'), targetReps('10-12'), targetReps('10 à 12'), targetReps('12 D/G'), targetReps('échec'), targetReps('1 AR')]).toEqual([8, 12, 12, 12, null, null]);
    expect([targetReps('30 s'), targetReps('30 s par côté'), targetReps('10 reps')]).toEqual([null, null, 10]);
  });
});

describe('résumés pour le coach', () => {
  it('séances jour par jour, repos compris, avec volume, ressenti et allure', () => {
    const dc = exId('developpe-couche-halteres');
    const pecs = fait('2026-09-21', PROG.pecs, { durationMin: 55, rpe: 7, blocks: [series(dc, [[24, 6], [24, 6], [24, 5], [24, 5]]), series(exId('dips'), [[0, 12]], false)] });
    const course = { ...fait('2026-09-22', PROG.pecs), programId: undefined, name: 'Cardio', blocks: [{ kind: 'cardio' as const, exerciseId: exId('course'), minutes: 30, km: 5 }] };
    const txt = recentTrainingText([pecs, course], exercises, '2026-09-23', 3);
    expect(txt.split('\n')).toEqual([
      '- Lun 21 sept. : Pecs, 55 min, ressenti 7/10, 4 séries, groupes pecs/triceps/épaules — Développé couché haltères 24 kg × 6, 6, 5, 5',
      '- Mar 22 sept. : Cardio, groupes cardio — Course à pied 30 min, 5 km (6:00 /km)',
      "- Mer 23 sept. (aujourd'hui) : repos",
    ]);
    expect(sessionStats(pecs, exercises)).toEqual({ sets: 4, tonnage: 528, groups: ['pecs', 'triceps', 'epaules'] });
    expect(pace(25, 0)).toBeNull();
  });
});

describe('contexte du coach', () => {
  it('intakeAverages : moyenne des seuls jours saisis', () => {
    expect(intakeAverages([
      { date: 'a', cal: 1200, p: 80 }, { date: 'a', cal: 1000, p: 70 }, { date: 'b', cal: 2400, p: 170 },
    ])).toEqual({ avgCal: 2300, avgP: 160, loggedDays: 2 });
    expect(intakeAverages([])).toEqual({ avgCal: 0, avgP: 0, loggedDays: 0 });
  });

  it('suggestionText : séance faite, en cours, ou suggérée avec les écartées', () => {
    const jeudi = [fait('2026-09-21', PROG.pecs), fait('2026-09-22', PROG.jambes), fait('2026-09-23', PROG.dos)];
    expect(suggestionText(programs, jeudi, '2026-09-24')).toBe(
      "Séance suggérée par l'app aujourd'hui : Bras / Épaules. Pas encore faite. Écartées par ses règles : Pecs (pas le lendemain de Dos).",
    );
    expect(suggestionText(programs, [...jeudi, fait('2026-09-24', PROG.bras)], '2026-09-24')).toBe("Déjà fait aujourd'hui : Bras / Épaules.");
    expect(suggestionText(programs, [...jeudi, { ...fait('2026-09-24', PROG.bras), finishedAt: undefined }], '2026-09-24')).toBe("Séance en cours aujourd'hui : Bras / Épaules.");
    const footing = { ...fait('2026-09-24', PROG.dos), programId: undefined, name: 'Course à pied' };
    expect(suggestionText(programs, [...jeudi, footing], '2026-09-24')).toBe(
      "Déjà fait aujourd'hui : Course à pied. Séance suggérée par l'app aujourd'hui : Bras / Épaules. Pas encore faite. Écartées par ses règles : Pecs (pas le lendemain de Dos).",
    );
  });
});
