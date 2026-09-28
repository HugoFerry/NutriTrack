const EMPTY: never[] = [];
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, newId } from '../../data/db';
import { deleteWorkout, resetProgram, saveProgram, saveWorkout } from '../../data/repos';
import { CARDIO_IDS, SEED_PROGRAMS } from '../../data/training-seed';
import { addDays, formatLong, formatShort, rangeKeys, todayKey, weekday } from '../../domain/dates';
import { fmtQty } from '../../domain/foods';
import {
  GROUP_FR, addExercise, differsFromProgram, fmtSets, groupBlocks, lastPerformance, pace, programBlocksFromWorkout, progressionHint, removeBlock, replaceExercise,
  sessionStats, suggestSession, workoutFromProgram, type BlockSpec,
} from '../../domain/training';
import type { Exercise, LoggedSet, Program, Settings, Workout, WorkoutBlock, WorkoutExtras } from '../../domain/types';
import { COMMUTE_FR, DEFAULT_COMMUTE, DEFAULT_TREADMILL, commuteKcal, roundTrip, treadmillKcal } from '../../domain/activity';
import { IconCheck, IconEdit, IconPlus, IconTrash } from '../components/Icons';
import { Sheet } from '../components/Sheet';
import { ToggleRow } from '../components/Switch';
import { useToast } from '../components/Toast';
import { exName, restLabel, setsLabel, type ExMap } from '../sportText';
import { BlockOrderList, ExercisePicker, ProgramEditor } from './SportEditors';
import { NumInput } from '../components/NumInput';

type SerieBlock = Extract<WorkoutBlock, { kind: 'serie' }>;

const DAY_LETTERS = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
const clock = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;

/** Résumé d'une séance terminée : durée, ressenti, séries, tonnage ou cardio. */
function summary(w: Workout, m: ExMap): string {
  const st = sessionStats(w, m);
  const cardio = w.blocks.find((b) => b.kind === 'cardio');
  const parts = [
    w.durationMin ? `${w.durationMin} min` : null,
    w.rpe ? `ressenti ${w.rpe}/10` : null,
    st.sets ? `${st.sets} séries` : null,
    st.tonnage ? `${st.tonnage.toLocaleString('fr-FR')} kg soulevés` : null,
    cardio?.kind === 'cardio' && cardio.km ? `${fmtQty(cardio.km)} km${pace(cardio.minutes, cardio.km) ? ` · ${pace(cardio.minutes, cardio.km)}` : ''}` : null,
    w.extras?.commute ? `${COMMUTE_FR[w.extras.commute.mode]} ${fmtQty(w.extras.commute.km)} km` : null,
    w.extras?.treadmill ? `tapis ${w.extras.treadmill.minutes} min` : null,
  ];
  return parts.filter(Boolean).join(' · ');
}

