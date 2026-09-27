const EMPTY: never[] = [];
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, newId } from '../../data/db';
import { deleteWorkout, saveWorkout } from '../../data/repos';
import { CARDIO_IDS } from '../../data/training-seed';
import { addDays, formatShort, rangeKeys, todayKey, weekday } from '../../domain/dates';
import { fmtQty } from '../../domain/foods';
import { GROUP_FR, fmtSets, lastPerformance, pace, progressionHint, sessionStats, suggestSession, workoutFromProgram } from '../../domain/training';
import type { Exercise, LoggedSet, Program, Workout, WorkoutBlock } from '../../domain/types';
import { IconCheck, IconPlus, IconTrash } from '../components/Icons';
import { Sheet } from '../components/Sheet';
import { useToast } from '../components/Toast';

type SerieBlock = Extract<WorkoutBlock, { kind: 'serie' }>;
type ExMap = Map<string, Exercise>;

const DAY_LETTERS = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
const num = (v: string) => {
  const n = parseFloat(v.replace(',', '.'));
  return Number.isFinite(n) ? n : undefined;
};
const restLabel = (sec?: number) => (!sec ? '' : sec % 60 ? `${Math.floor(sec / 60)} min ${sec % 60}` : `${sec / 60} min`);
const clock = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
const exName = (m: ExMap, id: string) => m.get(id)?.name ?? id;

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
  ];
  return parts.filter(Boolean).join(' · ');
}

