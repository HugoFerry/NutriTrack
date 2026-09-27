import type { DateKey, Exercise, LoggedSet, MuscleGroup, Program, ProgramBlock, Workout, WorkoutBlock } from './types';
import { addDays, formatShort, rangeKeys } from './dates';
import { fmtQty } from './foods';

type SerieBlock = Extract<WorkoutBlock, { kind: 'serie' }>;

export const GROUP_FR: Record<MuscleGroup, string> = {
  dos: 'dos', pecs: 'pecs', epaules: 'épaules', biceps: 'biceps', triceps: 'triceps', jambes: 'jambes', abdos: 'abdos', cardio: 'cardio',
};

/** Séances terminées, de la plus ancienne à la plus récente. */
export function finishedWorkouts(workouts: Workout[]): Workout[] {
  return workouts.filter((w) => w.finishedAt).sort((a, b) => a.date.localeCompare(b.date) || a.startedAt - b.startedAt);
}

/** Répétitions visées : le haut de la fourchette (« 10-12 » → 12) ; null pour « échec », un aller-retour ou une durée (« 30 s »). */
export function targetReps(target: string): number | null {
  if (/\bAR\b|échec|echec|\d\s*s\b/i.test(target)) return null;
  const range = target.match(/(\d+)\s*(?:-|à)\s*(\d+)/);
  if (range) return Number(range[2]);
  const n = target.match(/^\s*(\d+)/);
  return n ? Number(n[1]) : null;
}

export interface Performance {
  date: DateKey;
  sets: LoggedSet[];
}

/** Séries faites la dernière fois sur cet exercice (hors séance `excludeId`, celle en cours). */
export function lastPerformance(exerciseId: string, workouts: Workout[], excludeId?: string): Performance | null {
  const list = finishedWorkouts(workouts).filter((w) => w.id !== excludeId);
  for (let i = list.length - 1; i >= 0; i--) {
    const b = list[i].blocks.find((x): x is SerieBlock => x.kind === 'serie' && x.exerciseId === exerciseId);
    const done = b?.sets.filter((s) => s.done) ?? [];
    if (done.length) return { date: list[i].date, sets: done };
  }
  return null;
}

/** « 22 kg × 6, 6, 6, 5 » ou « 8, 8, 7, 6 reps » (poids du corps). */
export function fmtSets(sets: LoggedSet[]): string {
  if (!sets.length) return '';
  const reps = sets.map((s) => (s.sec ? `${s.sec} s` : String(s.reps ?? '?'))).join(', ');
  const loads = [...new Set(sets.map((s) => s.kg ?? 0))];
  if (loads.length === 1) return loads[0] ? `${fmtQty(loads[0])} kg × ${reps}` : `${reps} reps`;
  return sets.map((s) => `${s.kg ? `${fmtQty(s.kg)}×` : ''}${s.sec ? `${s.sec} s` : s.reps ?? '?'}`).join(', ');
}

/**
 * Double progression : si toutes les séries prévues ont atteint le haut de la fourchette
 * avec la même charge, proposer d'augmenter.
 */
export function progressionHint(target: string, plannedSets: number, last: Performance | null, kind: Exercise['kind']): string | null {
  const top = targetReps(target);
  if (!last || !top || last.sets.length < plannedSets || !last.sets.every((s) => (s.reps ?? 0) >= top)) return null;
  const loads = [...new Set(last.sets.map((s) => s.kg ?? 0))];
  if (loads.length !== 1) return null;
  if (kind === 'charge' && loads[0] > 0) return `Toutes les séries à ${top} reps la dernière fois : tente ${fmtQty(loads[0] + 2.5)} kg.`;
  if (kind === 'pdc') return `Toutes les séries à ${top} reps la dernière fois : ajoute du lest (2,5 kg) ou une répétition.`;
  return null;
}

/**
 * Nouvelle séance à partir d'une séance type, pré-remplie avec la dernière performance de chaque exercice
 * jusqu'à `date` : une séance saisie a posteriori ne reprend pas les charges des séances qui l'ont suivie.
 */
export function workoutFromProgram(program: Program, workouts: Workout[], date: DateKey, now: number, id: string): Workout {
  const earlier = workouts.filter((w) => w.date <= date);
  const blocks: WorkoutBlock[] = program.blocks.map((b: ProgramBlock): WorkoutBlock => {
    if (b.kind === 'circuit') return { kind: 'circuit', items: b.items, workSec: b.workSec, restSec: b.restSec, rounds: b.rounds, roundsDone: 0 };
    const last = lastPerformance(b.exerciseId, earlier);
    const reps = targetReps(b.target) ?? undefined;
    const sets: LoggedSet[] = Array.from({ length: b.sets }, (_, i) => {
      const prev = last?.sets[Math.min(i, last.sets.length - 1)];
      return { reps: prev?.reps ?? reps, kg: prev?.kg, done: false };
    });
    return { kind: 'serie', exerciseId: b.exerciseId, target: b.target, restSec: b.restSec, sets };
  });
  return { id, date, programId: program.id, name: program.name, blocks, startedAt: now, createdAt: now };
}

