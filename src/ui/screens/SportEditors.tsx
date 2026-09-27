import { useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { newId } from '../../data/db';
import { saveExercise, saveProgram } from '../../data/repos';
import { matchesQuery, normalize } from '../../domain/foods';
import { stableJson } from '../../domain/json';
import { GROUP_FR, groupBlocks, insertBlock, linkedWithNext, moveGroup, normalizeSupersets, removeAt, setLinked } from '../../domain/training';
import type { Exercise, ExerciseKind, MuscleGroup, Program, ProgramBlock } from '../../domain/types';
import { IconEdit, IconPlus, IconSearch, IconTrash } from '../components/Icons';
import { Sheet } from '../components/Sheet';
import { ToggleRow } from '../components/Switch';
import { useToast } from '../components/Toast';
import { exName, type ExMap } from '../sportText';

const num = (v: string) => {
  const n = parseFloat(v.replace(',', '.'));
  return Number.isFinite(n) ? n : undefined;
};

const show = (v?: number) => (v === undefined ? '' : String(v));

/**
 * Champ numérique qui garde la saisie en cours (« 22, » ne devient pas « 22 »). Si la valeur change ailleurs
 * (repos fusionné par un superset, exercice remplacé…), le champ la reprend, sauf pendant qu'on tape ;
 * en quittant le champ, il affiche la valeur réellement retenue.
 */
export function NumInput({ value, onChange, placeholder }: { value?: number; onChange: (v?: number) => void; placeholder?: string }) {
  const [txt, setTxt] = useState(show(value));
  const [focused, setFocused] = useState(false);
  const [prev, setPrev] = useState(value);
  if (value !== prev) {
    setPrev(value);
    if (!focused && value !== num(txt)) setTxt(show(value));
  }
  return (
    <input className="input" type="text" inputMode="decimal" value={txt} placeholder={placeholder}
      onChange={(e) => { setTxt(e.target.value); onChange(num(e.target.value)); }}
      onFocus={(e) => { setFocused(true); e.target.select(); }}
      onBlur={() => { setFocused(false); if (value !== num(txt)) setTxt(show(value)); }} />
  );
}

// ---------- Glisser-déposer ----------

type Linkable = { kind: string; superset?: number; restSec?: number };
const GAP = 6; // écart entre deux groupes (.order-list)

/**
 * Réordonner au doigt ou à la souris par une poignée : l'élément suit le pointeur, les autres
 * s'écartent pour montrer la place qu'il prendra ; le déplacement n'est appliqué qu'au lâcher.
 */
function useDragReorder(onMove: (from: number, to: number) => void) {
  const refs = useRef<(HTMLElement | null)[]>([]);
  // Milieux des éléments au début du geste ; null pour une place vide (élément retiré depuis).
  const origin = useRef<{ y: number; mids: (number | null)[]; center: number } | null>(null);
  // Un seul geste à la fois : un second doigt posé pendant un glisser est ignoré (pointerId).
  const current = useRef<{ from: number; to: number; dy: number; h: number; pointerId: number } | null>(null);
  const [drag, setDrag] = useState<{ from: number; to: number; dy: number; h: number; pointerId: number } | null>(null);
  const set = (v: typeof drag) => {
    current.current = v;
    setDrag(v);
  };

  const handle = (i: number) => ({
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
      e.preventDefault();
      if (current.current) return;
      // Le pointeur suit la poignée même hors de l'élément ; sans capture possible (pointeur déjà relâché), on continue sans.
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* rien */
      }
      const rects = refs.current.map((el) => el?.getBoundingClientRect());
      const r = rects[i];
      if (!r) return;
      origin.current = { y: e.clientY, mids: rects.map((x) => (x ? x.top + x.height / 2 : null)), center: r.top + r.height / 2 };
      set({ from: i, to: i, dy: 0, h: r.height + GAP, pointerId: e.pointerId });
    },
    onPointerMove: (e: ReactPointerEvent<HTMLElement>) => {
      const o = origin.current;
      const d = current.current;
      if (!o || !d || e.pointerId !== d.pointerId) return;
      const dy = e.clientY - o.y;
      const center = o.center + dy;
      let to = d.from;
      o.mids.forEach((mid, j) => {
        if (mid === null) return;
        if (j < d.from && center < mid) to = Math.min(to, j);
        if (j > d.from && center > mid) to = Math.max(to, j);
      });
      set({ ...d, dy, to });
    },
    onPointerUp: (e: ReactPointerEvent<HTMLElement>) => {
      const d = current.current;
      if (d && e.pointerId !== d.pointerId) return;
      origin.current = null;
      set(null);
      if (d && d.to !== d.from) onMove(d.from, d.to);
    },
    onPointerCancel: (e: ReactPointerEvent<HTMLElement>) => {
      if (current.current && e.pointerId !== current.current.pointerId) return;
      origin.current = null;
      set(null);
    },
  });

  const style = (i: number): CSSProperties | undefined => {
    if (!drag) return undefined;
    if (i === drag.from) return { transform: `translateY(${drag.dy}px)`, zIndex: 3, position: 'relative' };
    const shift = i > drag.from && i <= drag.to ? -drag.h : i < drag.from && i >= drag.to ? drag.h : 0;
    return { transform: `translateY(${shift}px)`, transition: 'transform .15s' };
  };

  return { refs, handle, style, dragging: drag?.from ?? null };
}

