const EMPTY: never[] = [];
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../data/db';
import { addEntries, entryFromFood, entryFromRecipe, lastQtyFor, newFood, recentFoods, saveFood, toggleFavorite, findByBarcode } from '../../data/repos';
import { CATEGORIES } from '../../data/seed';
import { calcMacros, fmtQty, matchesQuery, qtyLabel, qtyPlaceholder, recipeMacros, scaleMacros } from '../../domain/foods';
import type { DateKey, FoodItem, Meal, Recipe } from '../../domain/types';
import { barcodeSupported, scanBarcode } from '../../services/barcode';
import { isArtifactBuild } from '../../services/artifact';
import { fetchByBarcode, searchProducts } from '../../services/openfoodfacts';
import { IconScan, IconSearch, IconStar, IconPlus, IconEdit } from '../components/Icons';
import { Sheet } from '../components/Sheet';
import { useToast } from '../components/Toast';
import { MEALS } from '../theme';

type Tab = 'recent' | 'fav' | 'search' | 'recipes' | 'mine';

export function AddFoodSheet({ open, onClose, date, meal }: { open: boolean; onClose: () => void; date: DateKey; meal: Meal }) {
  const [tab, setTab] = useState<Tab>('recent');
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<string | null>(null);
  const [sel, setSel] = useState<FoodItem | null>(null);
  const [selRecipe, setSelRecipe] = useState<Recipe | null>(null);
  const [editFood, setEditFood] = useState<FoodItem | 'new' | null>(null);
  const [off, setOff] = useState<{ q: string; items: FoodItem[]; loading: boolean; error: string | null }>({ q: '', items: [], loading: false, error: null });
  const [canScan, setCanScan] = useState(false);
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);

  const foods = useLiveQuery(() => db.foods.toArray(), []) ?? EMPTY;
  const recipes = useLiveQuery(() => db.recipes.toArray(), []) ?? EMPTY;
  const recents = useLiveQuery(() => recentFoods(24), []) ?? EMPTY;

  useEffect(() => { barcodeSupported().then(setCanScan); }, []);
  useEffect(() => {
    if (!open) { setQ(''); setCat(null); setSel(null); setSelRecipe(null); setOff({ q: '', items: [], loading: false, error: null }); return; }
    setTab(recents.length ? 'recent' : 'search');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  useEffect(() => { if (tab === 'search') setTimeout(() => inputRef.current?.focus(), 50); }, [tab]);

  const local = useMemo(() => {
    if (q.trim()) return foods.filter((f) => matchesQuery(f.name + ' ' + (f.brand ?? ''), q)).slice(0, 60);
    if (cat) return foods.filter((f) => f.category === cat);
    return [];
  }, [foods, q, cat]);

  const searchOff = async () => {
    if (!q.trim()) return;
    setOff({ q, items: [], loading: true, error: null });
    try {
      const items = await searchProducts(q.trim());
      const known = new Set(foods.map((f) => f.barcode).filter(Boolean));
      setOff({ q, items: items.filter((i) => !known.has(i.barcode)), loading: false, error: null });
    } catch (e) {
      setOff({ q, items: [], loading: false, error: e instanceof Error ? e.message : 'Erreur réseau' });
    }
  };

  const onScan = async () => {
    try {
      const code = await scanBarcode();
      if (!code) return;
      const known = await findByBarcode(code);
      if (known) { setSel(known); return; }
      toast('Recherche du produit…');
      const f = await fetchByBarcode(code);
      if (!f) { toast('Produit inconnu sur Open Food Facts', 'err'); setEditFood('new'); return; }
      setSel(f);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Scan impossible', 'err');
    }
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: 'recent', label: 'Récents' },
    { id: 'fav', label: 'Favoris' },
    { id: 'search', label: 'Recherche' },
    { id: 'recipes', label: 'Recettes' },
    { id: 'mine', label: 'Perso' },
  ];
  const favs = foods.filter((f) => f.favorite);
  const mine = foods.filter((f) => f.source === 'custom' || f.source === 'ai' || f.source === 'off');
  const mealLabel = MEALS.find((m) => m.id === meal)?.label ?? '';

  return (
    <>
      <Sheet open={open} onClose={onClose} full title={<span>Ajouter <span className="muted small">· {mealLabel}</span></span>}
        right={canScan ? <button className="iconbtn" onClick={onScan} aria-label="Scanner un code-barres"><IconScan /></button> : undefined}>
        <div className="seg mb12">
          {tabs.map((t) => <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>{t.label}</button>)}
        </div>

        {tab === 'search' && (
          <>
            <div className="row mb8">
              <div className="row grow" style={{ background: 'var(--bg2)', borderRadius: 10, padding: '0 10px', border: '1px solid var(--brd)' }}>
                <IconSearch style={{ width: 18, height: 18, color: 'var(--tx2)' }} />
                <input ref={inputRef} className="input bare grow" placeholder="Poulet, riz, yaourt…" value={q} onChange={(e) => { setQ(e.target.value); setCat(null); }} onKeyDown={(e) => e.key === 'Enter' && local.length === 0 && searchOff()} />
              </div>
              {canScan && <button className="btn ghost icon" onClick={onScan} aria-label="Scanner"><IconScan style={{ width: 18, height: 18 }} /></button>}
            </div>
            {!q && (
              <div className="chips scroll mb8">
                {CATEGORIES.map((c) => <button key={c} className={'chip' + (cat === c ? ' on' : '')} onClick={() => setCat(cat === c ? null : c)}>{c}</button>)}
              </div>
            )}
            <FoodList items={local} onPick={setSel} onFav={(f) => toggleFavorite(f.id)} />
            {q.trim() && !isArtifactBuild() && (
              <div className="mt12">
                <div className="sec"><span>Open Food Facts</span></div>
                {off.q !== q || (!off.loading && !off.items.length && !off.error) ? (
                  <button className="btn ghost block" onClick={searchOff}>Chercher « {q.trim()} » sur Open Food Facts</button>
                ) : off.loading ? (
                  <div className="empty">Recherche…</div>
                ) : off.error ? (
                  <div className="empty c-red">{off.error}</div>
                ) : (
                  <FoodList items={off.items} onPick={setSel} />
                )}
              </div>
            )}
            {q.trim() && isArtifactBuild() && local.length === 0 && <div className="xs muted mt8">La recherche en ligne (Open Food Facts) et le scan ne sont disponibles que dans l'application Android. Décris l'aliment au Chat IA ou crée-le ici.</div>}
            {q.trim() && local.length === 0 && (
              <button className="btn outline block mt12" onClick={() => setEditFood('new')}><IconPlus style={{ width: 16, height: 16 }} /> Créer « {q.trim()} » en aliment perso</button>
            )}
            {!q && !cat && <div className="empty">Tape un nom, choisis une catégorie{canScan ? ' ou scanne un code-barres' : ''}.</div>}
          </>
        )}

        {tab === 'recent' && (recents.length ? <FoodList items={recents} onPick={setSel} onFav={(f) => toggleFavorite(f.id)} /> : <div className="empty">Tes derniers aliments apparaîtront ici.</div>)}
        {tab === 'fav' && (favs.length ? <FoodList items={favs} onPick={setSel} onFav={(f) => toggleFavorite(f.id)} /> : <div className="empty">Appuie sur l'étoile d'un aliment pour l'ajouter ici.</div>)}
        {tab === 'recipes' && (
          recipes.length ? (
            <div className="list">
              {recipes.map((r) => {
                const m = recipeMacros(r).perServing;
                return (
                  <button key={r.id} className="item" onClick={() => setSelRecipe(r)}>
                    <div className="grow">
                      <div className="name">{r.name}</div>
                      <div className="meta">{r.items.length} ingrédients · {r.servings} portion{r.servings > 1 ? 's' : ''} · <span className="c-prot">P{Math.round(m.p)}</span> <span className="c-carb">G{Math.round(m.g)}</span> <span className="c-fat">L{Math.round(m.l)}</span></div>
                    </div>
                    <div className="kcal">{m.cal}<span> kcal/portion</span></div>
                  </button>
                );
              })}
            </div>
          ) : <div className="empty">Crée des recettes dans Profil › Mes recettes.</div>
        )}
        {tab === 'mine' && (
          <>
            <button className="btn outline block mb12" onClick={() => setEditFood('new')}><IconPlus style={{ width: 16, height: 16 }} /> Nouvel aliment perso</button>
            {mine.length ? <FoodList items={mine} onPick={setSel} onFav={(f) => toggleFavorite(f.id)} onEdit={setEditFood} /> : <div className="empty">Aucun aliment perso pour l'instant. Les produits scannés arrivent aussi ici.</div>}
          </>
        )}
      </Sheet>

      <QtySheet food={sel} date={date} meal={meal} onClose={() => setSel(null)} onAdded={() => { setSel(null); onClose(); }} />
      <RecipeQtySheet recipe={selRecipe} date={date} meal={meal} onClose={() => setSelRecipe(null)} onAdded={() => { setSelRecipe(null); onClose(); }} />
      <FoodForm food={editFood === 'new' ? null : editFood} open={editFood !== null} initialName={editFood === 'new' ? q.trim() : ''} onClose={() => setEditFood(null)} onSaved={(f) => { setEditFood(null); setSel(f); }} />
    </>
  );
}

export function FoodList({ items, onPick, onFav, onEdit }: { items: FoodItem[]; onPick: (f: FoodItem) => void; onFav?: (f: FoodItem) => void; onEdit?: (f: FoodItem) => void }) {
  if (!items.length) return null;
  return (
    <div className="list">
      {items.map((f) => {
        const per = f.pcs ? calcMacros(f, 1) : { cal: f.cal, p: f.p, g: f.g, l: f.l };
        return (
          <div key={f.id} className="item compact">
            <button className="grow" style={{ textAlign: 'left', color: 'inherit' }} onClick={() => onPick(f)}>
              <div className="name ellipsis">{f.name}{f.brand && <span className="muted"> · {f.brand}</span>}</div>
              <div className="meta">
                {f.pcs ? `1 ${f.pcsLabel} (${f.pcs}g)` : f.dry ? '100g sec' : `100${f.unit === 'ml' ? 'ml' : 'g'}`} · <span className="c-prot">P{fmtQty(per.p)}</span> <span className="c-carb">G{fmtQty(per.g)}</span> <span className="c-fat">L{fmtQty(per.l)}</span>
                {f.source === 'off' && <span className="badge blue" style={{ marginLeft: 6 }}>OFF</span>}
                {f.source === 'custom' && <span className="badge org" style={{ marginLeft: 6 }}>Perso</span>}
              </div>
            </button>
            <button className="grow-0" onClick={() => onPick(f)} style={{ color: 'inherit' }}><div className="kcal">{Math.round(per.cal)}<span> kcal</span></div></button>
            {onEdit && (f.source === 'custom' || f.source === 'off' || f.source === 'ai') && <button className="iconbtn" onClick={() => onEdit(f)} aria-label="Modifier"><IconEdit /></button>}
            {onFav && <button className="iconbtn" onClick={() => onFav(f)} aria-label="Favori" style={{ color: f.favorite ? 'var(--amb)' : 'var(--tx2)' }}><IconStar fill={f.favorite ? 'currentColor' : 'none'} /></button>}
          </div>
        );
      })}
    </div>
  );
}

export function QtySheet({ food, date, meal: initialMeal, onClose, onAdded }: { food: FoodItem | null; date: DateKey; meal: Meal; onClose: () => void; onAdded: () => void }) {
  const [qty, setQty] = useState('');
  const [meal, setMeal] = useState<Meal>(initialMeal);
  const toast = useToast();
  useEffect(() => {
    setMeal(initialMeal);
    if (!food) return;
    // Valeur par défaut immédiate ; la dernière quantité utilisée ne remplace que si l'utilisateur n'a rien tapé.
    const def = food.quickQty?.[0] ? String(food.quickQty[0]) : food.pcs ? '1' : '100';
    setQty(def);
    let alive = true;
    lastQtyFor(food.id).then((q) => { if (alive && q) setQty((prev) => (prev === def ? String(q) : prev)); });
    return () => { alive = false; };
  }, [food, initialMeal]);
  if (!food) return null;
  const n = parseFloat(qty.replace(',', '.'));
  const valid = Number.isFinite(n) && n > 0;
  const m = valid ? calcMacros(food, n) : null;
  const quick = food.quickQty ?? (food.pcs ? [0.5, 1, 2, 3] : [50, 100, 150, 200]);

  const add = async () => {
    if (!valid) return;
    if (food.source === 'off' && !(await db.foods.get(food.id))) await saveFood(food);
    await addEntries([entryFromFood(food, n, date, meal)]);
    toast(`${food.name} ajouté`);
    onAdded();
  };

  return (
    <Sheet open={!!food} onClose={onClose} title={food.name}
      footer={<button className="btn lg block" disabled={!valid} onClick={add}>Ajouter{m ? ` · ${m.cal} kcal` : ''}</button>}>
      {food.note && <div className="note mb8">{food.note}</div>}
      <div className="seg mb12">
        {MEALS.map((mm) => <button key={mm.id} className={meal === mm.id ? 'on' : ''} onClick={() => setMeal(mm.id)}>{mm.label.replace('Petit-déjeuner', 'Petit-déj')}</button>)}
      </div>
      <input className="input lg" type="number" inputMode="decimal" step="any" placeholder={qtyPlaceholder(food)} value={qty} onChange={(e) => setQty(e.target.value)} onFocus={(e) => e.target.select()} autoFocus />
      <div className="center xs muted mt4">{qtyPlaceholder(food)}{valid ? ` · ${qtyLabel(food, n)}` : ''}</div>
      <div className="chips mt12" style={{ justifyContent: 'center' }}>
        {quick.map((qq) => <button key={qq} className={'chip' + (n === qq ? ' on' : '')} onClick={() => setQty(String(qq))}>{fmtQty(qq)}{food.pcs ? '' : food.unit === 'ml' ? ' ml' : ' g'}</button>)}
      </div>
      {m && (
        <div className="grid3 mt16">
          {[['Protéines', m.p, 'c-prot'], ['Glucides', m.g, 'c-carb'], ['Lipides', m.l, 'c-fat']].map(([l, v, c]) => (
            <div key={String(l)} className="stat center"><div className={'v ' + c}>{fmtQty(Number(v))}<small>g</small></div><div className="l">{l}</div></div>
          ))}
        </div>
      )}
      {m && m.fib > 0 && <div className="center small muted mt8">Fibres : {fmtQty(m.fib)} g</div>}
    </Sheet>
  );
}

function RecipeQtySheet({ recipe, date, meal: initialMeal, onClose, onAdded }: { recipe: Recipe | null; date: DateKey; meal: Meal; onClose: () => void; onAdded: () => void }) {
  const [serv, setServ] = useState('1');
  const [meal, setMeal] = useState<Meal>(initialMeal);
  const toast = useToast();
  useEffect(() => { setServ('1'); setMeal(initialMeal); }, [recipe, initialMeal]);
  if (!recipe) return null;
  const n = parseFloat(serv.replace(',', '.'));
  const valid = Number.isFinite(n) && n > 0;
  const m = valid ? scaleMacros(recipeMacros(recipe).perServing, n) : null;
  return (
    <Sheet open={!!recipe} onClose={onClose} title={recipe.name}
      footer={<button className="btn lg block" disabled={!valid} onClick={async () => { await addEntries([entryFromRecipe(recipe, n, date, meal)]); toast(`${recipe.name} ajouté`); onAdded(); }}>Ajouter{m ? ` · ${m.cal} kcal` : ''}</button>}>
      <div className="seg mb12">
        {MEALS.map((mm) => <button key={mm.id} className={meal === mm.id ? 'on' : ''} onClick={() => setMeal(mm.id)}>{mm.label.replace('Petit-déjeuner', 'Petit-déj')}</button>)}
      </div>
      <input className="input lg" type="number" inputMode="decimal" step="any" value={serv} onChange={(e) => setServ(e.target.value)} onFocus={(e) => e.target.select()} autoFocus />
      <div className="center xs muted mt4">Nombre de portions (recette = {recipe.servings})</div>
      <div className="chips mt12" style={{ justifyContent: 'center' }}>
        {[0.5, 1, 1.5, 2].map((qq) => <button key={qq} className={'chip' + (n === qq ? ' on' : '')} onClick={() => setServ(String(qq))}>{qq}</button>)}
      </div>
      {m && (
        <div className="grid3 mt16">
          {[['Protéines', m.p, 'c-prot'], ['Glucides', m.g, 'c-carb'], ['Lipides', m.l, 'c-fat']].map(([l, v, c]) => (
            <div key={String(l)} className="stat center"><div className={'v ' + c}>{fmtQty(Number(v))}<small>g</small></div><div className="l">{l}</div></div>
          ))}
        </div>
      )}
    </Sheet>
  );
}

/** Création / édition d'un aliment perso (valeurs pour 100 g ou par pièce). */
export function FoodForm({ food, open, initialName, onClose, onSaved }: { food: FoodItem | null; open: boolean; initialName?: string; onClose: () => void; onSaved: (f: FoodItem) => void }) {
  const [f, setF] = useState<Record<string, string>>({});
  const [mode, setMode] = useState<'100' | 'pcs'>('100');
  const toast = useToast();
  useEffect(() => {
    if (!open) return;
    if (food) {
      setMode(food.pcs ? 'pcs' : '100');
      setF({ name: food.name, brand: food.brand ?? '', cal: String(food.cal), p: String(food.p), g: String(food.g), l: String(food.l), fib: String(food.fib), pcs: String(food.pcs ?? ''), pcsLabel: food.pcsLabel ?? '', unit: food.unit, barcode: food.barcode ?? '', note: food.note ?? '' });
    } else {
      setMode('100');
      setF({ name: initialName ?? '', brand: '', cal: '', p: '', g: '', l: '', fib: '', pcs: '', pcsLabel: '', unit: 'g', barcode: '', note: '' });
    }
  }, [open, food, initialName]);
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((p) => ({ ...p, [k]: e.target.value }));
  const num = (k: string) => parseFloat((f[k] ?? '').replace(',', '.')) || 0;
  const valid = (f.name ?? '').trim().length > 0 && (num('cal') > 0 || num('p') > 0 || num('g') > 0 || num('l') > 0) && (mode === '100' || num('pcs') > 0);

  const save = async () => {
    const pcs = mode === 'pcs' ? num('pcs') : undefined;
    // En mode "par pièce", l'utilisateur saisit les valeurs de la pièce : on ramène à 100 g.
    const k = pcs ? 100 / pcs : 1;
    const base = food ?? newFood({ name: f.name, cal: 0, p: 0, g: 0, l: 0 });
    const item: FoodItem = {
      ...base,
      name: f.name.trim(),
      brand: f.brand?.trim() || undefined,
      cal: Math.round(num('cal') * k),
      p: Math.round(num('p') * k * 10) / 10,
      g: Math.round(num('g') * k * 10) / 10,
      l: Math.round(num('l') * k * 10) / 10,
      fib: Math.round(num('fib') * k * 10) / 10,
      unit: pcs ? 'pcs' : (f.unit as 'g' | 'ml') || 'g',
      pcs,
      pcsLabel: pcs ? f.pcsLabel?.trim() || 'pièce' : undefined,
      barcode: f.barcode?.trim() || undefined,
      note: f.note?.trim() || undefined,
      source: base.source === 'seed' ? 'custom' : base.source,
      category: base.source === 'seed' ? 'Perso' : base.category,
      dry: undefined,
      dryNote: undefined,
      quickQty: pcs ? [1, 2] : base.quickQty,
    };
    await saveFood(item);
    toast('Aliment enregistré');
    onSaved(item);
  };

  const per = mode === 'pcs' ? `1 ${f.pcsLabel || 'pièce'}` : `100 ${f.unit === 'ml' ? 'ml' : 'g'}`;
  return (
    <Sheet open={open} onClose={onClose} full title={food ? "Modifier l'aliment" : 'Nouvel aliment'} footer={<button className="btn lg block" disabled={!valid} onClick={save}>Enregistrer</button>}>
      <div className="col">
        <div className="field"><label>Nom</label><input className="input" value={f.name ?? ''} onChange={set('name')} placeholder="Ex : Pain protéiné Lidl" /></div>
        <div className="field"><label>Marque (optionnel)</label><input className="input" value={f.brand ?? ''} onChange={set('brand')} /></div>
        <div className="seg">
          <button className={mode === '100' ? 'on' : ''} onClick={() => setMode('100')}>Valeurs pour 100 g / ml</button>
          <button className={mode === 'pcs' ? 'on' : ''} onClick={() => setMode('pcs')}>Valeurs par pièce</button>
        </div>
        {mode === '100' ? (
          <div className="field"><label>Unité</label>
            <select className="input" value={f.unit ?? 'g'} onChange={set('unit')}><option value="g">Grammes</option><option value="ml">Millilitres</option></select>
          </div>
        ) : (
          <div className="grid2">
            <div className="field"><label>Poids d'une pièce (g)</label><input className="input" type="number" inputMode="decimal" value={f.pcs ?? ''} onChange={set('pcs')} placeholder="60" /></div>
            <div className="field"><label>Nom de la pièce</label><input className="input" value={f.pcsLabel ?? ''} onChange={set('pcsLabel')} placeholder="tranche, barre, oeuf…" /></div>
          </div>
        )}
        <div className="sec mt8"><span>Nutrition pour {per}</span></div>
        <div className="grid2">
          <div className="field"><label>Calories (kcal)</label><input className="input" type="number" inputMode="decimal" value={f.cal ?? ''} onChange={set('cal')} /></div>
          <div className="field"><label>Protéines (g)</label><input className="input" type="number" inputMode="decimal" value={f.p ?? ''} onChange={set('p')} /></div>
          <div className="field"><label>Glucides (g)</label><input className="input" type="number" inputMode="decimal" value={f.g ?? ''} onChange={set('g')} /></div>
          <div className="field"><label>Lipides (g)</label><input className="input" type="number" inputMode="decimal" value={f.l ?? ''} onChange={set('l')} /></div>
          <div className="field"><label>Fibres (g)</label><input className="input" type="number" inputMode="decimal" value={f.fib ?? ''} onChange={set('fib')} /></div>
          <div className="field"><label>Code-barres</label><input className="input" inputMode="numeric" value={f.barcode ?? ''} onChange={set('barcode')} /></div>
        </div>
        <div className="field"><label>Note</label><input className="input" value={f.note ?? ''} onChange={set('note')} placeholder="1 tranche = 35 g…" /></div>
      </div>
    </Sheet>
  );
}