export interface Suggestion {
  program: Program | null;
  reason: string;
  excluded: { program: Program; why: string }[];
}

/**
 * Séance suggérée pour `day` : on écarte celles que les règles d'enchaînement interdisent
 * (lendemain de…, seulement après…), puis on prend la plus ancienne (jamais faite d'abord).
 * Une cinquième séance dans la semaine refait donc naturellement la première.
 */
export function suggestSession(programs: Program[], workouts: Workout[], day: DateKey): Suggestion {
  const done = finishedWorkouts(workouts).filter((w) => w.date < day && w.programId);
  const last = done[done.length - 1];
  const veille = new Set(done.filter((w) => w.date === addDays(day, -1)).map((w) => w.programId!));
  const lastDate = (id: string) => [...done].reverse().find((w) => w.programId === id)?.date ?? '';
  const name = (id: string) => programs.find((p) => p.id === id)?.name ?? id;
  const excluded: Suggestion['excluded'] = [];
  const allowed: Program[] = [];
  for (const p of programs) {
    const blockedBy = (p.notDayAfter ?? []).find((id) => veille.has(id));
    if (blockedBy) {
      excluded.push({ program: p, why: `pas le lendemain de ${name(blockedBy)}` });
      continue;
    }
    if (p.onlyAfter?.length && !(last?.programId && p.onlyAfter.includes(last.programId))) {
      excluded.push({ program: p, why: `seulement après ${p.onlyAfter.map(name).join(' ou ')}` });
      continue;
    }
    allowed.push(p);
  }
  allowed.sort((a, b) => lastDate(a.id).localeCompare(lastDate(b.id)) || a.order - b.order);
  const pick = allowed[0] ?? null;
  if (!pick) return { program: null, reason: 'Aucune séance permise par tes règles : repos ou cardio léger.', excluded };
  const d = lastDate(pick.id);
  const ago = d ? rangeKeys(d, day).length - 1 : 0;
  const reason = d ? `Dernière fois ${formatShort(d).toLowerCase()} (il y a ${ago} jour${ago > 1 ? 's' : ''}).` : 'Pas encore faite.';
  return { program: pick, reason, excluded };
}

export interface SessionStats {
  sets: number;
  /** Tonnage : somme charge × répétitions des séries faites. */
  tonnage: number;
  groups: MuscleGroup[];
}

export function sessionStats(w: Workout, exercises: Map<string, Exercise>): SessionStats {
  let sets = 0;
  let tonnage = 0;
  const groups = new Set<MuscleGroup>();
  for (const b of w.blocks) {
    if (b.kind === 'serie') {
      const done = b.sets.filter((s) => s.done);
      sets += done.length;
      tonnage += done.reduce((t, s) => t + (s.kg ?? 0) * (s.reps ?? 0), 0);
      if (done.length) exercises.get(b.exerciseId)?.groups.forEach((g) => groups.add(g));
    } else if (b.kind === 'circuit' && b.roundsDone > 0) {
      b.items.forEach((it) => exercises.get(it.exerciseId)?.groups.forEach((g) => groups.add(g)));
    } else if (b.kind === 'cardio') {
      groups.add('cardio');
    }
  }
  return { sets, tonnage: Math.round(tonnage), groups: [...groups] };
}

/** Allure en min/km, « 5:45 /km ». */
export function pace(minutes: number, km?: number): string | null {
  if (!km || km <= 0 || minutes <= 0) return null;
  const secPerKm = Math.round((minutes * 60) / km);
  return `${Math.floor(secPerKm / 60)}:${String(secPerKm % 60).padStart(2, '0')} /km`;
}

const exName = (exercises: Map<string, Exercise>, id: string) => exercises.get(id)?.name ?? id;
const restTxt = (sec?: number) => (sec ? (sec % 60 ? `${Math.floor(sec / 60)} min ${sec % 60}` : `${sec / 60} min`) : '');

