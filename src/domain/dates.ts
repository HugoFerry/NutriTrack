import type { DateKey } from './types';

const pad = (n: number) => String(n).padStart(2, '0');

/** Clé de date LOCALE (évite le décalage UTC de toISOString). */
export function toDateKey(d: Date): DateKey {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayKey(): DateKey {
  return toDateKey(new Date());
}

export function fromDateKey(key: DateKey): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(key: DateKey, n: number): DateKey {
  const d = fromDateKey(key);
  d.setDate(d.getDate() + n);
  return toDateKey(d);
}

export function daysBetween(a: DateKey, b: DateKey): number {
  const ms = fromDateKey(b).getTime() - fromDateKey(a).getTime();
  return Math.round(ms / 86_400_000);
}

/** 0 = dimanche ... 6 = samedi */
export function weekday(key: DateKey): number {
  return fromDateKey(key).getDay();
}

export function rangeKeys(from: DateKey, to: DateKey): DateKey[] {
  const out: DateKey[] = [];
  let k = from;
  while (k <= to) {
    out.push(k);
    k = addDays(k, 1);
  }
  return out;
}

const FR_DAYS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
const FR_DAYS_LONG = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
const FR_MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

export function formatShort(key: DateKey): string {
  const d = fromDateKey(key);
  return `${FR_DAYS[d.getDay()]} ${d.getDate()} ${FR_MONTHS[d.getMonth()]}`;
}

export function formatLong(key: DateKey): string {
  const d = fromDateKey(key);
  return `${FR_DAYS_LONG[d.getDay()]} ${d.getDate()} ${FR_MONTHS[d.getMonth()]}`;
}

export function formatRelative(key: DateKey, today: DateKey = todayKey()): string {
  const diff = daysBetween(today, key);
  if (diff === 0) return "Aujourd'hui";
  if (diff === -1) return 'Hier';
  if (diff === 1) return 'Demain';
  return formatShort(key);
}

export function dayLetter(key: DateKey): string {
  return FR_DAYS[weekday(key)].slice(0, 1);
}
