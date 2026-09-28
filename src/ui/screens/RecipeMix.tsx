import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../data/db';
import { addEntries, deleteEntry, entryFromMix, lastMix, updateEntry } from '../../data/repos';
import { calcMacros, fmtQty, scaleMacros, sumMacros } from '../../domain/foods';
import { fromInput, inputUnit, mixHints, mixMacros, startMix, toInput } from '../../domain/recipeMix';
import type { DateKey, FoodItem, JournalEntry, Macros, Meal, Recipe } from '../../domain/types';
import { IconTrash } from '../components/Icons';
import { NumInput } from '../components/NumInput';
import { Sheet } from '../components/Sheet';
import { useToast } from '../components/Toast';
import { useDay } from '../hooks/useDay';
import { useSettings } from '../hooks/useSettings';
import { MEALS } from '../theme';

type Props = { recipe: Recipe; date: DateKey; meal: Meal; entry?: JournalEntry; onClose: () => void; onDone: () => void };

/**
 * Saisie d'une recette ingrédient par ingrédient (le shaker, par exemple) : les quantités se tapent en grammes
 * ou en centilitres, le total et le reste du jour se mettent à jour, et un coup de pouce dit quoi ajuster pour
 * tomber juste sans dépasser. Sert à l'ajout (quantités de la dernière fois) et à la modification d'une entrée.
 */
export function RecipeMixSheet(props: Props) {
  const { recipe, entry } = props;
  const foods = useLiveQuery(() => db.foods.bulkGet(recipe.items.map((i) => i.foodId)), [recipe]);
  // null : pas de composition précédente ; undefined : chargement en cours.
  const last = useLiveQuery(async () => (entry ? entry.items ?? null : (await lastMix(recipe.id)) ?? null), [recipe.id, entry?.id]);
  if (!foods || last === undefined) return null;
  return <MixEditor {...props} foods={foods} last={last ?? undefined} />;
}

const r1 = (n: number) => Math.round(n * 10) / 10;
const minus = (a: Macros, b: Macros): Macros => ({ cal: a.cal - b.cal, p: r1(a.p - b.p), g: r1(a.g - b.g), l: r1(a.l - b.l), fib: r1(a.fib - b.fib) });

