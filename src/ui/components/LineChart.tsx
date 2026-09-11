import { useMemo, useRef, useState } from 'react';

export interface LinePoint {
  x: number;
  label: string;
  values: (number | null)[];
}

export interface LineSeries {
  name: string;
  color: string;
  kind: 'line' | 'dots';
  unit?: string;
}

/** Courbe SVG responsive avec survol / toucher. Une seule échelle Y. */
export function LineChart({ points, series, height = 180, yFormat = (v) => String(v), goal }: { points: LinePoint[]; series: LineSeries[]; height?: number; yFormat?: (v: number) => string; goal?: { value: number; label: string } }) {
  const W = 360;
  const H = height;
  const pad = { l: 34, r: 10, t: 12, b: 22 };
  const [hover, setHover] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const { xs, ys, yMin, yMax, paths } = useMemo(() => {
    const all = points.flatMap((p) => p.values.filter((v): v is number => v !== null));
    if (goal) all.push(goal.value);
    let lo = Math.min(...all);
    let hi = Math.max(...all);
    if (!Number.isFinite(lo)) { lo = 0; hi = 1; }
    const span = Math.max(hi - lo, 1);
    lo -= span * 0.15;
    hi += span * 0.15;
    const xMin = points[0]?.x ?? 0;
    const xMax = points[points.length - 1]?.x ?? 1;
    const xs = points.map((p) => pad.l + ((p.x - xMin) / Math.max(xMax - xMin, 1)) * (W - pad.l - pad.r));
    const ys = points.map((p) => p.values.map((v) => (v === null ? null : pad.t + (1 - (v - lo) / (hi - lo)) * (H - pad.t - pad.b))));
    const paths = series.map((_, si) => {
      let d = '';
      let pen = false;
      points.forEach((_, i) => {
        const y = ys[i][si];
        if (y === null) { pen = false; return; }
        d += (pen ? ' L' : ' M') + xs[i].toFixed(1) + ' ' + y.toFixed(1);
        pen = true;
      });
      return d;
    });
    return { xs, ys, yMin: lo, yMax: hi, paths };
  }, [points, series, goal, H]);

  const ticks = useMemo(() => {
    const n = 4;
    return Array.from({ length: n + 1 }, (_, i) => yMin + ((yMax - yMin) * i) / n);
  }, [yMin, yMax]);

  const yOf = (v: number) => pad.t + (1 - (v - yMin) / (yMax - yMin)) * (H - pad.t - pad.b);

  const onMove = (clientX: number) => {
    const svg = svgRef.current;
    if (!svg || !points.length) return;
    const rect = svg.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * W;
    let best = 0;
    xs.forEach((px, i) => { if (Math.abs(px - x) < Math.abs(xs[best] - x)) best = i; });
    setHover(best);
  };

  const labelEvery = Math.max(1, Math.ceil(points.length / 5));
  const h = hover !== null ? points[hover] : null;

  return (
    <div style={{ position: 'relative' }}>
      <svg
        ref={svgRef}
        className="chart"
        viewBox={`0 0 ${W} ${H}`}
        onMouseMove={(e) => onMove(e.clientX)}
        onMouseLeave={() => setHover(null)}
        onTouchStart={(e) => onMove(e.touches[0].clientX)}
        onTouchMove={(e) => onMove(e.touches[0].clientX)}
        onTouchEnd={() => setTimeout(() => setHover(null), 1500)}
      >
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={pad.l} x2={W - pad.r} y1={yOf(t)} y2={yOf(t)} stroke="var(--brd)" strokeWidth="1" />
            <text x={pad.l - 6} y={yOf(t) + 3} textAnchor="end">{yFormat(t)}</text>
          </g>
        ))}
        {goal && (
          <g>
            <line x1={pad.l} x2={W - pad.r} y1={yOf(goal.value)} y2={yOf(goal.value)} stroke="var(--tx2)" strokeWidth="1" strokeDasharray="4 3" />
            <text x={W - pad.r} y={yOf(goal.value) - 4} textAnchor="end">{goal.label}</text>
          </g>
        )}
        {points.map((p, i) => (i % labelEvery === 0 || i === points.length - 1) && (
          <text key={i} x={xs[i]} y={H - 6} textAnchor={i === points.length - 1 ? 'end' : i === 0 ? 'start' : 'middle'}>{p.label}</text>
        ))}
        {series.map((s, si) => s.kind === 'line' ? (
          <path key={s.name} d={paths[si]} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        ) : (
          <g key={s.name}>
            {points.map((_, i) => ys[i][si] !== null && <circle key={i} cx={xs[i]} cy={ys[i][si]!} r={3} fill={s.color} opacity={0.9} />)}
          </g>
        ))}
        {h && (
          <g>
            <line x1={xs[hover!]} x2={xs[hover!]} y1={pad.t} y2={H - pad.b} stroke="var(--tx1)" strokeWidth="1" />
            {series.map((s, si) => ys[hover!][si] !== null && <circle key={s.name} cx={xs[hover!]} cy={ys[hover!][si]!} r={4.5} fill={s.color} stroke="var(--bg1)" strokeWidth="2" />)}
          </g>
        )}
      </svg>
      {h && (
        <div className="tip" style={{ left: (xs[hover!] / W) * 100 + '%', top: 0 }}>
          <div className="bold">{h.label}</div>
          {series.map((s, si) => h.values[si] !== null && (
            <div key={s.name}><span style={{ color: s.color }}>●</span> {s.name} : {yFormat(h.values[si]!)}{s.unit ?? ''}</div>
          ))}
        </div>
      )}
      <div className="legend">
        {series.map((s) => <span key={s.name}><i className={s.kind === 'dots' ? 'dot' : ''} style={{ background: s.color }} />{s.name}</span>)}
        {goal && <span><i style={{ background: 'var(--tx2)' }} />{goal.label}</span>}
      </div>
    </div>
  );
}
