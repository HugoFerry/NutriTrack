export function MacroBar({ label, value, max, color, unit = 'g' }: { label: string; value: number; max: number; color: string; unit?: string }) {
  const over = max > 0 && value > max;
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="macro">
      <div className="lbl">
        <span>{label}</span>
        <span>
          <b style={{ color: over ? 'var(--red)' : undefined }}>{Math.round(value)}</b>/{max}{unit}
        </span>
      </div>
      <div className="bar">
        <div style={{ width: pct + '%', background: over ? 'var(--red)' : color }} />
      </div>
    </div>
  );
}
