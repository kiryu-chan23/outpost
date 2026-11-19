// The chessboard. Rendering, drag-and-drop and tap-to-move come from
// chessground; legality comes from chess.js. This component adds the promotion
// picker, legal-move dots, flash feedback and keeps the two in sync.
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { Chessground } from 'chessground';
import { Chess } from 'chess.js';
import { legalDests, isPromotion, cgColor, PIECE_NAME, sideName } from '../lib/chessx.js';

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const BRUSHES = {
  turq: { key: 'turq', color: '#19d3c5', opacity: 1, lineWidth: 10 },
  coral: { key: 'coral', color: '#ff6b5e', opacity: 1, lineWidth: 10 },
  amber: { key: 'amber', color: '#ffb829', opacity: 1, lineWidth: 10 },
  threat: { key: 'threat', color: '#ffb829', opacity: 0.45, lineWidth: 7 },
  ink: { key: 'ink', color: '#0a1030', opacity: 0.75, lineWidth: 8 },
};

/**
 * props:
 *   fen            position to show
 *   orientation    'white' | 'black'
 *   interactive    allow the side to move to be moved by the user
 *   movableColor   restrict to 'w' or 'b' (the user's side); omit for both
 *   lastMove       [from, to] to highlight
 *   shapes         chessground auto-shapes ({ orig, dest?, brush })
 *   onMove         ({ from, to, promotion }) => void — parent decides what happens next
 *   rev            bump to force the board back in sync after a rejected move
 *   flash          { kind: 'good' | 'bad', key } short border flash
 *   onSquare       (square) => void — when set, taps report squares instead of moving pieces
 */
