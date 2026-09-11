const EMPTY: never[] = [];
import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../data/db';
import { exportBackup, importBackup, wipeAll } from '../../data/backup';
import { todayKey } from '../../domain/dates';
import { ACTIVITY, DEFICIT, calcTargets, macroKcal } from '../../domain/nutrition';
import type { ActivityId, DeficitId, Profile, Settings } from '../../domain/types';
import { MODELS } from '../../services/ai';
import { syncNotifications } from '../../services/notifications';
import { isNative, pickFile, readFileText, shareTextFile } from '../../services/platform';
import { IconBell, IconDownload, IconKey, IconRight, IconUpload, IconEdit } from '../components/Icons';
import { Ring } from '../components/Ring';
import { Sheet } from '../components/Sheet';
import { ToggleRow } from '../components/Switch';
import { useToast } from '../components/Toast';
import { FoodForm, FoodList } from './AddFood';
import { RecipesSheet } from './Recipes';

const DAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const DAY_IDX = [1, 2, 3, 4, 5, 6, 0];

export function ProfileScreen({ settings, update }: { settings: Settings; update: (p: Partial<Settings>) => Promise<void> }) {
  const [sub, setSub] = useState<'ai' | 'notif' | 'backup' | 'foods' | 'recipes' | 'bilan' | null>(null);
  const p = settings.profile;
  const setP = (patch: Partial<Profile>) => update({ profile: { ...p, ...patch }, onboarded: true });
  const t = calcTargets(p, todayKey());
  const kc = macroKcal(t);

  const numField = (key: 'weight' | 'height' | 'age', label: string, step = 1) => (
    <div className="field" key={key}>
      <label>{label}</label>
      <input className="input" type="number" inputMode="decimal" step={step} value={p[key]} onChange={(e) => { const v = parseFloat(e.target.value); if (Number.isFinite(v)) setP({ [key]: v } as Partial<Profile>); }} />
    </div>
  );

  return (
    <div>
      <div className="card hero row" style={{ gap: 16 }}>
        <Ring pct={100} color="var(--acc-l)" size={70} stroke={5}>
          <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--acc-l)' }}>{t.cal}</div>
          <div className="xs muted">kcal</div>
        </Ring>
        <div className="grow">
          <div className="xs muted" style={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>Cible journalière{p.carbCycling ? ' (jour type)' : ''}</div>
          <div className="small mt4"><span className="c-prot bold">{t.p} g</span> prot · <span className="c-carb bold">{t.g} g</span> gluc · <span className="c-fat bold">{t.l} g</span> lip</div>
          <div className="xs muted mt4">BMR {t.bmr} · TDEE {t.tdeeFormula} · déficit {t.deficit}</div>
          <button className="link small mt4" style={{ color: 'var(--acc)' }} onClick={() => setSub('bilan')}>Voir le détail du calcul ›</button>
        </div>
      </div>

      <div className="card">
        <div className="sec"><span>Mes informations</span></div>
        <div className="grid2">
          {numField('weight', 'Poids (kg)', 0.1)}
          {numField('height', 'Taille (cm)')}
          {numField('age', 'Âge')}
          <div className="field"><label>Sexe</label>
            <div className="seg"><button className={p.sex === 'male' ? 'on' : ''} onClick={() => setP({ sex: 'male' })}>Homme</button><button className={p.sex === 'female' ? 'on' : ''} onClick={() => setP({ sex: 'female' })}>Femme</button></div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="sec"><span>Activité physique</span></div>
        <div className="col" style={{ gap: 5 }}>
          {ACTIVITY.map((a) => (
            <button key={a.id} className={'pill row between' + (p.activity === a.id ? ' on' : '')} onClick={() => setP({ activity: a.id as ActivityId })}><span>{a.label}</span><span className="xs" style={{ opacity: 0.7 }}>{a.desc} · ×{a.f}</span></button>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="sec"><span>Objectif</span></div>
        <div className="row" style={{ gap: 6 }}>
          {DEFICIT.map((d) => (
            <button key={d.id} className={'pill grow col center' + (p.deficit === d.id ? ' on' : '')} style={{ gap: 2, alignItems: 'center' }} onClick={() => setP({ deficit: d.id as DeficitId })}><span className="bold">{d.label}</span><span className="xs" style={{ opacity: 0.7 }}>{d.desc}</span></button>
          ))}
        </div>
        <div className="grid2 mt12">
          <div className="field"><label>Protéines (g/kg)</label><input className="input" type="number" inputMode="decimal" step="0.1" value={p.proteinPerKg} onChange={(e) => setP({ proteinPerKg: parseFloat(e.target.value) || 1.6 })} /></div>
          <div className="field"><label>Lipides (g/kg)</label><input className="input" type="number" inputMode="decimal" step="0.1" value={p.fatPerKg} onChange={(e) => setP({ fatPerKg: parseFloat(e.target.value) || 0.8 })} /></div>
        </div>
        <div className="xs muted mt4">Repères : 1,6 à 2,2 g/kg de protéines en sèche ; jamais sous 0,7 g/kg de lipides.</div>
      </div>

      <div className="card">
        <div className="sec"><span>Entraînement</span></div>
        <div className="xs muted mb8">Jours d'entraînement habituels (modifiable jour par jour dans le journal).</div>
        <div className="row" style={{ gap: 6 }}>
          {DAYS.map((l, i) => {
            const idx = DAY_IDX[i];
            const on = p.trainingDays.includes(idx);
            return <button key={i} className={'chip grow center' + (on ? ' on' : '')} style={{ padding: '9px 0' }} onClick={() => setP({ trainingDays: on ? p.trainingDays.filter((x) => x !== idx) : [...p.trainingDays, idx] })}>{l}</button>;
          })}
        </div>
        <div className="mt8">
          <ToggleRow title="Cyclage des glucides" desc={`+${p.trainingBonusKcal} kcal les jours d'entraînement, compensés les jours de repos (moyenne hebdo inchangée).`} on={p.carbCycling} onChange={(v) => setP({ carbCycling: v })} />
          {p.carbCycling && (
            <div className="field mt8"><label>Bonus jour d'entraînement (kcal)</label>
              <div className="seg">{[100, 150, 200, 300].map((b) => <button key={b} className={p.trainingBonusKcal === b ? 'on' : ''} onClick={() => setP({ trainingBonusKcal: b })}>+{b}</button>)}</div>
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <div className="sec"><span>Suivi</span></div>
        <div className="grid2">
          <div className="field"><label>Objectif eau (L)</label><input className="input" type="number" inputMode="decimal" step="0.25" value={settings.waterGoalMl / 1000} onChange={(e) => update({ waterGoalMl: Math.round((parseFloat(e.target.value) || 2) * 1000) })} /></div>
          <div className="field"><label>Objectif fibres (g)</label><input className="input" type="number" inputMode="numeric" value={settings.fiberGoal} onChange={(e) => update({ fiberGoal: parseInt(e.target.value) || 30 })} /></div>
        </div>
      </div>

      <div className="sec"><span>Application</span></div>
      <div className="card" style={{ padding: '4px 16px' }}>
        {[
          { id: 'ai' as const, icon: <IconKey />, t: 'Chat IA & clé API', d: settings.apiKey ? `${MODELS.find((m) => m.id === settings.model)?.label ?? settings.model} · clé configurée` : 'Clé API manquante' },
          { id: 'notif' as const, icon: <IconBell />, t: 'Rappels', d: settings.notifications.weighIn || settings.notifications.journal ? [settings.notifications.weighIn && `pesée ${settings.notifications.weighInTime}`, settings.notifications.journal && `journal ${settings.notifications.journalTime}`].filter(Boolean).join(' · ') : 'Désactivés' },
          { id: 'foods' as const, icon: <IconEdit />, t: 'Mes aliments', d: 'Aliments perso, scannés, favoris' },
          { id: 'recipes' as const, icon: <IconEdit />, t: 'Mes recettes', d: 'Plats composés réutilisables' },
          { id: 'backup' as const, icon: <IconDownload />, t: 'Sauvegarde & transfert', d: 'Exporter / importer toutes les données' },
        ].map((row) => (
          <button key={row.id} className="toggle-row" style={{ width: '100%', textAlign: 'left' }} onClick={() => setSub(row.id)}>
            <div className="row"><span className="iconbtn" style={{ color: 'var(--acc)' }}>{row.icon}</span><div><div className="t">{row.t}</div><div className="d">{row.d}</div></div></div>
            <IconRight style={{ width: 18, height: 18, color: 'var(--tx2)' }} />
          </button>
        ))}
      </div>
      <div className="xs muted center mt12 mb12">NutriTrack · données stockées uniquement sur cet appareil</div>

      <AiSheet open={sub === 'ai'} onClose={() => setSub(null)} settings={settings} update={update} />
      <NotifSheet open={sub === 'notif'} onClose={() => setSub(null)} settings={settings} update={update} />
      <BackupSheet open={sub === 'backup'} onClose={() => setSub(null)} />
      <FoodsSheet open={sub === 'foods'} onClose={() => setSub(null)} />
      <RecipesSheet open={sub === 'recipes'} onClose={() => setSub(null)} />
      <Sheet open={sub === 'bilan'} onClose={() => setSub(null)} title="Calcul de tes besoins">
        {[
          { n: '1', t: 'Métabolisme de base (BMR)', f: `(10 × ${p.weight}) + (6,25 × ${p.height}) − (5 × ${p.age}) ${p.sex === 'male' ? '+ 5' : '− 161'}`, r: t.bmr, c: 'var(--acc)', d: 'Énergie brûlée au repos : respiration, organes, cerveau (Mifflin-St Jeor).' },
          { n: '2', t: 'Dépense totale (TDEE)', f: `${t.bmr} × ${ACTIVITY.find((a) => a.id === p.activity)?.f}`, r: t.tdeeFormula, c: 'var(--org)', d: 'Avec ton niveau d’activité. Après quelques semaines de journal et de pesées, l’onglet Suivi mesure ta vraie dépense.' },
          { n: '3', t: 'Cible avec déficit', f: `${t.tdeeFormula} − ${t.deficit}`, r: t.tdeeFormula - t.deficit, c: 'var(--red)', d: `−${t.deficit} kcal/j ≈ ${(t.deficit * 7 / 7700).toFixed(2)} kg de graisse par semaine (1 kg = 7 700 kcal).` },
        ].map((s) => (
          <div key={s.n} className="card tight" style={{ borderLeft: `3px solid ${s.c}`, background: 'var(--bg2)', border: 'none', borderLeftStyle: 'solid', borderLeftWidth: 3, borderLeftColor: s.c }}>
            <div className="xs muted" style={{ textTransform: 'uppercase' }}>{s.n}. {s.t}</div>
            <div className="mono small mt4" style={{ color: s.c }}>{s.f}</div>
            <div style={{ fontSize: 24, fontWeight: 600, color: s.c }}>{s.r} <span className="small" style={{ fontWeight: 400 }}>kcal/j</span></div>
            <div className="small dim mt4">{s.d}</div>
          </div>
        ))}
        <div className="sec mt12"><span>Répartition des macros</span></div>
        <div className="row" style={{ justifyContent: 'space-around' }}>
          {[{ l: 'Protéines', v: t.p, k: kc.p, c: 'var(--c-prot)' }, { l: 'Glucides', v: t.g, k: kc.g, c: 'var(--c-carb)' }, { l: 'Lipides', v: t.l, k: kc.l, c: 'var(--c-fat)' }].map((m) => (
            <div key={m.l} className="col center" style={{ alignItems: 'center', gap: 4 }}>
              <Ring pct={Math.round((m.k / t.cal) * 100)} color={m.c} size={54}><span className="small bold" style={{ color: m.c }}>{Math.round((m.k / t.cal) * 100)}%</span></Ring>
              <b>{m.v} g</b><span className="xs muted">{m.l} · {m.k} kcal</span>
            </div>
          ))}
        </div>
        <div className="callout mt12">Protéines {p.proteinPerKg} g/kg pour préserver le muscle. Lipides {p.fatPerKg} g/kg pour les hormones. Les glucides prennent le reste : ce sont eux qui absorbent le cyclage entraînement / repos.</div>
      </Sheet>
    </div>
  );
}

function AiSheet({ open, onClose, settings, update }: { open: boolean; onClose: () => void; settings: Settings; update: (p: Partial<Settings>) => Promise<void> }) {
  const [key, setKey] = useState(settings.apiKey);
  const [show, setShow] = useState(false);
  const toast = useToast();
  useEffect(() => { if (open) setKey(settings.apiKey); }, [open, settings.apiKey]);
  return (
    <Sheet open={open} onClose={onClose} title="Chat IA" footer={<button className="btn lg block" onClick={async () => { await update({ apiKey: key.trim(), onboarded: true }); toast('Enregistré'); onClose(); }}>Enregistrer</button>}>
      <div className="field"><label>Clé API Anthropic</label>
        <div className="row"><input className="input grow mono" type={show ? 'text' : 'password'} value={key} onChange={(e) => setKey(e.target.value)} placeholder="sk-ant-…" autoCapitalize="off" autoCorrect="off" spellCheck={false} /><button className="btn ghost sm" onClick={() => setShow(!show)}>{show ? 'Cacher' : 'Voir'}</button></div>
      </div>
      <div className="callout info mt8">Crée une clé sur <b>console.anthropic.com</b> › API keys. Elle reste stockée sur ce téléphone et n'est envoyée qu'à l'API Anthropic. Elle est incluse dans les sauvegardes.</div>
      <div className="sec mt16"><span>Modèle</span></div>
      <div className="col" style={{ gap: 5 }}>
        {MODELS.map((m) => <button key={m.id} className={'pill row between' + (settings.model === m.id ? ' on' : '')} onClick={() => update({ model: m.id })}><span>{m.label}</span><span className="xs" style={{ opacity: 0.7 }}>{m.desc}</span></button>)}
      </div>
    </Sheet>
  );
}

function NotifSheet({ open, onClose, settings, update }: { open: boolean; onClose: () => void; settings: Settings; update: (p: Partial<Settings>) => Promise<void> }) {
  const n = settings.notifications;
  const toast = useToast();
  const set = async (patch: Partial<typeof n>) => {
    const next = { ...n, ...patch };
    await update({ notifications: next });
    if (isNative()) {
      const ok = await syncNotifications(next);
      if (!ok && (next.weighIn || next.journal)) toast('Autorise les notifications dans les réglages Android', 'err');
    }
  };
  return (
    <Sheet open={open} onClose={onClose} title="Rappels">
      {!isNative() && <div className="callout warn mb12">Les rappels ne fonctionnent que dans l'application Android.</div>}
      <ToggleRow title="Pesée du matin" desc="Un rappel quotidien pour monter sur la balance." on={n.weighIn} onChange={(v) => set({ weighIn: v })} />
      {n.weighIn && <div className="field mb8"><label>Heure</label><input className="input" type="time" value={n.weighInTime} onChange={(e) => set({ weighInTime: e.target.value })} /></div>}
      <ToggleRow title="Journal du soir" desc="Vérifier que tout est noté avant de dormir." on={n.journal} onChange={(v) => set({ journal: v })} />
      {n.journal && <div className="field"><label>Heure</label><input className="input" type="time" value={n.journalTime} onChange={(e) => set({ journalTime: e.target.value })} /></div>}
    </Sheet>
  );
}

function BackupSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<{ json: string; name: string } | null>(null);
  const [confirmWipe, setConfirmWipe] = useState(false);
  const toast = useToast();
  const counts = useLiveQuery(async () => ({ e: await db.entries.count(), w: await db.weights.count(), f: await db.foods.where('source').notEqual('seed').count(), r: await db.recipes.count() }), []);

  const doExport = async () => {
    setBusy(true);
    try {
      const json = await exportBackup();
      const name = `nutritrack-${todayKey()}.json`;
      const how = await shareTextFile(name, json);
      toast(how === 'shared' ? 'Sauvegarde prête à partager' : 'Sauvegarde téléchargée');
    } catch (e) { toast(e instanceof Error ? e.message : 'Export impossible', 'err'); } finally { setBusy(false); }
  };
  const doPick = async () => {
    const f = await pickFile('application/json,.json');
    if (!f) return;
    setPending({ json: await readFileText(f), name: f.name });
  };
  const doImport = async (mode: 'replace' | 'merge') => {
    if (!pending) return;
    setBusy(true);
    try {
      const s = await importBackup(pending.json, mode);
      toast(`Importé : ${s.entries} entrées, ${s.weights} pesées, ${s.foods} aliments`);
      setPending(null); onClose();
    } catch (e) { toast(e instanceof Error ? e.message : 'Import impossible', 'err'); } finally { setBusy(false); }
  };

  return (
    <Sheet open={open} onClose={onClose} title="Sauvegarde & transfert">
      <div className="callout info mb12">Tout est stocké sur ce téléphone. Pour changer d'appareil ou te protéger d'une perte : exporte un fichier, garde-le sur Drive / mail, puis importe-le sur le nouveau téléphone.</div>
      {counts && <div className="xs muted mb8">{counts.e} entrées de journal · {counts.w} pesées · {counts.f} aliments perso · {counts.r} recettes</div>}
      <button className="btn lg block" disabled={busy} onClick={doExport}><IconDownload style={{ width: 18, height: 18 }} /> Exporter une sauvegarde</button>
      <hr className="sep" />
      {pending ? (
        <div className="card accent">
          <div className="bold small">{pending.name}</div>
          <div className="xs dim mt4 mb8">Comment importer ?</div>
          <button className="btn block mb8" disabled={busy} onClick={() => doImport('replace')}>Remplacer tout (nouveau téléphone)</button>
          <button className="btn ghost block mb8" disabled={busy} onClick={() => doImport('merge')}>Fusionner avec les données actuelles</button>
          <button className="btn subtle block sm" onClick={() => setPending(null)}>Annuler</button>
        </div>
      ) : (
        <button className="btn ghost lg block" disabled={busy} onClick={doPick}><IconUpload style={{ width: 18, height: 18 }} /> Importer une sauvegarde</button>
      )}
      <hr className="sep" />
      {confirmWipe ? (
        <div className="card danger"><div className="small bold mb8">Effacer toutes les données de l'application ?</div><div className="row"><button className="btn danger grow" onClick={async () => { await wipeAll(); setConfirmWipe(false); toast('Données effacées'); onClose(); }}>Oui, tout effacer</button><button className="btn ghost" onClick={() => setConfirmWipe(false)}>Non</button></div></div>
      ) : (
        <button className="btn subtle block sm" style={{ color: 'var(--red)' }} onClick={() => setConfirmWipe(true)}>Réinitialiser l'application</button>
      )}
    </Sheet>
  );
}

function FoodsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [tab, setTab] = useState<'mine' | 'fav'>('mine');
  const [edit, setEdit] = useState<import('../../domain/types').FoodItem | 'new' | null>(null);
  const foods = useLiveQuery(() => db.foods.toArray(), []) ?? EMPTY;
  const mine = foods.filter((f) => f.source !== 'seed').sort((a, b) => b.createdAt - a.createdAt);
  const favs = foods.filter((f) => f.favorite);
  return (
    <>
      <Sheet open={open} onClose={onClose} full title="Mes aliments">
        <div className="seg mb12"><button className={tab === 'mine' ? 'on' : ''} onClick={() => setTab('mine')}>Perso & scannés ({mine.length})</button><button className={tab === 'fav' ? 'on' : ''} onClick={() => setTab('fav')}>Favoris ({favs.length})</button></div>
        {tab === 'mine' && <button className="btn outline block mb12" onClick={() => setEdit('new')}>+ Nouvel aliment perso</button>}
        <FoodList items={tab === 'mine' ? mine : favs} onPick={(f) => (f.source !== 'seed' ? setEdit(f) : undefined)} onEdit={setEdit} onFav={async (f) => { await db.foods.put({ ...f, favorite: !f.favorite }); }} />
        {tab === 'mine' && mine.length === 0 && <div className="empty">Aucun aliment perso. Ajoute les produits que tu consommes souvent, ils sortiront en premier dans la recherche.</div>}
      </Sheet>
      <FoodForm food={edit === 'new' ? null : edit} open={edit !== null} onClose={() => setEdit(null)} onSaved={() => setEdit(null)} />
    </>
  );
}
