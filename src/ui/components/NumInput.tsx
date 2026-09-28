import { useState } from 'react';

const num = (v: string) => {
  const n = parseFloat(v.replace(',', '.'));
  return Number.isFinite(n) ? n : undefined;
};

const show = (v?: number) => (v === undefined ? '' : String(v));

/**
 * Champ numérique qui garde la saisie en cours (« 22, » ne devient pas « 22 »). Si la valeur change ailleurs
 * (repos fusionné par un superset, quantités doublées…), le champ la reprend, sauf pendant qu'on tape ;
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
