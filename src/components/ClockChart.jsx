// Time spent on each of my moves, synced to the review: click a bar to jump there.
import { useEffect, useRef, useState } from 'preact/hooks';
import { fmtSecs } from '../lib/clock.js';

export function ClockChart({ report, current, onSelect }) {
  const ref = useRef(null);
  const [w, setW] = useState(420);
  useEffect(() => {
    if (!ref.current || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(([e]) => setW(Math.max(240, Math.round(e.contentRect.width))));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  const H = 120;
  const pad = { l: 34, r: 6, t: 8, b: 18 };
  const ms = report.moves;
  const max = Math.max(10, ...ms.map((m) => m.spent));
  const step = (w - pad.l - pad.r) / ms.length;
  const y = (v) => pad.t + (1 - v / max) * (H - pad.t - pad.b);
  const sinkSet = new Set(report.sinks.map((m) => m.ply));
  const color = (m) => (m.cls === 'blunder' || m.cls === 'mistake' ? 'var(--coral)' : sinkSet.has(m.ply) ? 'var(--amber)' : 'var(--turq-dim)');
  return (
    <div ref={ref} class="chart">
      <svg width={w} height={H} viewBox={`0 0 ${w} ${H}`} role="img" aria-label="Seconds spent on each of your moves">
        {[0, Math.round(max / 2), Math.round(max)].map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={w - pad.r} y1={y(t)} y2={y(t)} stroke="var(--line)" stroke-dasharray={t ? '3 4' : ''} />
            <text x={pad.l - 5} y={y(t) + 4} text-anchor="end" font-size="10.5" fill="var(--ink-3)">{fmtSecs(t)}</text>
          </g>
        ))}
        <line x1={pad.l} x2={w - pad.r} y1={y(report.avg)} y2={y(report.avg)} stroke="var(--ink-2)" stroke-width="1" stroke-dasharray="5 4" />
        {ms.map((m, i) => {
          const x = pad.l + i * step;
          const on = current === m.ply + 1;
          return (
            <g key={m.ply} style={{ cursor: 'pointer' }} onClick={() => onSelect(m.ply + 1)}>
              <rect x={x} y={pad.t} width={step} height={H - pad.t - pad.b} fill={on ? 'rgba(255,255,255,0.06)' : 'transparent'} />
              <rect x={x + step * 0.15} y={y(m.spent)} width={Math.max(1.5, step * 0.7)} height={Math.max(1, y(0) - y(m.spent))} rx="1.5" fill={color(m)} />
              <title>{`Move ${Math.floor(m.ply / 2) + 1}: ${fmtSecs(m.spent)} (${fmtSecs(m.left)} left)${m.cls && m.cls !== 'best' && m.cls !== 'good' ? ` — ${m.cls}` : ''}`}</title>
            </g>
          );
        })}
        <text x={pad.l} y={H - 3} font-size="10.5" fill="var(--ink-3)">move 1</text>
        <text x={w - pad.r} y={H - 3} text-anchor="end" font-size="10.5" fill="var(--ink-3)">move {Math.floor(ms[ms.length - 1].ply / 2) + 1}</text>
      </svg>
      <div class="legend" style={{ marginTop: '4px' }}>
        <span><i style={{ background: 'var(--turq-dim)' }} />Time per move</span>
        <span><i style={{ background: 'var(--amber)' }} />Long think on a routine move</span>
        <span><i style={{ background: 'var(--coral)' }} />Mistake or blunder</span>
        <span><i style={{ background: 'var(--ink-2)', height: '2px' }} />Your average</span>
      </div>
    </div>
  );
}
