const EMPTY: never[] = [];
import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../data/db';
import { deleteWeight, upsertWeight } from '../../data/repos';
import { adaptiveTdee, movingAverage, projectWeeks, weekStats } from '../../domain/adaptive';
import { addDays, formatShort, fromDateKey, rangeKeys, todayKey } from '../../domain/dates';
import { calcTargets } from '../../domain/nutrition';
import type { DateKey, Settings } from '../../domain/types';
import { BarsChart } from '../components/BarsChart';
import { LineChart } from '../components/LineChart';
import { IconScale } from '../components/Icons';
import { Sheet } from '../components/Sheet';
import { Switch } from '../components/Switch';
import { useToast } from '../components/Toast';

const RANGES = [{ d: 30, l: '1 mois' }, { d: 90, l: '3 mois' }, { d: 365, l: '1 an' }];

export function TrackingScreen({ settings, update }: { settings: Settings; update: (p: Partial<Settings>) => Promise<void> }) {
  const today = todayKey();
  const [range, setRange] = useState(30);
  const [weighing, setWeighing] = useState<DateKey | null>(null);
  const [goalEdit, setGoalEdit] = useState(false);
  const [goalVal, setGoalVal] = useState('');
  const toast = useToast();

  const weights = useLiveQuery(() => db.weights.orderBy('date').toArray(), []) ?? EMPTY;
  const from = addDays(today, -Math.max(range, 28));
  const entries = useLiveQuery(() => db.entries.where('date').between(from, today, true, true).toArray(), [from, today]) ?? EMPTY;
  const days = useLiveQuery(() => db.days.where('date').between(from, today, true, true).toArray(), [from, today]) ?? EMPTY;

  const adaptive = useMemo(() => adaptiveTdee(entries, weights, today), [entries, weights, today]);
  const adaptiveInUse = settings.useAdaptiveTdee && adaptive.tdee ? adaptive.tdee : null;

  // Cibles jour par jour (respecte les surcharges entraînement/repos).
  const targetsByDay = useMemo(() => {
    const m = new Map<DateKey, number>();
    const overrides = new Map(days.map((d) => [d.date, d.training]));
    rangeKeys(from, today).forEach((k) => m.set(k, calcTargets(settings.profile, k, { trainingOverride: overrides.get(k) ?? null, adaptiveTdee: adaptiveInUse }).cal));
    return m;
  }, [days, from, today, settings.profile, adaptiveInUse]);

  const week = useMemo(() => weekStats(entries, targetsByDay, addDays(today, -6), today), [entries, targetsByDay, today]);
  const prevWeek = useMemo(() => weekStats(entries, targetsByDay, addDays(today, -13), addDays(today, -7)), [entries, targetsByDay, today]);

  const ma = useMemo(() => movingAverage(weights), [weights]);
  const chartFrom = addDays(today, -range);
  const points = useMemo(() => ma.filter((p) => p.date >= chartFrom).map((p) => ({ x: fromDateKey(p.date).getTime(), label: formatShort(p.date), values: [p.kg, p.ma7] })), [ma, chartFrom]);
  const lastW = weights[weights.length - 1];
  const todayW = weights.find((w) => w.date === today);
  const firstInRange = ma.find((p) => p.date >= chartFrom);
  const lastMa = ma[ma.length - 1];
  const delta = firstInRange && lastMa && firstInRange !== lastMa ? lastMa.ma7 - firstInRange.ma7 : null;
  const goal = settings.goalWeight;
  const weeksLeft = goal && lastMa && adaptive.realDeficit !== null ? projectWeeks(lastMa.ma7, goal, adaptive.realDeficit) : null;

  const targetToday = calcTargets(settings.profile, today, { adaptiveTdee: adaptiveInUse });

  return (
    <div>
      {/* ---------- Poids ---------- */}
      <div className="card">
        <div className="row between mb8">
          <div>
            <div className="sec" style={{ margin: 0 }}><span>Poids</span></div>
            <div className="row" style={{ alignItems: 'baseline', gap: 6, marginTop: 4 }}>
              <span style={{ fontSize: 30, fontWeight: 600, letterSpacing: -0.5 }}>{lastMa ? lastMa.ma7.toFixed(1) : '—'}</span>
              <span className="small muted">kg · moy. 7 j</span>
            </div>
            {lastW && <div className="xs muted">Dernière pesée : {lastW.kg} kg ({formatShort(lastW.date)})</div>}
            {delta !== null && <div className="small" style={{ color: delta < 0 ? 'var(--acc)' : delta > 0 ? 'var(--org)' : 'var(--tx1)' }}>{delta > 0 ? '+' : ''}{delta.toFixed(1)} kg sur la période</div>}
          </div>
          <button className={'btn ' + (todayW ? 'ghost' : '')} onClick={() => setWeighing(today)}><IconScale style={{ width: 16, height: 16 }} /> {todayW ? `${todayW.kg} kg` : 'Peser'}</button>
        </div>
        {points.length >= 2 ? (
          <LineChart points={points} series={[{ name: 'Pesée', color: 'var(--tx2)', kind: 'dots', unit: ' kg' }, { name: 'Moyenne 7 j', color: 'var(--acc)', kind: 'line', unit: ' kg' }]} yFormat={(v) => v.toFixed(1)} goal={goal ? { value: goal, label: `Objectif ${goal} kg` } : undefined} />
        ) : (
          <div className="empty">Pèse-toi chaque matin : la courbe et le TDEE mesuré apparaîtront ici.</div>
        )}
        <div className="row between mt8">
          <div className="seg" style={{ flex: 1 }}>
            {RANGES.map((r) => <button key={r.d} className={range === r.d ? 'on' : ''} onClick={() => setRange(r.d)}>{r.l}</button>)}
          </div>
          <button className="btn ghost sm" onClick={() => { setGoalVal(goal ? String(goal) : ''); setGoalEdit(true); }}>{goal ? `Objectif ${goal} kg` : 'Objectif'}</button>
        </div>
        {weeksLeft !== null && goal && <div className="callout mt8">Au rythme actuel ({adaptive.realDeficit} kcal/j), objectif {goal} kg dans <b>~{weeksLeft} semaine{weeksLeft > 1 ? 's' : ''}</b>.</div>}
        {weights.length > 0 && (
          <details className="mt8">
            <summary className="small muted" style={{ cursor: 'pointer' }}>Historique des pesées</summary>
            <div className="list mt8">
              {[...weights].reverse().slice(0, 30).map((w) => (
                <div key={w.date} className="item compact">
                  <div className="grow small">{formatShort(w.date)}</div>
                  <b>{w.kg} kg</b>
                  <button className="btn ghost sm" onClick={() => setWeighing(w.date)}>Modifier</button>
                </div>
              ))}
            </div>
          </details>
        )}
      </div>

      {/* ---------- TDEE adaptatif ---------- */}
      <div className="card">
        <div className="row between">
          <div className="sec" style={{ margin: 0 }}><span>Dépense réelle (TDEE mesuré)</span></div>
          <Switch on={settings.useAdaptiveTdee} onChange={(v) => update({ useAdaptiveTdee: v })} label="Utiliser le TDEE mesuré" />
        </div>
        <div className="grid3 mt12">
          <div className="stat"><div className="v">{adaptive.tdee ?? '—'}<small>kcal</small></div><div className="l">Mesuré</div></div>
          <div className="stat"><div className="v">{targetToday.tdeeFormula}<small>kcal</small></div><div className="l">Formule</div></div>
          <div className="stat"><div className={'v ' + (adaptive.realDeficit !== null && adaptive.realDeficit < 0 ? 'c-acc' : '')}>{adaptive.realDeficit ?? '—'}<small>kcal/j</small></div><div className="l">Bilan réel</div></div>
        </div>
        <div className="small dim mt8">{adaptive.reason}{adaptive.tdee ? ` Apport moyen ${adaptive.avgIntake} kcal, poids ${adaptive.deltaKg! > 0 ? '+' : ''}${adaptive.deltaKg} kg sur ${adaptive.days} jours.` : ''}</div>
        {adaptive.tdee && Math.abs(adaptive.tdee - targetToday.tdeeFormula) > 250 && (
          <div className="callout warn mt8">Écart important avec la formule ({adaptive.tdee > targetToday.tdeeFormula ? '+' : ''}{adaptive.tdee - targetToday.tdeeFormula} kcal). Vérifie que tout est bien journalisé avant d'activer.</div>
        )}
        {settings.useAdaptiveTdee && adaptive.tdee && <div className="small c-acc mt8">Actif : cible du jour {targetToday.cal} kcal au lieu de {targetToday.tdeeFormula - targetToday.deficit}.</div>}
      </div>

      {/* ---------- Semaine ---------- */}
      <div className="card">
        <div className="sec"><span>7 derniers jours</span><span className="link" style={{ color: 'var(--tx2)' }}>{week.loggedDays}/7 journalisés</span></div>
        <BarsChart points={week.days.map((d) => ({ label: formatShort(d.date).slice(0, 3), value: d.cal, target: d.target, empty: !d.logged }))} />
        <div className="grid3 mt12">
          <div className="stat"><div className="v">{week.avgCal}<small>kcal</small></div><div className="l">Moyenne / jour{prevWeek.loggedDays ? <span className={week.avgCal - prevWeek.avgCal <= 0 ? ' c-acc' : ' c-red'}> ({week.avgCal - prevWeek.avgCal > 0 ? '+' : ''}{week.avgCal - prevWeek.avgCal})</span> : ''}</div></div>
          <div className="stat"><div className={'v ' + (week.avgDelta <= 0 ? 'c-acc' : 'c-red')}>{week.avgDelta > 0 ? '+' : ''}{week.avgDelta}<small>kcal</small></div><div className="l">Écart / cible</div></div>
          <div className="stat"><div className="v">{week.adherence}<small>%</small></div><div className="l">Jours dans ±10 %</div></div>
        </div>
        <div className="macro-row mt12">
          {[['Prot', week.avgP, targetToday.p, 'var(--c-prot)'], ['Gluc', week.avgG, targetToday.g, 'var(--c-carb)'], ['Lip', week.avgL, targetToday.l, 'var(--c-fat)'], ['Fibres', week.avgFib, settings.fiberGoal, 'var(--c-fib)']].map(([l, v, m, c]) => (
            <div key={String(l)} className="macro">
              <div className="lbl"><span>{l}</span><span><b>{v}</b>/{m}</span></div>
              <div className="bar"><div style={{ width: Math.min((Number(v) / Number(m)) * 100, 100) + '%', background: String(c) }} /></div>
            </div>
          ))}
        </div>
        <div className="xs muted mt8">Moyennes sur les jours journalisés uniquement.</div>
      </div>

      <WeighSheet date={weighing} initial={weights.find((w) => w.date === weighing)?.kg ?? lastW?.kg} onClose={() => setWeighing(null)} />

      <Sheet open={goalEdit} onClose={() => setGoalEdit(false)} title="Poids objectif"
        footer={<div className="row">{goal && <button className="btn ghost" onClick={async () => { await update({ goalWeight: undefined }); setGoalEdit(false); }}>Retirer</button>}<button className="btn lg grow" onClick={async () => { const v = parseFloat(goalVal.replace(',', '.')); if (v > 20) { await update({ goalWeight: v }); toast('Objectif enregistré'); } setGoalEdit(false); }}>Enregistrer</button></div>}>
        <input className="input lg" type="number" inputMode="decimal" step="0.1" value={goalVal} onChange={(e) => setGoalVal(e.target.value)} placeholder="ex : 82" autoFocus />
        <div className="center xs muted mt4">kg</div>
      </Sheet>
    </div>
  );
}

