import { useState } from 'react';

export interface BarPoint { label: string; value: number; target: number; empty?: boolean }

/** Barres journalières vs cible (ligne). */
export function BarsChart({ points, height = 150 }: { points: BarPoint[]; height?: number }) {
  const W = 360;
  const H = height;
  const pad = { l: 34, r: 8, t: 10, b: 20 };
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(...points.map((p) => Math.max(p.value, p.target)), 1) * 1.1;
  const yOf = (v: number) => pad.t + (1 - v / max) * (H - pad.t - pad.b);
  const slot = (W - pad.l - pad.r) / Math.max(points.length, 1);
  const bw = Math.min(slot * 0.62, 34);
  const ticks = [0, 0.5, 1].map((f) => Math.round((max / 1.1) * f));
  const h = hover !== null ? points[hover] : null;
  return (
    <div style={{ position: 'relative' }}>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} onMouseLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={yOf(t)} y2={yOf(t)} stroke="var(--brd)" />
            <text x={pad.l - 6} y={yOf(t) + 3} textAnchor="end">{t}</text>
          </g>
        ))}
        {points.map((p, i) => {
          const x = pad.l + slot * i + (slot - bw) / 2;
          const over = p.target > 0 && p.value > p.target * 1.1;
          const y = yOf(p.value);
          return (
            <g key={i} onMouseEnter={() => setHover(i)} onTouchStart={() => setHover(i)}>
              <rect x={pad.l + slot * i} y={pad.t} width={slot} height={H - pad.t - pad.b} fill="transparent" />
              {p.value > 0 && <rect x={x} y={y} width={bw} height={Math.max(H - pad.b - y, 2)} rx="4" fill={over ? 'var(--red)' : 'var(--acc)'} opacity={hover === i ? 1 : 0.85} />}
              {p.target > 0 && <line x1={pad.l + slot * i + 3} x2={pad.l + slot * (i + 1) - 3} y1={yOf(p.target)} y2={yOf(p.target)} stroke="var(--tx1)" strokeWidth="1.5" strokeDasharray="3 2" />}
              <text x={pad.l + slot * i + slot / 2} y={H - 5} textAnchor="middle">{p.label}</text>
            </g>
          );
        })}
      </svg>
      {h && (
        <div className="tip" style={{ left: ((pad.l + slot * hover! + slot / 2) / W) * 100 + '%', top: 0 }}>
          <div className="bold">{h.label}</div>
          <div>{h.empty ? 'Rien noté' : `${h.value} kcal`} · cible {h.target}</div>
        </div>
      )}
      <div className="legend"><span><i style={{ background: 'var(--acc)' }} />Apport</span><span><i style={{ background: 'var(--tx1)' }} />Cible du jour</span><span><i style={{ background: 'var(--red)' }} />Dépassement &gt; 10 %</span></div>
    </div>
  );
}