/**
 * Liste compacte, réordonnable par la poignée ⠿ : un superset se déplace d'un bloc.
 * Sous un exercice suivi d'un autre, « Superset avec le suivant » lie ou délie les deux.
 */
export function BlockOrderList<T extends Linkable>({ blocks, onChange, renderRow, keyOf }: {
  blocks: T[]; onChange: (blocks: T[]) => void; renderRow: (b: T, i: number) => ReactNode; keyOf: (b: T, i: number) => string;
}) {
  const groups = groupBlocks(blocks);
  const drag = useDragReorder((from, to) => onChange(moveGroup(blocks, from, to)));
  return (
    <div className="order-list">
      {groups.map((g, gi) => (
        <div key={g.map((i) => keyOf(blocks[i], i)).join('+')} ref={(el) => { drag.refs.current[gi] = el; }}
          className={'order-group' + (g.length > 1 ? ' linked' : '') + (drag.dragging === gi ? ' dragging' : '')} style={drag.style(gi)}>
          <button type="button" className="drag-handle" aria-label="Déplacer" title="Glisser pour déplacer" {...drag.handle(gi)}>⠿</button>
          <div className="grow" style={{ minWidth: 0 }}>
            {g.length > 1 && <div className="xs c-acc bold mb4">Superset · enchaîné sans pause</div>}
            {g.map((i) => {
              const linked = linkedWithNext(blocks, i);
              return (
                <div key={keyOf(blocks[i], i)} className="order-row">
                  {renderRow(blocks[i], i)}
                  {blocks[i].kind === 'serie' && blocks[i + 1]?.kind === 'serie' && (
                    <button type="button" className={'chip xs mt4' + (linked ? ' on' : '')} onClick={() => onChange(setLinked(blocks, i, !linked))}>
                      🔗 {linked ? 'En superset avec le suivant' : 'Superset avec le suivant'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------- Catalogue ----------

const KINDS: { id: ExerciseKind; label: string }[] = [
  { id: 'charge', label: 'Charge' }, { id: 'pdc', label: 'Poids du corps' }, { id: 'temps', label: 'Durée' }, { id: 'cardio', label: 'Cardio' },
];
const GROUPS = (Object.keys(GROUP_FR) as MuscleGroup[]).filter((g) => g !== 'cardio');

/** Catalogue d'exercices : recherche, filtre par muscle, création d'un exercice perso (gardé au catalogue pour la suite). */
export function ExercisePicker({ title, exercises, allowCardio, initialGroup, onPick, onClose }: {
  title: string; exercises: Exercise[]; allowCardio: boolean; initialGroup?: MuscleGroup;
  onPick: (e: Exercise) => void; onClose: () => void;
}) {
  const [q, setQ] = useState('');
  const [group, setGroup] = useState<MuscleGroup | null>(initialGroup && initialGroup !== 'cardio' ? initialGroup : null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<ExerciseKind>('charge');
  const [groups, setGroups] = useState<MuscleGroup[]>([]);
  const [perSide, setPerSide] = useState(false);
  const toast = useToast();

  // Une recherche porte sur tout le catalogue, sans le filtre de muscle.
  const list = exercises
    .filter((e) => (allowCardio || e.kind !== 'cardio') && (q.trim() ? matchesQuery(e.name, q) : !group || e.groups.includes(group)))
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  const validNew = !!name.trim() && (kind === 'cardio' || groups.length > 0);

  const create = async () => {
    const n = name.trim();
    if (!validNew) return;
    if (exercises.some((e) => normalize(e.name) === normalize(n))) return toast('Cet exercice est déjà dans le catalogue', 'err');
    const ex: Exercise = { id: newId(), name: n, kind, groups: kind === 'cardio' ? ['cardio'] : groups, ...(perSide && kind !== 'cardio' ? { perSide: true } : {}), source: 'custom' };
    await saveExercise(ex);
    toast(`${n} ajouté au catalogue`);
    onPick(ex);
  };

  return (
    <Sheet open onClose={onClose} full title={creating ? 'Nouvel exercice' : title}
      footer={creating ? (
        <div className="row">
          <button className="btn ghost" onClick={() => setCreating(false)}>Retour</button>
          <button className="btn lg grow" disabled={!validNew} onClick={create}>Créer et choisir</button>
        </div>
      ) : undefined}>
      {creating ? (
        <>
          <div className="field"><label>Nom</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex. : Rowing T-bar" autoFocus /></div>
          <div className="sec mt12"><span>Mesure</span></div>
          <div className="chips">{KINDS.filter((k) => allowCardio || k.id !== 'cardio').map((k) => <button key={k.id} className={'chip' + (kind === k.id ? ' on' : '')} onClick={() => setKind(k.id)}>{k.label}</button>)}</div>
          {kind !== 'cardio' && (
            <>
              <div className="sec mt12"><span>Muscles travaillés</span></div>
              <div className="chips">{GROUPS.map((g) => <button key={g} className={'chip' + (groups.includes(g) ? ' on' : '')} onClick={() => setGroups(groups.includes(g) ? groups.filter((x) => x !== g) : [...groups, g])}>{GROUP_FR[g]}</button>)}</div>
              <div className="mt12"><ToggleRow title="Unilatéral" desc="Répétitions comptées par côté (fentes, rowing un bras…)." on={perSide} onChange={setPerSide} /></div>
            </>
          )}
        </>
      ) : (
        <>
          <div className="row grow mb8" style={{ background: 'var(--bg2)', borderRadius: 10, padding: '0 10px', border: '1px solid var(--brd)' }}>
            <IconSearch style={{ width: 18, height: 18, color: 'var(--tx2)' }} />
            <input className="input bare grow" placeholder="Hip thrust, curl, tirage…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          {!q.trim() && (
            <div className="chips scroll mb8">
              {GROUPS.map((g) => <button key={g} className={'chip' + (group === g ? ' on' : '')} onClick={() => setGroup(group === g ? null : g)}>{GROUP_FR[g]}</button>)}
              {allowCardio && <button className={'chip' + (group === 'cardio' ? ' on' : '')} onClick={() => setGroup(group === 'cardio' ? null : 'cardio')}>cardio</button>}
            </div>
          )}
          <div className="list">
            {list.map((e) => (
              <button key={e.id} className="item compact" onClick={() => onPick(e)}>
                <div className="grow" style={{ textAlign: 'left' }}>
                  <div className="name">{e.name} {e.source === 'custom' && <span className="badge">perso</span>}</div>
                  <div className="meta">{e.groups.map((g) => GROUP_FR[g]).join(', ')}{e.perSide ? ' · par côté' : ''}</div>
                </div>
              </button>
            ))}
          </div>
          {!list.length && <div className="empty">Aucun exercice trouvé.</div>}
          <button className="btn ghost block mt12" onClick={() => { setName(q.trim()); setCreating(true); }}>
            <IconPlus style={{ width: 16, height: 16 }} /> {q.trim() ? `Créer « ${q.trim()} »` : 'Créer un exercice'}
          </button>
        </>
      )}
    </Sheet>
  );
}

// ---------- Séance type ----------

const blockKey = (b: ProgramBlock, i: number) => `${i}-${b.kind === 'circuit' ? 'circuit' : b.exerciseId}`;

/**
 * Éditeur d'une séance type : ordre (glisser-déposer), supersets, séries / objectif / repos,
 * exercices changés, retirés ou ajoutés. Rien n'est écrit avant « Enregistrer ».
 */
export function ProgramEditor({ program, exercises, exMap, onClose }: { program: Program; exercises: Exercise[]; exMap: ExMap; onClose: () => void }) {
  const [name, setName] = useState(program.name);
  const [blocks, setBlocks] = useState<ProgramBlock[]>(program.blocks);
  const [picker, setPicker] = useState<{ replace?: number } | null>(null);
  const [leaving, setLeaving] = useState(false);
  const toast = useToast();

  const changed = name.trim() !== program.name || stableJson(normalizeSupersets(blocks)) !== stableJson(normalizeSupersets(program.blocks));
  const valid = !!name.trim() && blocks.length > 0 && blocks.every((b) => b.kind !== 'serie' || b.sets >= 1);
  const setAt = (i: number, patch: Partial<Extract<ProgramBlock, { kind: 'serie' }>>) =>
    setBlocks(blocks.map((b, j) => (j === i && b.kind === 'serie' ? { ...b, ...patch } : b)));
  const close = () => (changed ? setLeaving(true) : onClose());
  const save = async () => {
    await saveProgram({ ...program, name: name.trim(), blocks: normalizeSupersets(blocks), source: 'custom' });
    toast(`Séance type ${name.trim()} enregistrée`);
    onClose();
  };
  const pick = (ex: Exercise) => {
    const at = picker?.replace;
    setPicker(null);
    if (at !== undefined) return setAt(at, { exerciseId: ex.id });
    setBlocks(insertBlock(blocks, { kind: 'serie', exerciseId: ex.id, sets: 4, target: ex.kind === 'temps' ? '30 s' : '10', restSec: 90 }));
    toast(`${ex.name} ajouté ${blocks.some((b) => b.kind === 'circuit') ? 'avant le circuit' : 'à la fin'} : glisse-le à sa place`);
  };

  const renderRow = (b: ProgramBlock, i: number) => {
    if (b.kind === 'circuit') {
      return (
        <div className="row between" style={{ alignItems: 'flex-start' }}>
          <div className="grow">
            <div className="bold small">Circuit ×{b.rounds}</div>
            <div className="xs muted">{b.items.map((it) => `${exName(exMap, it.exerciseId)} ${it.target}`).join(' · ')}</div>
          </div>
          <button className="btn sm ghost icon" onClick={() => setBlocks(removeAt(blocks, i))} aria-label="Retirer le circuit"><IconTrash style={{ width: 15, height: 15 }} /></button>
        </div>
      );
    }
    const chained = linkedWithNext(blocks, i); // enchaîné avec le suivant : pas de repos
    return (
      <>
        <div className="row between" style={{ alignItems: 'flex-start' }}>
          <div className="bold small grow">{exName(exMap, b.exerciseId)}</div>
          <div className="row" style={{ gap: 4 }}>
            <button className="btn sm ghost icon" onClick={() => setPicker({ replace: i })} aria-label="Changer d'exercice"><IconEdit style={{ width: 15, height: 15 }} /></button>
            <button className="btn sm ghost icon" onClick={() => setBlocks(removeAt(blocks, i))} aria-label="Retirer"><IconTrash style={{ width: 15, height: 15 }} /></button>
          </div>
        </div>
        <div className="spec-row">
          <div className="field"><label>Séries</label><NumInput value={b.sets} onChange={(v) => setAt(i, { sets: Math.max(0, Math.round(v ?? 0)) })} /></div>
          <div className="field"><label>Objectif</label><input className="input" value={b.target} placeholder="10, 8-12, échec" onChange={(e) => setAt(i, { target: e.target.value })} /></div>
          <div className="field"><label>Repos (s)</label>{chained ? <div className="input muted small">enchaîné</div> : <NumInput value={b.restSec} onChange={(v) => setAt(i, { restSec: Math.max(0, Math.round(v ?? 0)) })} />}</div>
        </div>
      </>
    );
  };

  return (
    <>
      <Sheet open onClose={close} full title={`Modifier ${program.name}`}
        footer={leaving ? (
          <div className="row">
            <button className="btn danger grow" onClick={onClose}>Abandonner les modifications</button>
            <button className="btn ghost" onClick={() => setLeaving(false)}>Continuer</button>
          </div>
        ) : (
          <div className="row">
            <button className="btn ghost" onClick={close}>Annuler</button>
            <button className="btn lg grow" disabled={!changed || !valid} onClick={save}>Enregistrer</button>
          </div>
        )}>
        <div className="field mb12"><label>Nom</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div className="xs muted mb8">Glisse ⠿ pour changer l'ordre. « Superset avec le suivant » enchaîne deux exercices sans pause, le repos venant après le second.</div>
        <BlockOrderList blocks={blocks} onChange={setBlocks} renderRow={renderRow} keyOf={blockKey} />
        <button className="btn ghost block mt12" onClick={() => setPicker({})}><IconPlus style={{ width: 16, height: 16 }} /> Ajouter un exercice</button>
      </Sheet>
      {picker && (() => {
        const old = picker.replace !== undefined ? blocks[picker.replace] : undefined;
        const oldId = old?.kind === 'serie' ? old.exerciseId : undefined;
        return (
          <ExercisePicker exercises={exercises} allowCardio={false} title={oldId ? `Remplacer ${exName(exMap, oldId)}` : 'Ajouter un exercice'}
            initialGroup={oldId ? exMap.get(oldId)?.groups[0] : undefined} onPick={pick} onClose={() => setPicker(null)} />
        );
      })()}
    </>
  );
}
