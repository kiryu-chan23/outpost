// Evaluation graph: White's expected score after every move, synced with the
// board and move list. One series, so no legend box for the line itself; the
// small legend only explains the mistake markers (shape + label, not colour alone).
import { useRef, useState } from 'preact/hooks';
import { whiteWin } from '../lib/analysis.js';
import { formatScore } from '../lib/uci.js';

const W = 640;
const H = 112;
const PAD = { l: 6, r: 6, t: 8, b: 8 };

export function EvalGraph({ evals, moves, plies, current, onSelect, userColor }) {
  const svg = useRef(null);
  const [hover, setHover] = useState(null);
  const n = evals.length;
  if (n < 2) return null;
  const x = (i) => PAD.l + (i / (n - 1)) * (W - PAD.l - PAD.r);
  const y = (w) => PAD.t + ((100 - w) / 100) * (H - PAD.t - PAD.b);
  const pts = evals.map((e, i) => [x(i), y(whiteWin(e))]);
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  const area = `${path} L${x(n - 1).toFixed(1)} ${H - PAD.b} L${x(0).toFixed(1)} ${H - PAD.b} Z`;

  const indexAt = (clientX) => {
    const r = svg.current.getBoundingClientRect();
    const rel = ((clientX - r.left) / r.width) * W;
    return Math.max(0, Math.min(n - 1, Math.round(((rel - PAD.l) / (W - PAD.l - PAD.r)) * (n - 1))));
  };
  const label = (i) => {
    if (i === 0) return 'Start';
    const p = plies[i - 1];
    return `${Math.floor((i - 1) / 2) + 1}${p.color === 'w' ? '.' : '…'} ${p.san}`;
  };
  const flagged = moves.filter((m) => m.cls === 'blunder' || m.cls === 'mistake' || m.turning);
  const hi = hover ?? null;

  return (
    <div class="graph">
      <div class="graph-head">
        <span>Evaluation — White’s winning chances</span>
        <span class="mono">{formatScore(evals[current])}</span>
      </div>
      {hi != null ? (
        <div class="graph-tip" style={{ left: `${(x(hi) / W) * 100}%` }}>
          <b>{formatScore(evals[hi])}</b> · {label(hi)}
        </div>
      ) : null}
      <svg
        ref={svg}
        viewBox={`0 0 ${W} ${H}`}
        role="slider"
        tabIndex={0}
        aria-label="Evaluation graph. Use the left and right arrow keys to step through the game."
        aria-valuemin={0}
        aria-valuemax={n - 1}
        aria-valuenow={current}
        aria-valuetext={`${label(current)}, evaluation ${formatScore(evals[current])}`}
        onPointerMove={(e) => setHover(indexAt(e.clientX))}
        onPointerLeave={() => setHover(null)}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture?.(e.pointerId);
          onSelect(indexAt(e.clientX));
        }}
        onPointerUp={(e) => e.pointerType !== 'mouse' && setHover(null)}
      >
        <rect x={PAD.l} y={PAD.t} width={W - PAD.l - PAD.r} height={H - PAD.t - PAD.b} fill="#0b1236" rx="4" />
        <path d={area} fill="#f3e9d2" opacity="0.13" />
        <line x1={PAD.l} x2={W - PAD.r} y1={y(50)} y2={y(50)} stroke="#36448f" stroke-width="1" />
        <path d={path} fill="none" stroke="#f3e9d2" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke" />
        {flagged.map((m) => {
          const i = m.ply + 1;
          const [cx, cy] = pts[i];
          const mine = !userColor || plies[m.ply].color === userColor;
          const op = mine ? 1 : 0.55;
          if (m.cls === 'blunder') return <circle key={i} cx={cx} cy={cy} r="5" fill="#ff6b5e" stroke="#0f1740" stroke-width="2" opacity={op} />;
          if (m.cls === 'mistake') return <rect key={i} x={cx - 4.2} y={cy - 4.2} width="8.4" height="8.4" transform={`rotate(45 ${cx} ${cy})`} fill="#ff6b5e" stroke="#0f1740" stroke-width="2" opacity={op} />;
          return <circle key={i} cx={cx} cy={cy} r="4.5" fill="#0f1740" stroke="#ffb829" stroke-width="2.4" opacity={op} />;
        })}
        {flagged.filter((m) => m.turning && (m.cls === 'blunder' || m.cls === 'mistake')).map((m) => <circle key={`t${m.ply}`} cx={pts[m.ply + 1][0]} cy={pts[m.ply + 1][1]} r="9" fill="none" stroke="#ffb829" stroke-width="1.6" />)}
        {hi != null ? <line x1={x(hi)} x2={x(hi)} y1={PAD.t} y2={H - PAD.b} stroke="#b9c2e6" stroke-width="1" /> : null}
        <line x1={x(current)} x2={x(current)} y1={PAD.t} y2={H - PAD.b} stroke="#19d3c5" stroke-width="2" />
        <circle cx={x(current)} cy={pts[current][1]} r="5" fill="#19d3c5" stroke="#0f1740" stroke-width="2" />
      </svg>
      <div class="legend" style={{ marginTop: '5px' }}>
        <span><svg width="12" height="12" viewBox="0 0 12 12"><circle cx="6" cy="6" r="4.5" fill="#ff6b5e" /></svg>Blunder</span>
        <span><svg width="12" height="12" viewBox="0 0 12 12"><rect x="2.4" y="2.4" width="7.2" height="7.2" transform="rotate(45 6 6)" fill="#ff6b5e" /></svg>Mistake</span>
        <span><svg width="14" height="14" viewBox="0 0 14 14"><circle cx="7" cy="7" r="5" fill="none" stroke="#ffb829" stroke-width="1.8" /></svg>Turning point</span>
        <span class="dim">Top = White winning · bottom = Black winning</span>
      </div>
    </div>
  );
}