export function SportScreen({ settings }: { settings: Settings }) {
  const today = todayKey();
  // Trajet habituel coché d'office sur chaque séance (aller-retour), décochable séance par séance.
  const withCommute = (w: Workout): Workout => ({ ...w, extras: { commute: roundTrip(settings.commute ?? DEFAULT_COMMUTE) } });
  const programs = useLiveQuery(() => db.programs.orderBy('order').toArray(), []) ?? EMPTY;
  const exercises = useLiveQuery(() => db.exercises.toArray(), []) ?? EMPTY;
  const workouts = useLiveQuery(() => db.workouts.orderBy('date').toArray(), []) ?? EMPTY;
  const exMap = useMemo<ExMap>(() => new Map(exercises.map((e) => [e.id, e])), [exercises]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [cardioDate, setCardioDate] = useState<string | null>(null);
  const [pastDate, setPastDate] = useState<string | null>(null);
  const [progOpen, setProgOpen] = useState<string | null>(null);
  const [editing, setEditing] = useState<Program | null>(null);
  const starting = useRef(false);
  const toast = useToast();

  const inProgress = workouts.find((w) => !w.finishedAt);
  const todayDone = workouts.filter((w) => w.date === today && w.finishedAt);
  // Seule une séance du programme reporte la suggestion au lendemain : un cardio du matin n'en tient pas lieu.
  const liftedToday = todayDone.some((w) => w.programId);
  const suggestionDay = liftedToday ? addDays(today, 1) : today;
  const sugg = useMemo(() => suggestSession(programs, workouts, suggestionDay), [programs, workouts, suggestionDay]);
  const history = useMemo(() => workouts.filter((w) => w.finishedAt).reverse().slice(0, 20), [workouts]);
  const opened = workouts.find((w) => w.id === openId);

  const wd = weekday(today);
  const monday = addDays(today, wd === 0 ? -6 : 1 - wd);
  const week = rangeKeys(monday, addDays(monday, 6));
  const weekDone = workouts.filter((w) => w.finishedAt && w.date >= monday && w.date <= week[6]);

  /** Crée puis ouvre une séance, sauf s'il y en a déjà une en cours (qu'on rouvre alors). */
  const begin = async (make: () => Workout) => {
    // Un double appui rapide ne doit pas créer deux séances en cours : verrou, puis vérification dans la base.
    if (starting.current) return;
    starting.current = true;
    try {
      const current = inProgress ?? (await db.workouts.filter((x) => !x.finishedAt).first());
      if (current) {
        setOpenId(current.id);
        toast(`Séance en cours : ${current.name}`);
        return;
      }
      const w = make();
      await saveWorkout(w);
      setOpenId(w.id);
    } finally {
      starting.current = false;
    }
  };
  /** Séance du programme, aujourd'hui ou a posteriori pour un jour passé. */
  const start = (p: Program, date: string = today) => begin(() => withCommute(workoutFromProgram(p, workouts, date, Date.now(), newId())));
  /** Séance libre : aucun exercice au départ, on ajoute ceux qu'on fait depuis le catalogue. */
  const startFree = (date: string = today) => begin(() => {
    const now = Date.now();
    return withCommute({ id: newId(), date, name: 'Séance libre', blocks: [], startedAt: now, createdAt: now });
  });

  const others = programs.filter((p) => p.id !== sugg.program?.id);
  const why = (p: Program) => sugg.excluded.find((e) => e.program.id === p.id)?.why;

  return (
    <div>
      {/* ---------- Aujourd'hui ---------- */}
      <div className="card hero">
        {inProgress ? (
          <>
            <div className="xs muted" style={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>Séance en cours</div>
            <div style={{ fontSize: 22, fontWeight: 600, marginTop: 2 }}>{inProgress.name}</div>
            <div className="small muted">{inProgress.date === today
              ? `Commencée à ${new Date(inProgress.startedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`
              : `Séance du ${formatShort(inProgress.date).toLowerCase()}, saisie a posteriori`}</div>
            <button className="btn lg block mt12" onClick={() => setOpenId(inProgress.id)}>Reprendre</button>
          </>
        ) : (
          <>
            {todayDone.length > 0 && (
              <div className="mb12">
                <div className="xs muted" style={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>Aujourd'hui</div>
                {todayDone.map((w) => (
                  <div key={w.id} className="bold c-acc mt4">✓ {w.name} <span className="small muted" style={{ fontWeight: 400 }}>{summary(w, exMap)}</span></div>
                ))}
              </div>
            )}
            <div className="xs muted" style={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>{liftedToday ? 'Prochaine séance suggérée' : 'Séance suggérée'}</div>
            <div style={{ fontSize: 22, fontWeight: 600, marginTop: 2 }}>{sugg.program?.name ?? 'Repos ou cardio léger'}</div>
            <div className="small muted">{sugg.reason}</div>
            {sugg.excluded.length > 0 && <div className="xs muted mt4">Écartées : {sugg.excluded.map((e) => `${e.program.name} (${e.why})`).join(', ')}.</div>}
            {sugg.program && !liftedToday && <button className="btn lg block mt12" onClick={() => start(sugg.program!)}>Démarrer {sugg.program.name}</button>}
            <div className="chips mt12">
              {(liftedToday ? programs : others).map((p) => (
                <button key={p.id} className="chip" onClick={() => start(p)} title={why(p) ? `Tes règles l'écartent : ${why(p)}` : undefined}>
                  {p.name}{why(p) ? ' ·' : ''}
                </button>
              ))}
              <button className="chip" onClick={() => startFree()}>＋ Séance libre</button>
              <button className="chip" onClick={() => setCardioDate(today)}>🏃 Cardio</button>
              <button className="chip" onClick={() => setPastDate(addDays(today, -1))}>📅 Autre jour</button>
            </div>
          </>
        )}
      </div>

      {/* ---------- Semaine ---------- */}
      <div className="card">
        <div className="sec"><span>Cette semaine</span><span className="link" style={{ color: 'var(--tx2)' }}>{weekDone.length} séance{weekDone.length > 1 ? 's' : ''}</span></div>
        <div className="week">
          {week.map((d) => {
            const list = weekDone.filter((w) => w.date === d);
            // Toucher un jour passé (ou aujourd'hui) permet d'y saisir une séance oubliée.
            return (
              <button key={d} className={'d' + (d === today ? ' today' : '')} disabled={d > today} onClick={() => setPastDate(d)} aria-label={`Séances du ${formatShort(d)}`}>
                <div className="l">{DAY_LETTERS[weekday(d)]}</div>
                {list.map((w) => <div key={w.id} className="s">{w.name.split(' ')[0]}</div>)}
              </button>
            );
          })}
        </div>
      </div>

      {/* ---------- Historique ---------- */}
      <div className="card">
        <div className="sec"><span>Historique</span></div>
        {history.length ? (
          <div className="list">
            {history.map((w) => (
              <button key={w.id} className="item compact" onClick={() => setOpenId(w.id)}>
                <div className="grow" style={{ textAlign: 'left' }}>
                  <div className="name">{w.name} <span className="muted small" style={{ fontWeight: 400 }}>· {formatShort(w.date)}</span></div>
                  <div className="meta">{summary(w, exMap) || 'Terminée'}</div>
                </div>
              </button>
            ))}
          </div>
        ) : <div className="empty">Tes séances apparaîtront ici. Démarre la séance suggérée, note un cardio, ou renseigne une séance passée avec « Autre jour ».</div>}
      </div>

      {/* ---------- Programme ---------- */}
      <div className="card">
        <div className="sec"><span>Programme</span></div>
        <div className="list">
          {programs.map((p) => (
            <div key={p.id}>
              <button className="item compact" style={{ width: '100%' }} onClick={() => setProgOpen(progOpen === p.id ? null : p.id)}>
                <div className="grow" style={{ textAlign: 'left' }}>
                  <div className="name">{p.name} {p.source === 'custom' && <span className="badge acc">modifiée</span>}</div>
                  <div className="meta">{p.blocks.filter((b) => b.kind === 'serie').length} exercices{p.blocks.some((b) => b.kind === 'circuit') ? ' + circuit' : ''}{p.notDayAfter?.length ? ` · jamais le lendemain de ${p.notDayAfter.map((id) => programs.find((x) => x.id === id)?.name).join(' ou ')}` : ''}{p.onlyAfter?.length ? ` · seulement après ${p.onlyAfter.map((id) => programs.find((x) => x.id === id)?.name).join(' ou ')}` : ''}</div>
                </div>
              </button>
              {progOpen === p.id && (
                <div className="prog-detail">
                  {groupBlocks(p.blocks).map((g) => {
                    const b = p.blocks[g[0]];
                    if (b.kind === 'circuit') {
                      return <div key={g[0]} className="small mt4"><b>Circuit ×{b.rounds}</b>{b.workSec ? <span className="muted"> · {b.workSec} s / {b.restSec} s</span> : b.restSec ? <span className="muted"> · repos {b.restSec} s par tour</span> : null}<div className="muted">{b.items.map((it) => `${exName(exMap, it.exerciseId)} ${it.target}`).join(' · ')}</div></div>;
                    }
                    const lines = g.map((i) => p.blocks[i]).map((x, k) => x.kind === 'serie' && (
                      <div key={k} className="small"><b>{exName(exMap, x.exerciseId)}</b> <span className="muted">{setsLabel(x.sets, x.target)}{x.restSec ? ` · repos ${restLabel(x.restSec)}` : ''}</span></div>
                    ));
                    return g.length > 1
                      ? <div key={g[0]} className="superset"><div className="xs c-acc bold">Superset · enchaîné sans pause</div>{lines}</div>
                      : <div key={g[0]}>{lines}</div>;
                  })}
                  <div className="row mt8" style={{ gap: 8, flexWrap: 'wrap' }}>
                    <button className="btn sm" onClick={() => start(p)}>Démarrer</button>
                    <button className="btn sm ghost" onClick={() => setEditing(p)}><IconEdit style={{ width: 14, height: 14 }} /> Modifier</button>
                    {p.source === 'custom' && SEED_PROGRAMS.some((s) => s.id === p.id) && (
                      <button className="btn sm ghost" onClick={async () => { await resetProgram(p.id); toast(`${p.name} : version d'origine rétablie`); }}>Revenir à l'origine</button>
                    )}
                  </div>
                  {p.source === 'custom' && <div className="xs muted">Modifiée : les mises à jour du programme de départ ne la touchent plus.</div>}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {editing && <ProgramEditor key={editing.id} program={editing} exercises={exercises} exMap={exMap} onClose={() => setEditing(null)} />}
      {opened && <WorkoutSheet key={opened.id} initial={opened} workouts={workouts} programs={programs} exercises={exercises} exMap={exMap} settings={settings} onClose={() => setOpenId(null)} />}
      {cardioDate && <CardioSheet date={cardioDate} today={today} exMap={exMap} onClose={() => setCardioDate(null)} />}
      {pastDate && (
        <PastSessionSheet initialDate={pastDate} today={today} programs={programs} workouts={workouts} exMap={exMap} onClose={() => setPastDate(null)}
          onStart={(p, d) => { setPastDate(null); start(p, d); }}
          onFree={(d) => { setPastDate(null); startFree(d); }}
          onCardio={(d) => { setPastDate(null); setCardioDate(d); }}
          onOpen={(id) => { setPastDate(null); setOpenId(id); }} />
      )}
    </div>
  );
}

function RpeChips({ value, onChange }: { value?: number; onChange: (v: number) => void }) {
  return (
    <div>
      <div className="chips">{Array.from({ length: 10 }, (_, i) => i + 1).map((n) => <button key={n} className={'chip' + (value === n ? ' on' : '')} onClick={() => onChange(n)}>{n}</button>)}</div>
      <div className="xs muted mt4">1 = très facile · 7 = dur, 2-3 reps en réserve · 10 = maximal</div>
    </div>
  );
}

/**
 * Saisie d'une séance : séries pré-remplies, minuteur de repos, circuits, fin de séance. Enregistre à chaque geste.
 * Les exercices se changent, se retirent, s'ajoutent et se réordonnent pour cette séance ; la séance type ne change
 * que si on le choisit en terminant (ou depuis son éditeur, dans la liste du programme).
 */
function WorkoutSheet({ initial, workouts, programs, exercises, exMap, settings, onClose }: {
  initial: Workout; workouts: Workout[]; programs: Program[]; exercises: Exercise[]; exMap: ExMap; settings: Settings; onClose: () => void;
}) {
  const [w, setW] = useState<Workout>(initial);
  const [rest, setRest] = useState<{ until: number } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [finishing, setFinishing] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  // Catalogue ouvert pour remplacer le bloc `replace`, ou pour ajouter. Une séance libre vide l'ouvre d'emblée.
  const [picker, setPicker] = useState<{ replace?: number } | null>(() => (!initial.programId && !initial.blocks.length && !initial.finishedAt ? {} : null));
  const [adding, setAdding] = useState<Exercise | null>(null);
  const [removing, setRemoving] = useState<number | null>(null);
  const [ordering, setOrdering] = useState(false);
  const program = programs.find((p) => p.id === w.programId);
  const toast = useToast();
  const finished = !!w.finishedAt;
  // Séance d'un jour passé (saisie a posteriori) : ni chronomètre ni minuteur de repos, la durée se saisit à la fin.
  const today = todayKey();
  const past = w.date < today;
  // « Dernière fois » : seulement les séances antérieures à celle-ci (utile quand on rouvre une ancienne séance).
  const before = useMemo(
    () => workouts.filter((x) => x.id !== w.id && (x.date < w.date || (x.date === w.date && x.startedAt < w.startedAt))),
    [workouts, w.id, w.date, w.startedAt],
  );

  useEffect(() => {
    const t = setInterval(() => {
      const n = Date.now();
      setNow(n);
      setRest((r) => {
        if (r && n >= r.until) {
          navigator.vibrate?.(400);
          return null;
        }
        return r;
      });
    }, 500);
    return () => clearInterval(t);
  }, []);

  const update = (next: Workout) => {
    setW(next);
    saveWorkout(next).catch(() => toast('Enregistrement impossible', 'err'));
  };
  const setBlock = (i: number, b: WorkoutBlock) => update({ ...w, blocks: w.blocks.map((x, j) => (j === i ? b : x)) });

  // Autour de la séance : trajet et tapis incliné, hors exercices et hors séance type.
  const extras = w.extras ?? {};
  const setExtras = (next: WorkoutExtras) => update({ ...w, extras: next.commute || next.treadmill ? next : undefined });
  const lastTreadmill = useMemo(() => [...before].reverse().find((x) => x.extras?.treadmill)?.extras?.treadmill, [before]);
  const weight = settings.profile.weight;
  const setSet = (i: number, j: number, patch: Partial<LoggedSet>) => {
    const b = w.blocks[i] as SerieBlock;
    setBlock(i, { ...b, sets: b.sets.map((s, k) => (k === j ? { ...s, ...patch } : s)) });
  };
  const toggleDone = (i: number, j: number) => {
    const b = w.blocks[i] as SerieBlock;
    const done = !b.sets[j].done;
    setSet(i, j, { done });
    if (done && b.restSec && !finished && !past) setRest({ until: Date.now() + b.restSec * 1000 });
  };
  const addSet = (i: number) => {
    const b = w.blocks[i] as SerieBlock;
    const last = b.sets[b.sets.length - 1];
    setBlock(i, { ...b, sets: [...b.sets, { reps: last?.reps, kg: last?.kg, sec: last?.sec, done: false }] });
  };

  /** Exercice choisi dans le catalogue : remplace le bloc visé (à sa place), ou passe à la saisie des séries pour un ajout. */
  const pick = (ex: Exercise) => {
    const target = picker?.replace;
    setPicker(null);
    setRemoving(null);
    if (target !== undefined) return update(replaceExercise(w, target, ex, workouts));
    if (ex.kind === 'cardio') return update(addExercise(w, ex, workouts));
    setAdding(ex);
  };
  const add = (spec: BlockSpec) => {
    if (!adding) return;
    update(addExercise(w, adding, workouts, spec));
    setAdding(null);
  };
  const remove = (i: number) => {
    setRemoving(null);
    update(removeBlock(w, i));
  };

  const blockTools = (i: number, replaceable: boolean) => (
    <div className="row" style={{ gap: 4 }}>
      {replaceable && <button className="btn sm ghost icon" onClick={() => { setRemoving(null); setPicker({ replace: i }); }} aria-label="Changer d'exercice" title="Changer d'exercice"><IconEdit style={{ width: 15, height: 15 }} /></button>}
      <button className="btn sm ghost icon" onClick={() => setRemoving(removing === i ? null : i)} aria-label="Retirer" title="Retirer de la séance"><IconTrash style={{ width: 15, height: 15 }} /></button>
    </div>
  );
  const removeConfirm = (i: number) => removing === i && (
    <div className="row mt8" style={{ gap: 6, flexWrap: 'wrap' }}>
      <button className="btn sm danger" onClick={() => remove(i)}>Retirer de cette séance</button>
      <button className="btn sm ghost" onClick={() => setRemoving(null)}>Annuler</button>
    </div>
  );

  // Clé par position et exercice : un bloc retiré ou remplacé ne laisse pas ses saisies en cours au suivant.
  const blockKey = (b: WorkoutBlock, i: number) => `${i}-${b.kind === 'circuit' ? 'circuit' : b.exerciseId}`;
  const renderBlock = (b: WorkoutBlock, i: number) => {
    if (b.kind === 'serie') {
      const ex = exMap.get(b.exerciseId);
      const kind = ex?.kind ?? 'charge';
      const last = lastPerformance(b.exerciseId, before);
      const hint = progressionHint(b.target ?? '', b.sets.length, last, kind);
      const aller = /\bAR\b/.test(b.target ?? '');
      const showReps = kind !== 'temps' && !aller;
      const showKg = kind === 'charge' || kind === 'pdc' || kind === 'distance';
      const cols = [showReps, kind === 'temps', showKg].filter(Boolean).length;
      return (
        <div key={blockKey(b, i)} className="ex-block">
          <div className="row between" style={{ alignItems: 'flex-start' }}>
            <div className="grow">
              <div className="bold">{exName(exMap, b.exerciseId)}</div>
              <div className="xs muted">{setsLabel(b.sets.length, b.target)}{b.restSec ? ` · repos ${restLabel(b.restSec)}` : ''}{ex?.groups.length ? ` · ${ex.groups.map((g) => GROUP_FR[g]).join(', ')}` : ''}</div>
            </div>
            {blockTools(i, true)}
          </div>
          {removeConfirm(i)}
          {last && <div className="xs dim mt4">Dernière fois ({formatShort(last.date).toLowerCase()}) : {fmtSets(last.sets)}</div>}
          {hint && <div className="xs c-acc mt4">{hint}</div>}
          {b.sets.map((s, j) => (
            <div key={j} className={'set-row' + (cols === 1 ? ' one' : '') + (s.done ? ' done' : '')}>
              <span className="n">{j + 1}</span>
              {showReps && <NumInput value={s.reps} onChange={(v) => setSet(i, j, { reps: v })} placeholder={ex?.perSide ? 'reps/côté' : 'reps'} />}
              {kind === 'temps' && <NumInput value={s.sec} onChange={(v) => setSet(i, j, { sec: v })} placeholder="sec" />}
              {showKg && <NumInput value={s.kg} onChange={(v) => setSet(i, j, { kg: v })} placeholder={kind === 'pdc' ? 'lest kg' : 'kg'} />}
              <button className={'set-ok' + (s.done ? ' on' : '')} onClick={() => toggleDone(i, j)} aria-label={s.done ? 'Série faite' : 'Valider la série'}><IconCheck style={{ width: 18, height: 18 }} /></button>
            </div>
          ))}
          <button className="btn sm ghost mt8" onClick={() => addSet(i)}><IconPlus style={{ width: 14, height: 14 }} /> Série</button>
        </div>
      );
    }
    if (b.kind === 'circuit') {
      return (
        <div key={blockKey(b, i)} className="ex-block">
          <div className="row between">
            <div className="grow">
              <div className="bold">Circuit ×{b.rounds}</div>
              <div className="xs muted">{b.workSec ? `${b.workSec} s d'effort / ${b.restSec ?? 0} s de récupération` : b.restSec ? `repos ${b.restSec} s en fin de tour` : 'enchaîné'}</div>
            </div>
            <div className="row" style={{ gap: 6 }}>
              <button className="btn sm ghost" onClick={() => setBlock(i, { ...b, roundsDone: Math.max(0, b.roundsDone - 1) })} aria-label="Un tour de moins">−</button>
              <b style={{ minWidth: 38, textAlign: 'center' }}>{b.roundsDone}/{b.rounds}</b>
              <button className="btn sm" onClick={() => setBlock(i, { ...b, roundsDone: Math.min(b.rounds, b.roundsDone + 1) })} aria-label="Un tour de plus">+</button>
              {blockTools(i, false)}
            </div>
          </div>
          {removeConfirm(i)}
          <div className="small dim mt8">{b.items.map((it) => `${exName(exMap, it.exerciseId)} ${it.target}`).join(' · ')}</div>
        </div>
      );
    }
    return (
      <div key={blockKey(b, i)} className="ex-block">
        <div className="row between">
          <div className="bold grow">{exName(exMap, b.exerciseId)}</div>
          {blockTools(i, false)}
        </div>
        {removeConfirm(i)}
        <div className="grid2 mt8">
          <div className="field"><label>Minutes</label><NumInput value={b.minutes} onChange={(v) => setBlock(i, { ...b, minutes: v ?? 0 })} /></div>
          <div className="field"><label>Kilomètres</label><NumInput value={b.km} onChange={(v) => setBlock(i, { ...b, km: v })} placeholder="optionnel" /></div>
        </div>
        {pace(b.minutes, b.km) && <div className="xs muted mt4">Allure {pace(b.minutes, b.km)}</div>}
      </div>
    );
  };

  const elapsed = Math.max(0, Math.round((now - w.startedAt) / 60000));
  const left = rest ? Math.max(0, Math.ceil((rest.until - now) / 1000)) : 0;

  return (
    <>
      <Sheet open onClose={onClose} full title={<span>{w.name} <span className="muted small">· {formatShort(w.date)}</span></span>}
        right={!finished && !past ? <span className="small muted">{elapsed} min</span> : undefined}
        footer={
          <div className="col">
            {rest && (
              <div className="rest-bar">
                <span>Repos</span><b>{clock(left)}</b>
                <button className="btn sm ghost" onClick={() => setRest(null)}>Passer</button>
              </div>
            )}
            {confirmDel ? (
              <div className="row">
                <button className="btn danger grow" onClick={async () => { await deleteWorkout(w.id); toast('Séance supprimée'); onClose(); }}>Supprimer la séance</button>
                <button className="btn ghost" onClick={() => setConfirmDel(false)}>Non</button>
              </div>
            ) : (
              <div className="row">
                <button className="btn ghost icon" onClick={() => setConfirmDel(true)} aria-label="Supprimer" style={{ color: 'var(--red)' }}><IconTrash style={{ width: 18, height: 18 }} /></button>
                {finished
                  ? <button className="btn lg grow" onClick={onClose}>Fermer</button>
                  : <button className="btn lg grow" onClick={() => setFinishing(true)}>Terminer la séance</button>}
              </div>
            )}
          </div>
        }>
        <div className={w.programId ? 'mb8' : 'grid2 mb8'}>
          <div className="field">
            <label>Date</label>
            <input className="input" type="date" max={today} value={w.date}
              onChange={(e) => { const v = e.target.value; if (/^\d{4}-\d{2}-\d{2}$/.test(v) && v <= today) update({ ...w, date: v }); }} />
          </div>
          {!w.programId && (
            <div className="field">
              <label>Nom</label>
              <input className="input" value={w.name} placeholder="Séance libre" onChange={(e) => update({ ...w, name: e.target.value })}
                onBlur={() => { if (!w.name.trim()) update({ ...w, name: 'Séance libre' }); }} />
            </div>
          )}
        </div>
        {groupBlocks(w.blocks).map((g) => g.length > 1 ? (
          <div key={g.map((i) => blockKey(w.blocks[i], i)).join('+')} className="superset">
            <div className="xs c-acc bold">Superset · enchaîne sans pause, repos après le dernier</div>
            {g.map((i) => renderBlock(w.blocks[i], i))}
          </div>
        ) : renderBlock(w.blocks[g[0]], g[0]))}
        {!w.blocks.length && <div className="empty">Aucun exercice pour l'instant : ajoute ceux que tu fais depuis le catalogue.</div>}
        <div className="row mt12" style={{ gap: 8 }}>
          <button className="btn ghost grow" onClick={() => { setRemoving(null); setPicker({}); }}><IconPlus style={{ width: 16, height: 16 }} /> Ajouter un exercice</button>
          {w.blocks.length > 1 && <button className="btn ghost" onClick={() => { setRemoving(null); setOrdering(true); }}>↕ Réorganiser</button>}
        </div>

        <div className="sec mt16"><span>Autour de la séance</span></div>
        <ToggleRow title="Trajet jusqu'à la salle"
          desc={extras.commute ? `${COMMUTE_FR[extras.commute.mode]} · ${fmtQty(extras.commute.km)} km · ${extras.commute.minutes} min aller-retour · ~${commuteKcal(extras.commute, weight)} kcal` : 'Pas compté pour cette séance'}
          on={!!extras.commute} onChange={(v) => setExtras({ ...extras, commute: v ? roundTrip(settings.commute ?? DEFAULT_COMMUTE) : undefined })} />
        {extras.commute && (
          <div className="mb8">
            <div className="seg">
              {(['velo', 'marche'] as const).map((m) => (
                <button key={m} className={extras.commute!.mode === m ? 'on' : ''} onClick={() => setExtras({ ...extras, commute: { ...extras.commute!, mode: m } })}>{m === 'velo' ? 'Vélo' : 'À pied'}</button>
              ))}
            </div>
            <div className="grid2 mt8">
              <div className="field"><label>Km aller-retour</label><NumInput value={extras.commute.km} onChange={(v) => setExtras({ ...extras, commute: { ...extras.commute!, km: Math.max(0, v ?? 0) } })} /></div>
              <div className="field"><label>Minutes aller-retour</label><NumInput value={extras.commute.minutes} onChange={(v) => setExtras({ ...extras, commute: { ...extras.commute!, minutes: Math.max(0, Math.round(v ?? 0)) } })} /></div>
            </div>
          </div>
        )}
        <ToggleRow title="Tapis incliné après la séance"
          desc={extras.treadmill ? `${extras.treadmill.minutes} min · pente ${fmtQty(extras.treadmill.inclinePct)} % · ${fmtQty(extras.treadmill.speedKmh)} km/h · ~${treadmillKcal(extras.treadmill, weight)} kcal` : 'Pas fait, ou pas encore'}
          on={!!extras.treadmill} onChange={(v) => setExtras({ ...extras, treadmill: v ? lastTreadmill ?? DEFAULT_TREADMILL : undefined })} />
        {extras.treadmill && (
          <div className="mb8">
            <div className="chips">
              {[15, 20, 25, 30].map((m) => (
                <button key={m} className={'chip' + (extras.treadmill!.minutes === m ? ' on' : '')} onClick={() => setExtras({ ...extras, treadmill: { ...extras.treadmill!, minutes: m } })}>{m} min</button>
              ))}
            </div>
            <div className="spec-row">
              <div className="field"><label>Minutes</label><NumInput value={extras.treadmill.minutes} onChange={(v) => setExtras({ ...extras, treadmill: { ...extras.treadmill!, minutes: Math.max(0, Math.round(v ?? 0)) } })} /></div>
              <div className="field"><label>Pente (%)</label><NumInput value={extras.treadmill.inclinePct} onChange={(v) => setExtras({ ...extras, treadmill: { ...extras.treadmill!, inclinePct: Math.max(0, v ?? 0) } })} /></div>
              <div className="field"><label>Vitesse (km/h)</label><NumInput value={extras.treadmill.speedKmh} onChange={(v) => setExtras({ ...extras, treadmill: { ...extras.treadmill!, speedKmh: Math.max(0, v ?? 0) } })} /></div>
            </div>
          </div>
        )}
        <div className="xs muted mt4">Estimations pour ton suivi et le coach : ces calories sont déjà comptées dans ta dépense (mesurée, ou niveau d'activité du profil), elles ne s'ajoutent pas à ta cible.</div>
        {finished && (
          <div className="mt12">
            <div className="sec"><span>Ressenti</span></div>
            <RpeChips value={w.rpe} onChange={(rpe) => update({ ...w, rpe })} />
            <div className="field mt12"><label>Note</label><input className="input" defaultValue={w.notes ?? ''} onChange={(e) => update({ ...w, notes: e.target.value || undefined })} placeholder="Sommeil, douleur, forme…" /></div>
          </div>
        )}
      </Sheet>
      {finishing && (
        <FinishSheet elapsed={past ? 0 : elapsed} templateName={program && differsFromProgram(program, w) ? program.name : undefined}
          onClose={() => setFinishing(false)} onDone={async (rpe, durationMin, notes, saveTemplate) => {
            update({ ...w, name: w.name.trim() || 'Séance libre', finishedAt: Date.now(), rpe, durationMin, notes: notes || undefined });
            if (saveTemplate && program) await saveProgram({ ...program, blocks: programBlocksFromWorkout(program, w), source: 'custom' });
            setFinishing(false);
            toast(saveTemplate && program ? `Séance enregistrée, séance type ${program.name} mise à jour 💪` : 'Séance enregistrée 💪');
            onClose();
          }} />
      )}
      {picker && (() => {
        const old = picker.replace !== undefined ? w.blocks[picker.replace] : undefined;
        const oldId = old?.kind === 'serie' ? old.exerciseId : undefined;
        return (
          <ExercisePicker exercises={exercises} allowCardio={picker.replace === undefined}
            title={oldId ? `Remplacer ${exName(exMap, oldId)}` : 'Ajouter un exercice'}
            initialGroup={oldId ? exMap.get(oldId)?.groups[0] : undefined}
            onPick={pick} onClose={() => setPicker(null)} />
        );
      })()}
      {adding && (
        <AddSpecSheet ex={adding}
          defaults={{ sets: lastPerformance(adding.id, before)?.sets.length ?? 4, target: adding.kind === 'temps' ? '30 s' : '', restSec: 90 }}
          onAdd={add} onClose={() => setAdding(null)} />
      )}
      {ordering && (
        <Sheet open onClose={() => setOrdering(false)} title="Ordre et supersets" footer={<button className="btn lg block" onClick={() => setOrdering(false)}>Terminé</button>}>
          <div className="xs muted mb8">Glisse ⠿ pour changer l'ordre. « Superset avec le suivant » enchaîne deux exercices sans pause ; le minuteur de repos ne part qu'après le second.</div>
          <BlockOrderList blocks={w.blocks} onChange={(blocks) => update({ ...w, blocks })} keyOf={blockKey}
            renderRow={(b) => (
              <div>
                <div className="bold small">{b.kind === 'circuit' ? `Circuit ×${b.rounds}` : exName(exMap, b.exerciseId)}</div>
                <div className="xs muted">{b.kind === 'serie' ? `${setsLabel(b.sets.length, b.target)}${b.sets.some((s) => s.done) ? ` · ${b.sets.filter((s) => s.done).length} faite${b.sets.filter((s) => s.done).length > 1 ? 's' : ''}` : ''}` : b.kind === 'cardio' ? 'cardio' : b.items.map((it) => exName(exMap, it.exerciseId)).join(' · ')}</div>
              </div>
            )} />
        </Sheet>
      )}
    </>
  );
}

/** Séries, objectif et repos d'un exercice ajouté à la séance. */
function AddSpecSheet({ ex, defaults, onAdd, onClose }: { ex: Exercise; defaults: BlockSpec; onAdd: (s: BlockSpec) => void; onClose: () => void }) {
  const [sets, setSets] = useState<number | undefined>(defaults.sets);
  const [target, setTarget] = useState(defaults.target);
  const [restSec, setRestSec] = useState<number | undefined>(defaults.restSec);
  const ok = !!sets && sets >= 1 && sets <= 20;
  return (
    <Sheet open onClose={onClose} title={ex.name}
      footer={<button className="btn lg block" disabled={!ok} onClick={() => onAdd({ sets: Math.round(sets!), target: target.trim(), restSec: Math.max(0, Math.round(restSec ?? 0)) })}>
        Ajouter à la séance
      </button>}>
      <div className="grid2">
        <div className="field"><label>Séries</label><NumInput value={sets} onChange={setSets} /></div>
        <div className="field"><label>Repos (secondes)</label><NumInput value={restSec} onChange={setRestSec} /></div>
      </div>
      <div className="field mt12"><label>Objectif</label><input className="input" value={target} onChange={(e) => setTarget(e.target.value)} placeholder={ex.kind === 'temps' ? '30 s' : '10, 8-12, échec…'} /></div>
      <div className="xs muted mt8">L'objectif pré-remplit les répétitions et sert au conseil de progression. Il arrive en fin de séance : « Réorganiser » le met à sa place.</div>
    </Sheet>
  );
}

/**
 * Fin de séance : ressenti, durée, note. Si la séance s'est écartée de sa séance type (exercices, ordre, supersets),
 * on propose d'en faire la nouvelle séance type : c'est le seul endroit où une séance modifie le programme.
 */
function FinishSheet({ elapsed, templateName, onClose, onDone }: {
  elapsed: number; templateName?: string; onClose: () => void;
  onDone: (rpe: number | undefined, durationMin: number | undefined, notes: string, saveTemplate: boolean) => void;
}) {
  const [rpe, setRpe] = useState<number | undefined>();
  const [duration, setDuration] = useState<number | undefined>(elapsed || undefined);
  const [notes, setNotes] = useState('');
  const [saveTemplate, setSaveTemplate] = useState(false);
  return (
    <Sheet open onClose={onClose} title="Fin de séance" footer={<button className="btn lg block" onClick={() => onDone(rpe, duration ? Math.round(duration) : undefined, notes.trim(), saveTemplate)}>Enregistrer</button>}>
      <div className="sec"><span>Ressenti global</span></div>
      <RpeChips value={rpe} onChange={setRpe} />
      <div className="grid2 mt12">
        <div className="field"><label>Durée (min)</label><NumInput value={duration} onChange={setDuration} /></div>
      </div>
      <div className="field mt12"><label>Note (optionnel)</label><input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Sommeil, douleur, forme…" /></div>
      {templateName && (
        <div className="mt12">
          <ToggleRow title={`Enregistrer dans la séance type ${templateName}`}
            desc="Cette séance s'est écartée de ta séance type. Coche pour que les prochaines partent de ces exercices, dans cet ordre, avec ces supersets."
            on={saveTemplate} onChange={setSaveTemplate} />
        </div>
      )}
    </Sheet>
  );
}

/** Séance de cardio seule : date (aujourd'hui ou a posteriori), activité, durée, distance, ressenti. */
function CardioSheet({ date: initialDate, today, exMap, onClose }: { date: string; today: string; exMap: ExMap; onClose: () => void }) {
  const [date, setDate] = useState(initialDate);
  const [ex, setEx] = useState(CARDIO_IDS[0]);
  const [minutes, setMinutes] = useState<number | undefined>();
  const [km, setKm] = useState<number | undefined>();
  const [rpe, setRpe] = useState<number | undefined>();
  const [notes, setNotes] = useState('');
  const toast = useToast();
  const save = async () => {
    if (!minutes || minutes <= 0) return;
    const now = Date.now();
    await saveWorkout({
      id: newId(), date, name: exName(exMap, ex), blocks: [{ kind: 'cardio', exerciseId: ex, minutes, km }],
      startedAt: now - minutes * 60_000, finishedAt: now, durationMin: Math.round(minutes), rpe, notes: notes.trim() || undefined, createdAt: now,
    });
    toast('Cardio enregistré');
    onClose();
  };
  return (
    <Sheet open onClose={onClose} title="Cardio" footer={<button className="btn lg block" disabled={!minutes} onClick={save}>Enregistrer{minutes && km ? ` · ${pace(minutes, km)}` : ''}</button>}>
      <div className="field mb12"><label>Date</label><input className="input" type="date" max={today} value={date} onChange={(e) => { const v = e.target.value; if (/^\d{4}-\d{2}-\d{2}$/.test(v) && v <= today) setDate(v); }} /></div>
      <div className="chips">{CARDIO_IDS.map((id) => <button key={id} className={'chip' + (ex === id ? ' on' : '')} onClick={() => setEx(id)}>{exName(exMap, id)}</button>)}</div>
      <div className="grid2 mt12">
        <div className="field"><label>Durée (min)</label><NumInput value={minutes} onChange={setMinutes} /></div>
        <div className="field"><label>Distance (km)</label><NumInput value={km} onChange={setKm} placeholder="optionnel" /></div>
      </div>
      <div className="sec mt12"><span>Ressenti</span></div>
      <RpeChips value={rpe} onChange={setRpe} />
      <div className="field mt12"><label>Note (optionnel)</label><input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Zone 2, fractionné, terrain…" /></div>
    </Sheet>
  );
}

/**
 * Séance d'un autre jour (oubli, saisie a posteriori) : choisir la date, voir ce qui est déjà saisi ce jour-là,
 * puis ajouter une séance du programme ou un cardio.
 */
function PastSessionSheet({ initialDate, today, programs, workouts, exMap, onStart, onFree, onCardio, onOpen, onClose }: {
  initialDate: string; today: string; programs: Program[]; workouts: Workout[]; exMap: ExMap;
  onStart: (p: Program, date: string) => void; onFree: (date: string) => void; onCardio: (date: string) => void; onOpen: (id: string) => void; onClose: () => void;
}) {
  const [date, setDate] = useState(initialDate);
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(date) && date <= today;
  const sameDay = workouts.filter((w) => w.date === date);
  const sugg = valid ? suggestSession(programs, workouts, date) : null;
  return (
    <Sheet open onClose={onClose} title="Séance d'un autre jour">
      <div className="field"><label>Date</label><input className="input" type="date" max={today} value={date} onChange={(e) => setDate(e.target.value)} /></div>
      {valid && <div className="small muted mt8">{formatLong(date)}{sugg?.program ? ` · tes règles suggéraient ${sugg.program.name}` : ''}</div>}
      {valid && sameDay.length > 0 && (
        <>
          <div className="sec mt12"><span>Déjà saisi ce jour-là</span></div>
          <div className="list">
            {sameDay.map((w) => (
              <button key={w.id} className="item compact" onClick={() => onOpen(w.id)}>
                <div className="grow" style={{ textAlign: 'left' }}>
                  <div className="name">{w.name}</div>
                  <div className="meta">{w.finishedAt ? summary(w, exMap) || 'Terminée' : 'Saisie en cours'}</div>
                </div>
              </button>
            ))}
          </div>
        </>
      )}
      <div className="sec mt12"><span>Ajouter</span></div>
      <div className="chips">
        {programs.map((p) => <button key={p.id} className={'chip' + (sugg?.program?.id === p.id ? ' on' : '')} disabled={!valid} onClick={() => onStart(p, date)}>{p.name}</button>)}
        <button className="chip" disabled={!valid} onClick={() => onFree(date)}>＋ Séance libre</button>
        <button className="chip" disabled={!valid} onClick={() => onCardio(date)}>🏃 Cardio</button>
      </div>
      <div className="xs muted mt8">Les charges sont pré-remplies avec tes séances d'avant cette date. En terminant, indique la durée.</div>
    </Sheet>
  );
}
