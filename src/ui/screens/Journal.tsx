const EMPTY: never[] = [];
import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../data/db';
import { addEntries, copyEntries, deleteEntry, entryFromFood, updateDay, updateEntry } from '../../data/repos';
import { addDays, todayKey, weekday } from '../../domain/dates';
import { calcMacros, fmtQty, qtyLabel, qtyPlaceholder, sumMacros } from '../../domain/foods';
import { suggestFoods } from '../../domain/suggestions';
import { fmtSteps } from '../../domain/health';
import type { DateKey, FoodItem, JournalEntry, Meal, Settings } from '../../domain/types';
import { DateNav } from '../components/DateNav';
import { IconCopy, IconDumbbell, IconBed, IconPlus, IconTrash } from '../components/Icons';
import { MacroBar } from '../components/MacroBar';
import { Ring } from '../components/Ring';
import { Sheet } from '../components/Sheet';
import { useToast } from '../components/Toast';
import { useDay } from '../hooks/useDay';
import { MEALS, mealForNow } from '../theme';
import { AddFoodSheet } from './AddFood';

export function JournalScreen({ settings, date, setDate, goProfile }: { settings: Settings; date: DateKey; setDate: (d: DateKey) => void; goProfile: () => void }) {
  const d = useDay(date, settings);
  const [adding, setAdding] = useState<Meal | null>(null);
  const [editing, setEditing] = useState<JournalEntry | null>(null);
  const toast = useToast();
  const today = todayKey();

  // Points de la semaine affichée (journal rempli ou non).
  const wd = weekday(date);
  const monday = addDays(date, wd === 0 ? -6 : 1 - wd);
  const sunday = addDays(monday, 6);
  const weekEntries = useLiveQuery(() => db.entries.where('date').between(monday, sunday, true, true).toArray(), [monday, sunday]) ?? EMPTY;
  const status = useMemo(() => {
    const m = new Map<DateKey, 'full' | 'part'>();
    const byDay = new Map<DateKey, number>();
    weekEntries.forEach((e) => byDay.set(e.date, (byDay.get(e.date) ?? 0) + e.cal));
    byDay.forEach((cal, k) => m.set(k, cal >= 800 ? 'full' : 'part'));
    return m;
  }, [weekEntries]);

  const foods = useLiveQuery(() => db.foods.toArray(), []) ?? EMPTY;
  const suggestions = useMemo(() => suggestFoods(d.remaining, foods, new Set(d.entries.map((e) => e.name)), date), [d.remaining, foods, d.entries, date]);

  const pct = d.targets.cal > 0 ? (d.consumed.cal / d.targets.cal) * 100 : 0;
  const over = d.consumed.cal > d.targets.cal;
  const yesterday = addDays(date, -1);

  const copyDay = async (meal?: Meal) => {
    const n = await copyEntries(yesterday, date, meal);
    toast(n ? `${n} aliment${n > 1 ? 's' : ''} copié${n > 1 ? 's' : ''} d'hier` : "Rien à copier d'hier", n ? 'ok' : 'err');
  };

  const setTraining = (v: boolean | null) => updateDay(date, { training: v });
  const addWater = (ml: number) => updateDay(date, { waterMl: Math.max(0, d.day.waterMl + ml) });

  return (
    <div>
      <DateNav date={date} onChange={setDate} status={status} />

      {!settings.onboarded && (
        <button className="card accent" style={{ width: '100%', textAlign: 'left' }} onClick={goProfile}>
          <div className="bold">Bienvenue 👋</div>
          <div className="small dim mt4">Renseigne ton profil pour calculer tes cibles, et ta clé API pour activer le chat IA.</div>
        </button>
      )}

      <div className="card hero">
        <div className="row" style={{ gap: 16 }}>
          <Ring pct={pct} color={over ? 'var(--red)' : 'var(--acc-l)'} size={82} stroke={6}>
            <div style={{ fontSize: 19, fontWeight: 600, color: over ? 'var(--red)' : 'var(--acc-l)' }}>{Math.round(d.consumed.cal)}</div>
            <div className="xs muted">kcal</div>
          </Ring>
          <div className="grow">
            <div className="xs muted" style={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>{d.targets.isTraining ? 'Jour d’entraînement' : 'Jour de repos'}{d.adaptiveInUse ? ' · TDEE mesuré' : ''}</div>
            <div style={{ fontSize: 17, fontWeight: 600, marginTop: 2 }}>
              {d.remaining.cal >= 0 ? <>Reste <span className="c-acc">{Math.round(d.remaining.cal)}</span> kcal</> : <span className="c-red">+{Math.round(-d.remaining.cal)} kcal au-dessus</span>}
            </div>
            <div className="small muted">objectif {d.targets.cal} kcal</div>
            <div className="row mt8" style={{ gap: 6 }}>
              <button className={'chip' + (d.targets.isTraining ? ' on' : '')} onClick={() => setTraining(d.day.training === null ? !d.targets.isTraining : null)} title="Basculer entraînement / repos">
                {d.targets.isTraining ? <IconDumbbell style={{ width: 14, height: 14, verticalAlign: -2 }} /> : <IconBed style={{ width: 14, height: 14, verticalAlign: -2 }} />}
                {' '}{d.targets.isTraining ? 'Entraînement' : 'Repos'}{d.day.training !== null ? ' *' : d.targets.isTraining && d.day.workouts.length && !settings.profile.trainingDays.includes(new Date(date + 'T12:00').getDay()) ? ' (séance)' : ''}
              </button>
            </div>
          </div>
        </div>
        <div className="macro-row mt12">
          <MacroBar label="Protéines" value={d.consumed.p} max={d.targets.p} color="var(--c-prot)" />
          <MacroBar label="Glucides" value={d.consumed.g} max={d.targets.g} color="var(--c-carb)" />
          <MacroBar label="Lipides" value={d.consumed.l} max={d.targets.l} color="var(--c-fat)" />
        </div>
        {(d.day.steps !== null || d.day.workouts.length > 0) && (
          <div className="row mt12" style={{ fontSize: 12, gap: 12, flexWrap: 'wrap' }}>
            {d.day.steps !== null && <span>🚶 <b>{fmtSteps(d.day.steps)}</b> <span className="muted">pas</span></span>}
            {d.day.activeKcal !== null && d.day.activeKcal > 0 && <span>🔥 <b>{d.day.activeKcal}</b> <span className="muted">kcal actives</span></span>}
            {d.day.workouts.map((w, i) => <span key={i}>🏋️ <b>{w.label}</b> <span className="muted">{w.minutes} min{w.kcal ? ` · ${w.kcal} kcal` : ''}</span></span>)}
          </div>
        )}
        <div className="row between mt12" style={{ fontSize: 12 }}>
          <div className="row" style={{ gap: 6 }}>
            <span className="muted">Fibres</span>
            <b className={d.consumed.fib >= settings.fiberGoal ? 'c-fib' : ''}>{Math.round(d.consumed.fib)}</b><span className="muted">/{settings.fiberGoal} g</span>
          </div>
          <div className="water">
            <span className="muted">Eau</span>
            <b className="c-water">{(d.day.waterMl / 1000).toFixed(2).replace(/\.?0+$/, '')}</b><span className="muted">/{settings.waterGoalMl / 1000} L</span>
            <button className="chip" onClick={() => addWater(250)} style={{ padding: '3px 9px' }}>+250</button>
            <button className="chip" onClick={() => addWater(-250)} style={{ padding: '3px 9px' }}>−</button>
          </div>
        </div>
      </div>

      {d.entries.length === 0 && !d.loading && (
        <button className="btn ghost block mb12" onClick={() => copyDay()}><IconCopy style={{ width: 16, height: 16 }} /> Copier toute la journée d'hier</button>
      )}

      {MEALS.map((m) => {
        const list = d.entries.filter((e) => e.meal === m.id);
        const sum = sumMacros(list);
        const isNow = date === today && mealForNow() === m.id;
        return (
          <section key={m.id} className="meal">
            <div className="meal-h">
              <div className="t"><span>{m.icon}</span>{m.label}{isNow && <span className="badge acc">maintenant</span>}</div>
              <div className="k">{list.length ? <><b style={{ color: 'var(--tx0)' }}>{sum.cal}</b> kcal · P{Math.round(sum.p)} G{Math.round(sum.g)} L{Math.round(sum.l)}</> : ''}</div>
            </div>
            <div className="list">
              {list.map((e) => (
                <button key={e.id} className="item" onClick={() => setEditing(e)}>
                  <div className="grow">
                    <div className="name ellipsis">{e.name}</div>
                    <div className="meta">{e.qtyLabel} · <span className="c-prot">P{fmtQty(e.p)}</span> <span className="c-carb">G{fmtQty(e.g)}</span> <span className="c-fat">L{fmtQty(e.l)}</span>{e.fib > 0 ? <span className="c-fib"> F{fmtQty(e.fib)}</span> : ''}</div>
                  </div>
                  <div className="kcal">{e.cal}<span> kcal</span></div>
                </button>
              ))}
              <div className="row" style={{ gap: 6 }}>
                <button className="meal-add grow" onClick={() => setAdding(m.id)}><IconPlus style={{ width: 16, height: 16 }} /> Ajouter</button>
                {list.length === 0 && <button className="meal-add" style={{ width: 'auto', color: 'var(--tx1)' }} onClick={() => copyDay(m.id)} title="Copier ce repas d'hier"><IconCopy style={{ width: 15, height: 15 }} /> hier</button>}
              </div>
            </div>
          </section>
        );
      })}

      {suggestions.length > 0 && d.remaining.cal > 80 && (
        <div className="mt8">
          <div className="sec"><span>Pour compléter ta journée</span></div>
          {suggestions.map((s, i) => (
            <div key={i} className="card tight" style={{ borderLeft: `3px solid ${{ protein: 'var(--c-prot)', carb: 'var(--c-carb)', fat: 'var(--c-fat)', balanced: 'var(--c-fib)' }[s.kind]}` }}>
              <div className="row between">
                <div className="grow">
                  <div className="xs bold" style={{ color: { protein: 'var(--c-prot)', carb: 'var(--c-carb)', fat: 'var(--c-fat)', balanced: 'var(--c-fib)' }[s.kind], textTransform: 'uppercase' }}>{s.label}</div>
                  <div className="small">{s.qty}{s.food.unit === 'ml' ? 'ml' : 'g'} de {s.food.name}</div>
                  <div className="xs muted">{s.macros.cal} kcal · P{fmtQty(s.macros.p)} G{fmtQty(s.macros.g)} L{fmtQty(s.macros.l)}</div>
                </div>
                <QuickAdd food={s.food} qty={s.qty} date={date} />
              </div>
            </div>
          ))}
        </div>
      )}
      {d.remaining.cal <= 0 && d.entries.length > 0 && (
        <div className="card accent center" style={{ padding: 16 }}>
          <div className="bold c-acc">{over && d.remaining.cal < -150 ? 'Objectif dépassé' : 'Objectif calorique atteint ✓'}</div>
          {over && d.remaining.cal < -150 && <div className="small dim mt4">Ça arrive. Un jour ne fait pas une semaine : regarde la moyenne dans Suivi.</div>}
        </div>
      )}

      <AddFoodSheet open={adding !== null} onClose={() => setAdding(null)} date={date} meal={adding ?? 'snack'} />
      <EntrySheet entry={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

function QuickAdd({ food, qty, date }: { food: FoodItem; qty: number; date: DateKey }) {
  const toast = useToast();
  return (
    <button className="btn sm" onClick={async () => {
      await addEntries([entryFromFood(food, qty, date, mealForNow())]);
      toast(`${food.name} ajouté`);
    }}>+ Ajouter</button>
  );
}

/** Édition d'une entrée : quantité (si aliment connu), repas, suppression. */
function EntrySheet({ entry, onClose }: { entry: JournalEntry | null; onClose: () => void }) {
  const [qty, setQty] = useState('');
  const [meal, setMeal] = useState<Meal>('lunch');
  const [confirm, setConfirm] = useState(false);
  const food = useLiveQuery(async () => (entry?.foodId ? await db.foods.get(entry.foodId) : undefined), [entry?.foodId]);
  const toast = useToast();
  useEffect(() => { if (entry) { setQty(String(entry.qty)); setMeal(entry.meal); setConfirm(false); } }, [entry]);
  if (!entry) return null;
  const n = parseFloat(qty.replace(',', '.'));
  const canScale = !!food || !!entry.recipeId;
  const valid = Number.isFinite(n) && n > 0;
  const preview = food && valid ? calcMacros(food, n) : null;

  const save = async () => {
    let next: JournalEntry = { ...entry, meal };
    if (food && valid) next = { ...next, qty: n, qtyLabel: qtyLabel(food, n), ...calcMacros(food, n) };
    else if (entry.recipeId && valid && n !== entry.qty) {
      const f = n / entry.qty;
      next = { ...next, qty: n, qtyLabel: `${fmtQty(n)} portion${n > 1 ? 's' : ''}`, cal: Math.round(entry.cal * f), p: Math.round(entry.p * f * 10) / 10, g: Math.round(entry.g * f * 10) / 10, l: Math.round(entry.l * f * 10) / 10, fib: Math.round(entry.fib * f * 10) / 10 };
    }
    await updateEntry(next);
    toast('Modifié');
    onClose();
  };

  return (
    <Sheet open={!!entry} onClose={onClose} title={entry.name}
      footer={
        <div className="row">
          {confirm ? (
            <>
              <button className="btn danger grow" onClick={async () => { await deleteEntry(entry.id); toast('Supprimé'); onClose(); }}>Confirmer la suppression</button>
              <button className="btn ghost" onClick={() => setConfirm(false)}>Non</button>
            </>
          ) : (
            <>
              <button className="btn ghost icon" onClick={() => setConfirm(true)} aria-label="Supprimer" style={{ color: 'var(--red)' }}><IconTrash style={{ width: 18, height: 18 }} /></button>
              <button className="btn lg grow" onClick={save} disabled={canScale && !valid}>Enregistrer{preview ? ` · ${preview.cal} kcal` : ''}</button>
            </>
          )}
        </div>
      }>
      <div className="seg mb12">
        {MEALS.map((mm) => <button key={mm.id} className={meal === mm.id ? 'on' : ''} onClick={() => setMeal(mm.id)}>{mm.label.replace('Petit-déjeuner', 'Petit-déj')}</button>)}
      </div>
      {canScale ? (
        <>
          <input className="input lg" type="number" inputMode="decimal" step="any" value={qty} onChange={(e) => setQty(e.target.value)} onFocus={(e) => e.target.select()} />
          <div className="center xs muted mt4">{food ? qtyPlaceholder(food) : 'Portions'}{food && valid ? ` · ${qtyLabel(food, n)}` : ''}</div>
        </>
      ) : (
        <div className="callout info">Entrée saisie via le chat IA ({entry.qtyLabel || 'quantité libre'}) : {entry.cal} kcal · P{entry.p} G{entry.g} L{entry.l}. Tu peux changer le repas ou la supprimer.</div>
      )}
    </Sheet>
  );
}