function MixEditor({ recipe, date, meal: initialMeal, entry, onClose, onDone, foods, last }: Props & { foods: (FoodItem | undefined)[]; last?: { foodId: string; qty: number }[] }) {
  const [settings] = useSettings();
  const day = useDay(date, settings);
  const toast = useToast();
  const [meal, setMeal] = useState<Meal>(initialMeal);
  const [confirmDel, setConfirmDel] = useState(false);
  const [qty, setQty] = useState<Record<string, number>>(() => Object.fromEntries(startMix(recipe, last).map((m) => [m.foodId, m.qty])));

  // Un ingrédient supprimé de la base garde son apport d'origine, sans être modifiable.
  const rows = recipe.items.map((it, i) => ({ it, food: foods[i] }));
  const items = rows.flatMap((r) => (r.food ? [{ food: r.food, qty: qty[r.food.id] ?? 0 }] : []));
  const missing = rows.filter((r) => !r.food);
  const fixed = missing.length ? sumMacros(missing.map((r) => scaleMacros(r.it.macros, 1 / Math.max(1, recipe.servings)))) : undefined;
  const total = mixMacros(items, fixed);
  // Reste du jour après cette recette ; en modification, l'ancienne version de l'entrée est d'abord rendue.
  const before = entry ? minus(day.remaining, { cal: -entry.cal, p: -entry.p, g: -entry.g, l: -entry.l, fib: -entry.fib }) : day.remaining;
  const after = minus(before, total);
  const hints = mixHints(items, after);
  const scale = (f: number) => setQty(Object.fromEntries(Object.entries(qty).map(([k, v]) => [k, v * f])));

  const save = async () => {
    const e = entryFromMix(recipe, items, fixed, entry?.date ?? date, meal);
    if (entry) await updateEntry({ ...e, id: entry.id, createdAt: entry.createdAt });
    else await addEntries([e]);
    toast(entry ? 'Modifié' : `${recipe.name} ajouté`);
    onDone();
  };

  const stat = (label: string, v: number, unit: string) => (
    <div className="stat center"><div className={'v ' + (v < 0 ? 'c-red' : 'c-acc')}>{v < 0 ? '−' : ''}{fmtQty(Math.abs(Math.round(v)))}<small>{unit}</small></div><div className="l">{label}</div></div>
  );

  return (
    <Sheet open onClose={onClose} full title={recipe.name}
      footer={confirmDel && entry ? (
        <div className="row">
          <button className="btn danger grow" onClick={async () => { await deleteEntry(entry.id); toast('Supprimé'); onDone(); }}>Confirmer la suppression</button>
          <button className="btn ghost" onClick={() => setConfirmDel(false)}>Non</button>
        </div>
      ) : (
        <div className="row">
          {entry && <button className="btn ghost icon" onClick={() => setConfirmDel(true)} aria-label="Supprimer" style={{ color: 'var(--red)' }}><IconTrash style={{ width: 18, height: 18 }} /></button>}
          <button className="btn lg grow" disabled={total.cal <= 0} onClick={save}>{entry ? 'Enregistrer' : 'Ajouter'} · {total.cal} kcal</button>
        </div>
      )}>
      <div className="seg mb12">
        {MEALS.map((mm) => <button key={mm.id} className={meal === mm.id ? 'on' : ''} onClick={() => setMeal(mm.id)}>{mm.label.replace('Petit-déjeuner', 'Petit-déj')}</button>)}
      </div>
      <div className="xs muted mb4">{entry ? 'Composition enregistrée' : last ? 'Quantités de la dernière fois' : 'Quantités de la recette'}{recipe.servings > 1 ? ` · pour 1 portion sur ${recipe.servings}` : ''}</div>
      {items.map(({ food, qty: q }) => {
        const m = calcMacros(food, q);
        const unit = inputUnit(food);
        return (
          <div key={food.id} className="mix-row">
            <div className="grow" style={{ minWidth: 0 }}>
              <div className="small bold">{food.name}</div>
              <div className="xs muted">{m.cal} kcal · P {fmtQty(m.p)} · G {fmtQty(m.g)} · L {fmtQty(m.l)}</div>
            </div>
            <div className="mix-qty">
              <NumInput value={unit === 'cl' ? r1(toInput(food, q)) : Math.round(toInput(food, q))} onChange={(v) => setQty({ ...qty, [food.id]: fromInput(food, Math.max(0, v ?? 0)) })} />
              <span className="xs muted">{unit === 'pièce' ? 'pce' : unit}</span>
            </div>
          </div>
        );
      })}
      {missing.map((r) => <div key={r.it.foodId} className="mix-row xs muted">{r.it.name} : ingrédient supprimé de la base, apport d'origine gardé</div>)}
      {recipe.servings > 1 && (
        <div className="chips mt8">
          {[0.5, 1.5, 2].map((f) => <button key={f} className="chip" onClick={() => scale(f)}>× {fmtQty(f).replace('.', ',')}</button>)}
        </div>
      )}
      <div className="small mt12"><b>Total</b> : {total.cal} kcal · P {fmtQty(total.p)} g · G {fmtQty(total.g)} g · L {fmtQty(total.l)} g</div>
      <div className="sec mt12"><span>Reste du jour après</span></div>
      <div className="grid4">
        {stat('kcal', after.cal, '')}
        {stat('Protéines', after.p, 'g')}
        {stat('Glucides', after.g, 'g')}
        {stat('Lipides', after.l, 'g')}
      </div>
      {hints.length > 0 && <div className="callout info mt8 small">{hints.map((h) => <div key={h}>{h}</div>)}</div>}
    </Sheet>
  );
}
