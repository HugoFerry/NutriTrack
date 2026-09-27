import { describe, expect, it } from 'vitest';
import { PROG, SEED_PROGRAMS, exId, seedExercises } from '../../data/training-seed';
import {
  addExercise, differsFromProgram, fmtSets, groupBlocks, insertBlock, intakeAverages, lastPerformance, linkedWithNext, moveGroup, pace, programBlocksFromWorkout, programText,
  progressionHint, recentTrainingText, removeAt, removeBlock, replaceExercise, sessionStats, setLinked, suggestSession, suggestionText, targetReps, workoutFromProgram,
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

describe('superset', () => {
  it('groupBlocks : seuls les blocs consécutifs de même numéro sont regroupés', () => {
    const b = (superset?: number) => ({ kind: 'serie', superset });
    expect(groupBlocks([b(), b(1), b(1), b(), { kind: 'circuit' }])).toEqual([[0], [1, 2], [3], [4]]);
    expect(groupBlocks([b(1), b(), b(1)])).toEqual([[0], [1], [2]]);
    expect(groupBlocks([b(1), b(1), b(2), b(2)])).toEqual([[0, 1], [2, 3]]);
  });

  it('Dos : curl marteau et curl incliné en superset, copié dans la séance et décrit au coach', () => {
    const dos = byId(PROG.dos);
    const w = workoutFromProgram(dos, [], '2026-09-21', 1, 'w');
    const sup = w.blocks.filter((x) => x.kind === 'serie' && x.superset);
    expect(sup.map((x) => x.kind === 'serie' && [x.exerciseId, x.superset, x.restSec])).toEqual([
      [exId('curl-marteau'), 1, 0], [exId('curl-banc-incline'), 1, 90],
    ]);
    const ligne = programText([dos], exercises);
    expect(ligne).toContain('superset Curl marteau 4×12 + Curl biceps banc incliné 4×12 (enchaînés sans pause, repos 1 min 30 après le dernier)');
    expect(ligne).toContain('Tractions 4×8 (repos 2 min)');
  });
});

describe('choisir les exercices de la séance', () => {
  const dc = exId('developpe-couche-halteres');
  const barre = exId('developpe-couche-barre');
  const avant = fait('2026-09-14', PROG.pecs, { blocks: [series(barre, [[60, 6], [60, 5]])] });
  const seance = () => workoutFromProgram(byId(PROG.pecs), [avant], '2026-09-21', 1000, 'en-cours');

  it("replaceExercise : même nombre de séries et même repos, charges reprises de l'exercice choisi", () => {
    const w = replaceExercise(seance(), 0, exercises.get(barre)!, [avant]);
    const b = w.blocks[0];
    expect(b).toMatchObject({ kind: 'serie', exerciseId: barre, target: '6', restSec: 150 });
    expect(b.kind === 'serie' && b.sets.map((s) => [s.kg, s.reps, s.done])).toEqual([[60, 6, false], [60, 5, false], [60, 5, false], [60, 5, false]]);
    expect(replaceExercise(seance(), 5, exercises.get(barre)!, [avant])).toEqual(seance()); // un circuit ne se remplace pas
    expect(replaceExercise(seance(), 0, exercises.get(exId('course'))!, [])).toEqual(seance()); // un cardio ne devient pas des séries
  });

  it('addExercise : inséré avant les circuits ; séries de la dernière fois ou 3 par défaut ; cardio en durée', () => {
    const w = seance();
    const avecBarre = addExercise(w, exercises.get(barre)!, [avant]);
    expect(avecBarre.blocks).toHaveLength(w.blocks.length + 1);
    expect(avecBarre.blocks[5]).toMatchObject({ kind: 'serie', exerciseId: barre, restSec: 90 });
    expect(avecBarre.blocks[5].kind === 'serie' && avecBarre.blocks[5].sets.map((s) => s.kg)).toEqual([60, 60]);
    expect(avecBarre.blocks[6].kind).toBe('circuit');

    const pompes = addExercise(w, exercises.get(exId('pompes'))!, [], { sets: 4, target: '15', restSec: 60 });
    expect(pompes.blocks[5]).toMatchObject({ exerciseId: exId('pompes'), target: '15', restSec: 60 });
    expect(pompes.blocks[5].kind === 'serie' && pompes.blocks[5].sets.map((s) => s.reps)).toEqual([15, 15, 15, 15]);

    const libre = { ...w, programId: undefined, blocks: [] };
    expect(addExercise(libre, exercises.get(exId('course'))!, []).blocks).toEqual([{ kind: 'cardio', exerciseId: exId('course'), minutes: 0 }]);
    const dcLibre = addExercise(libre, exercises.get(dc)!, []).blocks[0];
    expect(dcLibre.kind === 'serie' && dcLibre.sets).toHaveLength(3);
  });

  it('removeBlock retire un seul bloc', () => {
    const w = seance();
    const nom = (b: Workout['blocks'][number]) => (b.kind === 'serie' ? b.exerciseId : b.kind);
    expect(removeBlock(w, 1).blocks.map(nom)).toEqual(w.blocks.filter((_, i) => i !== 1).map(nom));
  });

  it("retirer un exercice d'un superset : celui qui reste redevient normal, avec un repos", () => {
    const dos = workoutFromProgram(byId(PROG.dos), [], '2026-09-21', 1, 'w');
    const iMarteau = dos.blocks.findIndex((b) => b.kind === 'serie' && b.exerciseId === exId('curl-marteau'));
    const reste = removeBlock(dos, iMarteau + 1).blocks[iMarteau];
    expect(reste).toMatchObject({ exerciseId: exId('curl-marteau'), restSec: 90 });
    expect(reste.kind === 'serie' && 'superset' in reste).toBe(false);

    const prog = removeAt(byId(PROG.dos).blocks, iMarteau);
    expect(prog[iMarteau]).toEqual({ kind: 'serie', exerciseId: exId('curl-banc-incline'), sets: 4, target: '12', restSec: 90 });
  });
});

describe('ordre et supersets', () => {
  const ids = (blocks: { kind: string; exerciseId?: string; superset?: number; restSec?: number }[]) =>
    blocks.map((b) => (b.kind === 'circuit' ? 'circuit' : `${b.exerciseId!.slice(3)}${b.superset ? `#${b.superset}` : ''}`));
  const dos = byId(PROG.dos).blocks;

  it('insertBlock ajoute avant le circuit', () => {
    const ajout = insertBlock(dos, { kind: 'serie', exerciseId: exId('face-pull'), sets: 3, target: '15', restSec: 60 });
    expect(ids(ajout).slice(-2)).toEqual(['face-pull', 'circuit']);
  });

  it('moveGroup déplace un superset entier, et ne fusionne jamais deux supersets qui se retrouvent côte à côte', () => {
    // Groupes de Dos : tractions, bûcheron, tirage, pull over, [marteau + incliné], circuit.
    expect(ids(moveGroup(dos, 4, 1))).toEqual(['tractions', 'curl-marteau#1', 'curl-banc-incline#1', 'rowing-bucheron', 'tirage-horizontal', 'pull-over-poulie', 'circuit']);
    expect(moveGroup(dos, 4, 1)[2]).toMatchObject({ restSec: 90 });
    const deux = [
      { kind: 'serie', exerciseId: 'ex:a', superset: 1, restSec: 0 }, { kind: 'serie', exerciseId: 'ex:b', superset: 1, restSec: 60 },
      { kind: 'serie', exerciseId: 'ex:x', restSec: 90 },
      { kind: 'serie', exerciseId: 'ex:c', superset: 1, restSec: 0 }, { kind: 'serie', exerciseId: 'ex:d', superset: 1, restSec: 60 },
    ];
    expect(ids(moveGroup(deux, 1, 2))).toEqual(['a#1', 'b#1', 'c#2', 'd#2', 'x']);
    expect(moveGroup(dos, 2, 2)).toBe(dos);
  });

  it('setLinked : lier fusionne (repos seulement après le dernier, le plus long), délier rend un repos', () => {
    const pecs = byId(PROG.pecs).blocks; // …, écarté poulie basse (3), pull over haltère (4), circuit
    const lie = setLinked(pecs, 3, true);
    expect(linkedWithNext(lie, 3)).toBe(true);
    expect(ids(lie).slice(3, 5)).toEqual(['ecarte-poulie-basse#1', 'pull-over-haltere#1']);
    const repos = (b: (typeof pecs)[number]) => (b.kind === 'serie' ? b.restSec : null);
    expect([repos(lie[3]), repos(lie[4])]).toEqual([0, Math.max(repos(pecs[3])!, repos(pecs[4])!)]);
    const delie = setLinked(lie, 3, false);
    expect(ids(delie).slice(3, 5)).toEqual(['ecarte-poulie-basse', 'pull-over-haltere']);
    expect(repos(delie[3])).toBe(repos(lie[4]));
    expect(setLinked(pecs, 4, true)).toBe(pecs); // un circuit ne se lie pas

    // Dos : pull over lié au superset qui suit → superset de trois ; délier au milieu le coupe proprement.
    const trois = setLinked(dos, 3, true);
    expect(ids(trois).slice(3, 6)).toEqual(['pull-over-poulie#1', 'curl-marteau#1', 'curl-banc-incline#1']);
    expect(trois.slice(3, 6).map((b) => (b.kind === 'serie' ? b.restSec : null))).toEqual([0, 0, 90]);
    expect(ids(setLinked(trois, 3, false)).slice(3, 6)).toEqual(['pull-over-poulie', 'curl-marteau#1', 'curl-banc-incline#1']);
    expect(setLinked(trois, 3, false)[3]).toMatchObject({ restSec: 90 });
  });

  it('séance ↔ séance type : écart détecté sur les exercices, l’ordre et les supersets, pas sur une série de plus ni un cardio', () => {
    const programme = byId(PROG.dos);
    const w = workoutFromProgram(programme, [], '2026-09-21', 1, 'w');
    expect(differsFromProgram(programme, w)).toBe(false);
    const plusUneSerie = { ...w, blocks: w.blocks.map((b, i) => (i === 0 && b.kind === 'serie' ? { ...b, sets: [...b.sets, { done: false }] } : b)) };
    expect(differsFromProgram(programme, plusUneSerie)).toBe(false);
    expect(differsFromProgram(programme, addExercise(w, exercises.get(exId('course'))!, []))).toBe(false);

    const remplacee = replaceExercise(w, 1, exercises.get(exId('rowing-barre'))!, []);
    expect(differsFromProgram(programme, remplacee)).toBe(true);
    expect(programBlocksFromWorkout(programme, remplacee)[1]).toEqual({ kind: 'serie', exerciseId: exId('rowing-barre'), sets: 4, target: '10 D/G', restSec: 90 });
    const reordonnee = { ...w, blocks: moveGroup(w.blocks, 4, 0) };
    expect(differsFromProgram(programme, reordonnee)).toBe(true);
    expect(ids(programBlocksFromWorkout(programme, reordonnee)).slice(0, 3)).toEqual(['curl-marteau#1', 'curl-banc-incline#1', 'tractions']);
    expect(programBlocksFromWorkout(programme, w).at(-1)).toEqual(programme.blocks.at(-1)); // circuit rendu tel quel
  });
});
