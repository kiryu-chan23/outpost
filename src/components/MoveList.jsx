import { useEffect, useRef } from 'preact/hooks';
import { Icon } from './Icon.jsx';
import { CLASS_LABEL, CLASS_MARK } from '../lib/analysis.js';
import { fullmoveOf, turnOf } from '../lib/chessx.js';

/**
 * Two-column move list.
 *   plies    [{ san, color }]
 *   current  number of plies played in the shown position (0 = start)
 *   marks    optional per-ply review records ({ cls, turning })
 *   evalText optional per-ply eval strings for labels
 */
export function MoveList({ plies, current, onSelect, marks, startFen, evalText }) {
  const wrap = useRef(null);
  useEffect(() => {
    const node = wrap.current && wrap.current.querySelector('[aria-current="true"]');
    if (node && wrap.current) {
      const top = node.offsetTop - wrap.current.offsetTop;
      if (top < wrap.current.scrollTop || top + node.offsetHeight > wrap.current.scrollTop + wrap.current.clientHeight) wrap.current.scrollTop = Math.max(0, top - wrap.current.clientHeight / 2);
    }
  }, [current, plies.length]);

  const firstNum = startFen ? fullmoveOf(startFen) : 1;
  const blackStarts = startFen ? turnOf(startFen) === 'b' : false;
  const rows = [];
  let i = 0;
  let num = firstNum;
  if (blackStarts && plies.length) {
    rows.push([num, null, 0]);
    i = 1;
    num++;
  }
  for (; i < plies.length; i += 2) rows.push([num++, i, i + 1 < plies.length ? i + 1 : null]);

  const cell = (idx) => {
    if (idx == null) return <span />;
    const p = plies[idx];
    const m = marks && marks[idx];
    const flagged = m && (m.cls === 'inaccuracy' || m.cls === 'mistake' || m.cls === 'blunder');
    const label = `${p.san}${flagged ? `, ${CLASS_LABEL[m.cls].toLowerCase()}` : ''}${m && m.turning ? ', turning point' : ''}${evalText && evalText[idx] ? `, evaluation ${evalText[idx]}` : ''}`;
    if (!onSelect)
      return (
        <span class="mv" aria-current={current === idx + 1 ? 'true' : undefined}>
          {p.san}
        </span>
      );
    return (
      <button type="button" aria-current={current === idx + 1 ? 'true' : undefined} aria-label={label} title={evalText && evalText[idx] ? `Evaluation ${evalText[idx]}` : undefined} onClick={() => onSelect(idx + 1)}>
        <span>{p.san}</span>
        {flagged ? <span class={`mark ${m.cls}`}>{CLASS_MARK[m.cls]}</span> : null}
        {m && m.turning ? <span class="tp" title="Turning point" /> : null}
      </button>
    );
  };

  if (!plies.length) return <p class="muted small">No moves yet.</p>;
  return (
    <div class="moves-wrap" ref={wrap}>
      <div class="moves" role="list" aria-label="Moves">
        {rows.map(([n, w, b]) => (
          <>
            <span class="num" role="listitem">{n}.</span>
            {w == null && b != null && blackStarts && n === firstNum ? <span class="num">…</span> : cell(w)}
            {cell(b)}
          </>
        ))}
      </div>
    </div>
  );
}

/** First / previous / next / last buttons (arrow keys are bound by the view). */
export function ReplayBar({ current, total, onSelect, children }) {
  return (
    <div class="replay" role="group" aria-label="Replay controls">
      <button type="button" class="btn icon" style={{ width: '100%' }} aria-label="First move (Home)" disabled={current === 0} onClick={() => onSelect(0)}>
        <Icon name="first" />
      </button>
      <button type="button" class="btn icon" style={{ width: '100%' }} aria-label="Previous move (Left arrow)" disabled={current === 0} onClick={() => onSelect(current - 1)}>
        <Icon name="prev" />
      </button>
      <button type="button" class="btn icon" style={{ width: '100%' }} aria-label="Next move (Right arrow)" disabled={current >= total} onClick={() => onSelect(current + 1)}>
        <Icon name="next" />
      </button>
      <button type="button" class="btn icon" style={{ width: '100%' }} aria-label="Last move (End)" disabled={current >= total} onClick={() => onSelect(total)}>
        <Icon name="last" />
      </button>
      {children}
    </div>
  );
}

/** Left/Right/Home/End replay keys, ignored while typing in a field. */
export function useReplayKeys(current, total, onSelect, enabled = true) {
  useEffect(() => {
    if (!enabled) return undefined;
    const onKey = (e) => {
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (document.querySelector('.scrim')) return;
      let next = null;
      if (e.key === 'ArrowLeft') next = Math.max(0, current - 1);
      else if (e.key === 'ArrowRight') next = Math.min(total, current + 1);
      else if (e.key === 'Home' || e.key === 'ArrowUp') next = 0;
      else if (e.key === 'End' || e.key === 'ArrowDown') next = total;
      if (next == null) return;
      e.preventDefault();
      if (next !== current) onSelect(next);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [current, total, onSelect, enabled]);
}