/** Programme en texte compact (prompt du coach). */
export function programText(programs: Program[], exercises: Map<string, Exercise>): string {
  return programs
    .map((p) => {
      const parts = p.blocks.map((b) =>
        b.kind === 'serie'
          ? `${exName(exercises, b.exerciseId)} ${b.sets}×${b.target} (repos ${restTxt(b.restSec)})`
          : `circuit ×${b.rounds}${b.workSec ? ` ${b.workSec}/${b.restSec ?? 0} s` : ''} : ${b.items.map((it) => `${exName(exercises, it.exerciseId)} ${it.target}`).join(', ')}`,
      );
      return `- ${p.name} : ${parts.join(' ; ')}`;
    })
    .join('\n');
}

/** Une séance en une ligne : durée, ressenti, volume, meilleures séries ou cardio. */
export function workoutLine(w: Workout, exercises: Map<string, Exercise>): string {
  const st = sessionStats(w, exercises);
  const head = [
    w.name,
    w.finishedAt ? null : 'en cours',
    w.durationMin ? `${w.durationMin} min` : null,
    w.rpe ? `ressenti ${w.rpe}/10` : null,
    st.sets ? `${st.sets} séries` : null,
    st.groups.length ? `groupes ${st.groups.map((g) => GROUP_FR[g]).join('/')}` : null,
  ].filter(Boolean).join(', ');
  const detail = w.blocks
    .map((b) => {
      if (b.kind === 'serie') {
        const done = b.sets.filter((s) => s.done);
        return done.length ? `${exName(exercises, b.exerciseId)} ${fmtSets(done)}` : null;
      }
      if (b.kind === 'circuit') return b.roundsDone ? `circuit ${b.roundsDone}/${b.rounds} tours` : null;
      const p = pace(b.minutes, b.km);
      return `${exName(exercises, b.exerciseId)} ${b.minutes} min${b.km ? `, ${fmtQty(b.km)} km` : ''}${p ? ` (${p})` : ''}`;
    })
    .filter(Boolean)
    .join(' ; ');
  return `${head}${detail ? ` — ${detail}` : ''}${w.notes ? ` — note : ${w.notes}` : ''}`;
}

/** Les `days` derniers jours, du plus ancien à aujourd'hui : séances ou repos (prompt du coach). */
export function recentTrainingText(workouts: Workout[], exercises: Map<string, Exercise>, today: DateKey, days = 14): string {
  return rangeKeys(addDays(today, -(days - 1)), today)
    .map((d) => {
      const list = workouts.filter((w) => w.date === d).sort((a, b) => a.startedAt - b.startedAt);
      const label = `${formatShort(d)}${d === today ? " (aujourd'hui)" : ''}`;
      return `- ${label} : ${list.length ? list.map((w) => workoutLine(w, exercises)).join(' | ') : 'repos'}`;
    })
    .join('\n');
}

/** Apport moyen des jours saisis (kcal, protéines). */
export function intakeAverages(entries: { date: DateKey; cal: number; p: number }[]): { avgCal: number; avgP: number; loggedDays: number } {
  const days = new Map<DateKey, { cal: number; p: number }>();
  for (const e of entries) {
    const d = days.get(e.date) ?? { cal: 0, p: 0 };
    d.cal += e.cal;
    d.p += e.p;
    days.set(e.date, d);
  }
  const list = [...days.values()].filter((d) => d.cal > 0);
  if (!list.length) return { avgCal: 0, avgP: 0, loggedDays: 0 };
  const avg = (f: (d: { cal: number; p: number }) => number) => Math.round(list.reduce((s, d) => s + f(d), 0) / list.length);
  return { avgCal: avg((d) => d.cal), avgP: avg((d) => d.p), loggedDays: list.length };
}

/** Pour le coach : séance du jour en cours, déjà faite, ou suggérée avec les séances écartées et pourquoi. */
export function suggestionText(programs: Program[], workouts: Workout[], day: DateKey): string {
  const todays = workouts.filter((w) => w.date === day);
  const current = todays.find((w) => !w.finishedAt);
  if (current) return `Séance en cours aujourd'hui : ${current.name}.`;
  const done = todays.filter((w) => w.finishedAt);
  const faitTxt = done.length ? `Déjà fait aujourd'hui : ${done.map((w) => w.name).join(', ')}.` : '';
  // Une séance du programme faite : plus de suggestion pour aujourd'hui. Un cardio seul n'en tient pas lieu.
  if (done.some((w) => w.programId)) return faitTxt;
  const s = suggestSession(programs, workouts, day);
  const ex = s.excluded.length ? ` Écartées par ses règles : ${s.excluded.map((e) => `${e.program.name} (${e.why})`).join(', ')}.` : '';
  const sugg = s.program ? `Séance suggérée par l'app aujourd'hui : ${s.program.name}. ${s.reason}${ex}` : `${s.reason}${ex}`;
  return faitTxt ? `${faitTxt} ${sugg}` : sugg;
}