export function Board({ fen, orientation = 'white', interactive = false, movableColor, lastMove, shapes, onMove, onSquare, viewOnly = false, coords = true, autoQueen = false, rev = 0, flash, label }) {
  const el = useRef(null);
  const api = useRef(null);
  const live = useRef({});
  const [promo, setPromo] = useState(null);
  const [localRev, setLocalRev] = useState(0);

  const chess = useMemo(() => {
    try {
      return new Chess(fen);
    } catch {
      return new Chess();
    }
  }, [fen]);
  const turn = chess.turn();
  live.current = { fen, onMove, autoQueen, onSquare, shapes: shapes || [] };
  // chessground computes arrow geometry from the board's size; drawing while it
  // is 0×0 (mid-layout) yields NaN coordinates, so hold shapes until it has a size.
  const sized = () => !!(el.current && el.current.offsetWidth > 0 && el.current.offsetHeight > 0);

  const canMove = interactive && !onSquare && !viewOnly && (!movableColor || movableColor === turn) && !chess.isGameOver();
  const shapesKey = JSON.stringify(shapes || []);
  const lastKey = lastMove ? lastMove.join('') : '';

  const config = () => ({
    fen,
    orientation,
    turnColor: cgColor(turn),
    check: chess.inCheck() ? cgColor(turn) : false,
    lastMove: lastMove || undefined,
    coordinates: coords,
    viewOnly,
    animation: { enabled: !reducedMotion(), duration: 170 },
    highlight: { lastMove: true, check: true },
    movable: {
      free: false,
      color: canMove ? cgColor(turn) : undefined,
      dests: canMove ? legalDests(chess) : new Map(),
      showDests: true,
      events: {
        after: (orig, dest) => {
          const cur = live.current;
          const c = new Chess(cur.fen);
          if (isPromotion(c, orig, dest)) {
            if (cur.autoQueen) cur.onMove && cur.onMove({ from: orig, to: dest, promotion: 'q' });
            else setPromo({ from: orig, to: dest, color: c.turn() });
            return;
          }
          if (cur.onMove) cur.onMove({ from: orig, to: dest });
        },
      },
    },
    premovable: { enabled: false },
    draggable: { enabled: true, showGhost: true, distance: 3 },
    selectable: { enabled: !onSquare },
    drawable: { enabled: false, visible: true, autoShapes: sized() ? shapes || [] : [], brushes: BRUSHES },
  });

  useEffect(() => {
    api.current = Chessground(el.current, config());
    const ro =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => {
            if (!api.current || !sized()) return;
            api.current.redrawAll();
            api.current.setAutoShapes(live.current.shapes);
          })
        : null;
    if (ro) ro.observe(el.current);
    return () => {
      if (ro) ro.disconnect();
      api.current.destroy();
      api.current = null;
    };
    // chessground binds mouse/touch input only when it is created, so a board
    // switching between view-only and playable has to be rebuilt.
  }, [viewOnly]);

  useEffect(() => {
    if (api.current) api.current.set(config());
  }, [fen, orientation, canMove, lastKey, shapesKey, viewOnly, coords, rev, localRev, !!onSquare]);

  // Square taps (used by blunder-check mode): work out the square from the pointer position.
  const onTap = (e) => {
    const f = live.current.onSquare;
    if (!f || !el.current) return;
    const r = el.current.getBoundingClientRect();
    let x = Math.floor(((e.clientX - r.left) / r.width) * 8);
    let y = Math.floor(((e.clientY - r.top) / r.height) * 8);
    if (x < 0 || x > 7 || y < 0 || y > 7) return;
    if (orientation === 'black') x = 7 - x;
    else y = 7 - y;
    f(String.fromCharCode(97 + x) + (y + 1));
  };

  // Promotion picker ---------------------------------------------------------
  const choose = (piece) => {
    const p = promo;
    setPromo(null);
    if (!piece) {
      setLocalRev((n) => n + 1); // put the pawn back
      return;
    }
    if (live.current.onMove) live.current.onMove({ from: p.from, to: p.to, promotion: piece });
  };
  useEffect(() => {
    if (!promo) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') choose(null);
      const map = { q: 'q', r: 'r', b: 'b', n: 'n' };
      if (map[e.key.toLowerCase()]) choose(map[e.key.toLowerCase()]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [promo]);

  let picker = null;
  if (promo) {
    let x = promo.to.charCodeAt(0) - 97;
    if (orientation === 'black') x = 7 - x;
    const atTop = (promo.color === 'w') === (orientation === 'white');
    picker = (
      <div class="promo" role="dialog" aria-label="Choose a piece to promote to" onClick={(e) => e.target === e.currentTarget && choose(null)}>
        <div class={`promo-col ${atTop ? 'top' : 'bottom'}`} style={{ left: `${x * 12.5}%` }}>
          {['q', 'n', 'r', 'b'].map((p, i) => (
            <button key={p} type="button" autoFocus={i === 0} aria-label={`Promote to ${PIECE_NAME[p]}`} title={`${PIECE_NAME[p][0].toUpperCase()}${PIECE_NAME[p].slice(1)} (${p.toUpperCase()})`} onClick={() => choose(p)}>
              <span class={`piece-img ${PIECE_NAME[p]} ${cgColor(promo.color)}`} />
            </button>
          ))}
        </div>
        <div class="promo-hint" style={{ top: atTop ? '72%' : '28%' }}>Promote to… <span class="dim">Esc cancels</span></div>
      </div>
    );
  }

  const status = chess.isCheckmate() ? 'Checkmate.' : chess.isGameOver() ? 'Game over.' : `${sideName(turn)} to move${chess.inCheck() ? ', in check' : ''}.`;
  return (
    <div class="board-frame">
      <div class={`board-box${viewOnly ? ' view-only' : ''}`} role="group" aria-label={`${label || 'Chessboard'}. ${status}`} data-fen={fen} data-turn={turn}>
        <div ref={el} class="cg-wrap" onClick={onSquare ? onTap : undefined} style={onSquare ? { cursor: 'pointer' } : undefined} />
        {flash ? <div key={flash.key} class={`board-flash ${flash.kind}`} /> : null}
        {picker}
      </div>
    </div>
  );
}