export function SportScreen() {
  const today = todayKey();
  const programs = useLiveQuery(() => db.programs.orderBy('order').toArray(), []) ?? EMPTY;
  const exercises = useLiveQuery(() => db.exercises.toArray(), []) ?? EMPTY;
  const workouts = useLiveQuery(() => db.workouts.orderBy('date').toArray(), []) ?? EMPTY;
  const exMap = useMemo<ExMap>(() => new Map(exercises.map((e) => [e.id, e])), [exercises]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [cardio, setCardio] = useState(false);
  const [progOpen, setProgOpen] = useState<string | null>(null);
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

  const start = async (p: Program) => {
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
      const w = workoutFromProgram(p, workouts, today, Date.now(), newId());
      await saveWorkout(w);
      setOpenId(w.id);
    } finally {
      starting.current = false;
    }
  };

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
            <div className="small muted">Commencée {inProgress.date === today ? 'aujourd’hui' : formatShort(inProgress.date).toLowerCase()} à {new Date(inProgress.startedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</div>
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
              <button className="chip" onClick={() => setCardio(true)}>🏃 Cardio</button>
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
            return (
              <div key={d} className={'d' + (d === today ? ' today' : '')}>
                <div className="l">{DAY_LETTERS[weekday(d)]}</div>
                {list.map((w) => <div key={w.id} className="s">{w.name.split(' ')[0]}</div>)}
              </div>
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
        ) : <div className="empty">Tes séances apparaîtront ici. Démarre la séance suggérée ou note un cardio.</div>}
      </div>

      {/* ---------- Programme ---------- */}
      <div className="card">
        <div className="sec"><span>Programme</span></div>
        <div className="list">
          {programs.map((p) => (
            <div key={p.id}>
              <button className="item compact" style={{ width: '100%' }} onClick={() => setProgOpen(progOpen === p.id ? null : p.id)}>
                <div className="grow" style={{ textAlign: 'left' }}>
                  <div className="name">{p.name}</div>
                  <div className="meta">{p.blocks.filter((b) => b.kind === 'serie').length} exercices + circuit{p.notDayAfter?.length ? ` · jamais le lendemain de ${p.notDayAfter.map((id) => programs.find((x) => x.id === id)?.name).join(' ou ')}` : ''}{p.onlyAfter?.length ? ` · seulement après ${p.onlyAfter.map((id) => programs.find((x) => x.id === id)?.name).join(' ou ')}` : ''}</div>
                </div>
              </button>
              {progOpen === p.id && (
                <div className="prog-detail">
                  {p.blocks.map((b, i) => b.kind === 'serie' ? (
                    <div key={i} className="small"><b>{exName(exMap, b.exerciseId)}</b> <span className="muted">{b.sets} × {b.target} · repos {restLabel(b.restSec)}</span></div>
                  ) : (
                    <div key={i} className="small mt4"><b>Circuit ×{b.rounds}</b>{b.workSec ? <span className="muted"> · {b.workSec} s / {b.restSec} s</span> : b.restSec ? <span className="muted"> · repos {b.restSec} s par tour</span> : null}<div className="muted">{b.items.map((it) => `${exName(exMap, it.exerciseId)} ${it.target}`).join(' · ')}</div></div>
                  ))}
                  <button className="btn sm mt8" onClick={() => start(p)}>Démarrer {p.name}</button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {opened && <WorkoutSheet key={opened.id} initial={opened} workouts={workouts} exMap={exMap} onClose={() => setOpenId(null)} />}
      {cardio && <CardioSheet date={today} exMap={exMap} onClose={() => setCardio(false)} />}
    </div>
  );
}

/** Champ numérique qui garde la saisie en cours (« 22, » ne devient pas « 22 »). */
function NumInput({ value, onChange, placeholder }: { value?: number; onChange: (v?: number) => void; placeholder?: string }) {
  const [txt, setTxt] = useState(value === undefined ? '' : String(value));
  return (
    <input className="input" type="text" inputMode="decimal" value={txt} placeholder={placeholder}
      onChange={(e) => { setTxt(e.target.value); onChange(num(e.target.value)); }} onFocus={(e) => e.target.select()} />
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

/** Saisie d'une séance : séries pré-remplies, minuteur de repos, circuits, fin de séance. Enregistre à chaque geste. */
function WorkoutSheet({ initial, workouts, exMap, onClose }: { initial: Workout; workouts: Workout[]; exMap: ExMap; onClose: () => void }) {
  const [w, setW] = useState<Workout>(initial);
  const [rest, setRest] = useState<{ until: number } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [finishing, setFinishing] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const toast = useToast();
  const finished = !!w.finishedAt;
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
  const setSet = (i: number, j: number, patch: Partial<LoggedSet>) => {
    const b = w.blocks[i] as SerieBlock;
    setBlock(i, { ...b, sets: b.sets.map((s, k) => (k === j ? { ...s, ...patch } : s)) });
  };
  const toggleDone = (i: number, j: number) => {
    const b = w.blocks[i] as SerieBlock;
    const done = !b.sets[j].done;
    setSet(i, j, { done });
    if (done && b.restSec && !finished) setRest({ until: Date.now() + b.restSec * 1000 });
  };
  const addSet = (i: number) => {
    const b = w.blocks[i] as SerieBlock;
    const last = b.sets[b.sets.length - 1];
    setBlock(i, { ...b, sets: [...b.sets, { reps: last?.reps, kg: last?.kg, sec: last?.sec, done: false }] });
  };

  const elapsed = Math.max(0, Math.round((now - w.startedAt) / 60000));
  const left = rest ? Math.max(0, Math.ceil((rest.until - now) / 1000)) : 0;

  return (
    <>
      <Sheet open onClose={onClose} full title={<span>{w.name} <span className="muted small">· {formatShort(w.date)}</span></span>}
        right={!finished ? <span className="small muted">{elapsed} min</span> : undefined}
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
        {w.blocks.map((b, i) => {
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
              <div key={i} className="ex-block">
                <div className="bold">{exName(exMap, b.exerciseId)}</div>
                <div className="xs muted">{b.sets.length} × {b.target}{b.restSec ? ` · repos ${restLabel(b.restSec)}` : ''}{ex?.groups.length ? ` · ${ex.groups.map((g) => GROUP_FR[g]).join(', ')}` : ''}</div>
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
              <div key={i} className="ex-block">
                <div className="row between">
                  <div>
                    <div className="bold">Circuit ×{b.rounds}</div>
                    <div className="xs muted">{b.workSec ? `${b.workSec} s d'effort / ${b.restSec ?? 0} s de récupération` : b.restSec ? `repos ${b.restSec} s en fin de tour` : 'enchaîné'}</div>
                  </div>
                  <div className="row" style={{ gap: 6 }}>
                    <button className="btn sm ghost" onClick={() => setBlock(i, { ...b, roundsDone: Math.max(0, b.roundsDone - 1) })} aria-label="Un tour de moins">−</button>
                    <b style={{ minWidth: 38, textAlign: 'center' }}>{b.roundsDone}/{b.rounds}</b>
                    <button className="btn sm" onClick={() => setBlock(i, { ...b, roundsDone: Math.min(b.rounds, b.roundsDone + 1) })} aria-label="Un tour de plus">+</button>
                  </div>
                </div>
                <div className="small dim mt8">{b.items.map((it) => `${exName(exMap, it.exerciseId)} ${it.target}`).join(' · ')}</div>
              </div>
            );
          }
          return (
            <div key={i} className="ex-block">
              <div className="bold">{exName(exMap, b.exerciseId)}</div>
              <div className="grid2 mt8">
                <div className="field"><label>Minutes</label><NumInput value={b.minutes} onChange={(v) => setBlock(i, { ...b, minutes: v ?? 0 })} /></div>
                <div className="field"><label>Kilomètres</label><NumInput value={b.km} onChange={(v) => setBlock(i, { ...b, km: v })} placeholder="optionnel" /></div>
              </div>
              {pace(b.minutes, b.km) && <div className="xs muted mt4">Allure {pace(b.minutes, b.km)}</div>}
            </div>
          );
        })}
        {finished && (
          <div className="mt12">
            <div className="sec"><span>Ressenti</span></div>
            <RpeChips value={w.rpe} onChange={(rpe) => update({ ...w, rpe })} />
            <div className="field mt12"><label>Note</label><input className="input" defaultValue={w.notes ?? ''} onChange={(e) => update({ ...w, notes: e.target.value || undefined })} placeholder="Sommeil, douleur, forme…" /></div>
          </div>
        )}
      </Sheet>
      {finishing && (
        <FinishSheet elapsed={elapsed} onClose={() => setFinishing(false)} onDone={(rpe, durationMin, notes) => {
          update({ ...w, finishedAt: Date.now(), rpe, durationMin, notes: notes || undefined });
          setFinishing(false);
          toast('Séance enregistrée 💪');
          onClose();
        }} />
      )}
    </>
  );
}

function FinishSheet({ elapsed, onClose, onDone }: { elapsed: number; onClose: () => void; onDone: (rpe: number | undefined, durationMin: number | undefined, notes: string) => void }) {
  const [rpe, setRpe] = useState<number | undefined>();
  const [duration, setDuration] = useState<number | undefined>(elapsed || undefined);
  const [notes, setNotes] = useState('');
  return (
    <Sheet open onClose={onClose} title="Fin de séance" footer={<button className="btn lg block" onClick={() => onDone(rpe, duration ? Math.round(duration) : undefined, notes.trim())}>Enregistrer</button>}>
      <div className="sec"><span>Ressenti global</span></div>
      <RpeChips value={rpe} onChange={setRpe} />
      <div className="grid2 mt12">
        <div className="field"><label>Durée (min)</label><NumInput value={duration} onChange={setDuration} /></div>
      </div>
      <div className="field mt12"><label>Note (optionnel)</label><input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Sommeil, douleur, forme…" /></div>
    </Sheet>
  );
}

/** Séance de cardio seule : activité, durée, distance, ressenti. */
function CardioSheet({ date, exMap, onClose }: { date: string; exMap: ExMap; onClose: () => void }) {
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