function WeighSheet({ date, initial, onClose }: { date: DateKey | null; initial?: number; onClose: () => void }) {
  const [v, setV] = useState('');
  const toast = useToast();
  const key = date ?? '';
  // Réinitialise à l'ouverture.
  const [openedFor, setOpenedFor] = useState('');
  if (date && openedFor !== date) { setOpenedFor(date); setV(initial ? String(initial) : ''); }
  if (!date) return null;
  const n = parseFloat(v.replace(',', '.'));
  const valid = Number.isFinite(n) && n > 20 && n < 400;
  return (
    <Sheet open={!!date} onClose={onClose} title={`Pesée · ${formatShort(key)}`}
      footer={<div className="row"><button className="btn ghost" onClick={async () => { await deleteWeight(key); onClose(); }}>Effacer</button><button className="btn lg grow" disabled={!valid} onClick={async () => { await upsertWeight(key, Math.round(n * 10) / 10); toast('Poids enregistré'); onClose(); }}>Enregistrer</button></div>}>
      <input className="input lg" type="number" inputMode="decimal" step="0.1" value={v} onChange={(e) => setV(e.target.value)} onFocus={(e) => e.target.select()} placeholder="kg" autoFocus />
      <div className="chips mt12" style={{ justifyContent: 'center' }}>
        {[-0.5, -0.2, -0.1, 0.1, 0.2, 0.5].map((dlt) => <button key={dlt} className="chip" onClick={() => setV((Math.round(((Number.isFinite(n) ? n : initial ?? 80) + dlt) * 10) / 10).toString())}>{dlt > 0 ? '+' : ''}{dlt}</button>)}
      </div>
      <div className="callout info mt12">Pèse-toi le matin à jeun, après être passé aux toilettes. Le poids brut fluctue de ±1 kg : c'est la moyenne 7 jours qui compte.</div>
    </Sheet>
  );
}
