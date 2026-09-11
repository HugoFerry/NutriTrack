const EMPTY: never[] = [];
import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../data/db';
import { deleteRecipe, newRecipe, saveRecipe } from '../../data/repos';
import { calcMacros, fmtQty, matchesQuery, qtyLabel, recipeMacros } from '../../domain/foods';
import type { FoodItem, Recipe } from '../../domain/types';
import { IconPlus, IconTrash } from '../components/Icons';
import { Sheet } from '../components/Sheet';
import { useToast } from '../components/Toast';
import { FoodList } from './AddFood';

export function RecipesSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const recipes = useLiveQuery(() => db.recipes.orderBy('name').toArray(), []) ?? EMPTY;
  const [edit, setEdit] = useState<Recipe | null>(null);
  return (
    <>
      <Sheet open={open} onClose={onClose} full title="Mes recettes">
        <button className="btn outline block mb12" onClick={() => setEdit(newRecipe(''))}><IconPlus style={{ width: 16, height: 16 }} /> Nouvelle recette</button>
        {recipes.length === 0 && <div className="empty">Une recette = plusieurs ingrédients pesés une fois, puis ajoutés en une portion. Idéal pour tes plats habituels (batch cooking, bowl, omelette…).</div>}
        <div className="list">
          {recipes.map((r) => {
            const m = recipeMacros(r).perServing;
            return (
              <button key={r.id} className="item" onClick={() => setEdit(r)}>
                <div className="grow"><div className="name">{r.name}</div><div className="meta">{r.items.length} ingrédients · {r.servings} portion{r.servings > 1 ? 's' : ''} · P{Math.round(m.p)} G{Math.round(m.g)} L{Math.round(m.l)}</div></div>
                <div className="kcal">{m.cal}<span> kcal/portion</span></div>
              </button>
            );
          })}
        </div>
      </Sheet>
      <RecipeEditor recipe={edit} onClose={() => setEdit(null)} />
    </>
  );
}

function RecipeEditor({ recipe, onClose }: { recipe: Recipe | null; onClose: () => void }) {
  const [r, setR] = useState<Recipe | null>(null);
  const [picking, setPicking] = useState(false);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<FoodItem | null>(null);
  const [qty, setQty] = useState('');
  const toast = useToast();
  const foods = useLiveQuery(() => db.foods.toArray(), []) ?? EMPTY;
  const results = useMemo(() => (q.trim() ? foods.filter((f) => matchesQuery(f.name, q)).slice(0, 40) : foods.filter((f) => f.favorite).slice(0, 40)), [foods, q]);

  if (recipe && (!r || r.id !== recipe.id)) setR(recipe);
  const close = () => { setR(null); onClose(); };
  if (!recipe || !r) return null;
  const { total, perServing } = recipeMacros(r);
  const valid = r.name.trim().length > 0 && r.items.length > 0 && r.servings > 0;

  const addItem = () => {
    if (!sel) return;
    const n = parseFloat(qty.replace(',', '.'));
    if (!(n > 0)) return;
    setR({ ...r, items: [...r.items, { foodId: sel.id, name: `${sel.name} · ${qtyLabel(sel, n)}`, qty: n, macros: calcMacros(sel, n) }] });
    setSel(null); setQty(''); setPicking(false); setQ('');
  };

  return (
    <>
      <Sheet open={!!recipe} onClose={close} full title={recipe.name ? 'Modifier la recette' : 'Nouvelle recette'}
        footer={<div className="row">
          {recipe.name && <button className="btn ghost icon" style={{ color: 'var(--red)' }} onClick={async () => { await deleteRecipe(r.id); toast('Recette supprimée'); close(); }} aria-label="Supprimer"><IconTrash style={{ width: 18, height: 18 }} /></button>}
          <button className="btn lg grow" disabled={!valid} onClick={async () => { await saveRecipe({ ...r, name: r.name.trim() }); toast('Recette enregistrée'); close(); }}>Enregistrer</button>
        </div>}>
        <div className="col">
          <div className="field"><label>Nom</label><input className="input" value={r.name} onChange={(e) => setR({ ...r, name: e.target.value })} placeholder="Ex : Bowl poulet riz" autoFocus={!recipe.name} /></div>
          <div className="field"><label>Nombre de portions</label>
            <div className="stepper"><button onClick={() => setR({ ...r, servings: Math.max(1, r.servings - 1) })}>−</button><input className="input" type="number" inputMode="decimal" value={r.servings} onChange={(e) => setR({ ...r, servings: Math.max(0.5, parseFloat(e.target.value) || 1) })} /><button onClick={() => setR({ ...r, servings: r.servings + 1 })}>+</button></div>
          </div>
          <div className="sec mt8"><span>Ingrédients</span></div>
          <div className="list">
            {r.items.map((it, i) => (
              <div key={i} className="item compact">
                <div className="grow"><div className="name ellipsis">{it.name}</div><div className="meta">P{fmtQty(it.macros.p)} G{fmtQty(it.macros.g)} L{fmtQty(it.macros.l)}</div></div>
                <div className="kcal">{it.macros.cal}<span> kcal</span></div>
                <button className="iconbtn" onClick={() => setR({ ...r, items: r.items.filter((_, j) => j !== i) })} aria-label="Retirer"><IconTrash /></button>
              </div>
            ))}
            <button className="meal-add" onClick={() => setPicking(true)}><IconPlus style={{ width: 16, height: 16 }} /> Ajouter un ingrédient</button>
          </div>
          {r.items.length > 0 && (
            <div className="card tight mt8" style={{ background: 'var(--bg2)', border: 'none' }}>
              <div className="row between small"><span>Total recette</span><b>{total.cal} kcal</b></div>
              <div className="row between small mt4"><span>Par portion ({r.servings})</span><b className="c-acc">{perServing.cal} kcal · P{fmtQty(perServing.p)} G{fmtQty(perServing.g)} L{fmtQty(perServing.l)}</b></div>
            </div>
          )}
        </div>
      </Sheet>

      <Sheet open={picking} onClose={() => { setPicking(false); setSel(null); }} full title={sel ? sel.name : 'Ingrédient'}
        footer={sel ? <button className="btn lg block" disabled={!(parseFloat(qty) > 0)} onClick={addItem}>Ajouter à la recette</button> : undefined}>
        {sel ? (
          <>
            <input className="input lg" type="number" inputMode="decimal" step="any" value={qty} onChange={(e) => setQty(e.target.value)} placeholder={sel.pcs ? `Nombre de ${sel.pcsLabel}s` : 'Quantité (g)'} autoFocus />
            <div className="chips mt12" style={{ justifyContent: 'center' }}>{(sel.quickQty ?? [50, 100, 150, 200]).map((qq) => <button key={qq} className="chip" onClick={() => setQty(String(qq))}>{qq}</button>)}</div>
            <button className="btn ghost block mt12" onClick={() => setSel(null)}>Choisir un autre aliment</button>
          </>
        ) : (
          <>
            <input className="input mb8" placeholder="Rechercher…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
            {!q && <div className="xs muted mb8">Favoris affichés par défaut.</div>}
            <FoodList items={results} onPick={(f) => { setSel(f); setQty(f.quickQty?.[0] ? String(f.quickQty[0]) : f.pcs ? '1' : '100'); }} />
          </>
        )}
      </Sheet>
    </>
  );
}
