import { addDays, dayLetter, formatLong, formatRelative, fromDateKey, todayKey, weekday } from '../../domain/dates';
import type { DateKey } from '../../domain/types';
import { IconLeft, IconRight } from './Icons';

export function DateNav({ date, onChange, status }: { date: DateKey; onChange: (d: DateKey) => void; status: Map<DateKey, 'full' | 'part'> }) {
  const today = todayKey();
  // Semaine affichée : lundi -> dimanche contenant la date.
  const wd = weekday(date);
  const monday = addDays(date, wd === 0 ? -6 : 1 - wd);
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  return (
    <div>
      <div className="datenav">
        <button className="iconbtn" onClick={() => onChange(addDays(date, -1))} aria-label="Jour précédent"><IconLeft /></button>
        <button className="lbl" onClick={() => onChange(today)}>
          {formatRelative(date, today)}
          <small>{formatLong(date)}{date !== today ? " · retour à aujourd'hui" : ''}</small>
        </button>
        <button className="iconbtn" onClick={() => onChange(addDays(date, 1))} aria-label="Jour suivant"><IconRight /></button>
      </div>
      <div className="week">
        {days.map((d) => (
          <button key={d} className={d === date ? 'on' : ''} onClick={() => onChange(d)}>
            <span>{dayLetter(d)}</span>
            <b style={d === today && d !== date ? { color: 'var(--acc)' } : undefined}>{fromDateKey(d).getDate()}</b>
            <span className={'dot ' + (status.get(d) ?? '')} />
          </button>
        ))}
      </div>
    </div>
  );
}
