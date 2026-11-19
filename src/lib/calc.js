// Calculation and visualisation trainer: read a line without the pieces
// moving, then answer questions about the position at the end of it.
import { Chess } from 'chess.js';
import { LIBRARY, getPuzzle } from './puzzles.js';
import { playUci, VALUE, PIECE_NAME, sideName } from './chessx.js';
import { replay } from './chessx.js';

export const MAX_LEVEL = 12;
const UP_AFTER = 2; // perfect rounds in a row to go one move deeper
const DOWN_AFTER = 2; // missed rounds in a row to go one move shallower

const lineLen = (p) => (typeof p.moves === 'number' ? p.moves : p.solution ? p.solution.length : 0);

/**
 * A line to read: from a puzzle at about my rating whose solution is long
 * enough, otherwise a stretch of one of my own games.
 * Returns { fen, ucis, lead, source, label } or null.
 */
export function pickLine(level, { rating = 1000, games = [], rng = Math.random, avoid = new Set() } = {}) {
  const pool = LIBRARY.filter((p) => lineLen(p) >= level && !avoid.has(p.id));
  if (pool.length) {
    const near = pool.sort((a, b) => Math.abs(a.rating - rating) - Math.abs(b.rating - rating)).slice(0, 40);
    for (let tries = 0; tries < 6; tries++) {
      const pick = near[Math.floor(rng() * near.length)];
      const p = getPuzzle(pick.id);
      if (p && p.fen && p.solution && p.solution.length >= level) {
        return { id: p.id, fen: p.fen, ucis: p.solution.slice(0, level), lead: p.lead ? [p.lead.uci.slice(0, 2), p.lead.uci.slice(2, 4)] : null, source: 'puzzle', label: 'From a puzzle' };
      }
    }
  }
  const long = games.filter((g) => g.moves && g.moves.length >= 16 + level);
  if (long.length) {
    const g = long[Math.floor(rng() * long.length)];
    try {
      const { fens, plies } = replay(g.startFen, g.moves);
      const start = 8 + Math.floor(rng() * Math.max(1, plies.length - level - 8));
      return {
        id: `${g.id}:${start}`,
        fen: fens[start],
        ucis: plies.slice(start, start + level).map((p) => p.uci),
        lead: start > 0 ? [plies[start - 1].from, plies[start - 1].to] : null,
        source: 'game',
        label: `From your game ${g.white} – ${g.black}`,
      };
    } catch {
      return null;
    }
  }
  return null;
}

const pieceLabel = (color, type) => `${sideName(color)} ${PIECE_NAME[type]}`;
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/** Play the line, tracking where each piece goes. */
export function traceLine(fen, ucis) {
  const chess = new Chess(fen);
  const at = new Map(); // square -> piece record
  chess.board().flat().forEach((p) => p && at.set(p.square, { color: p.color, type: p.type, start: p.square, moved: 0, promoted: false }));
  const visited = new Set();
  const moves = [];
  let captures = 0;
  for (const u of ucis) {
    const m = playUci(chess, u);
    if (!m) break;
    moves.push(m);
    visited.add(m.from);
    visited.add(m.to);
    const piece = at.get(m.from);
    at.delete(m.from);
    if (m.flags.includes('e')) at.delete(m.to[0] + m.from[1]);
    if (m.captured) captures++;
    if (piece) {
      piece.moved++;
      if (m.promotion) {
        piece.type = m.promotion;
        piece.promoted = true;
      }
      at.set(m.to, piece);
    }
    if (m.flags.includes('k') || m.flags.includes('q')) {
      const r = m.color === 'w' ? '1' : '8';
      const [rf, rt] = m.flags.includes('k') ? [`h${r}`, `f${r}`] : [`a${r}`, `d${r}`];
      const rook = at.get(rf);
      at.delete(rf);
      if (rook) {
        rook.moved++;
        at.set(rt, rook);
      }
    }
  }
  return { chess, at, visited, moves, captures };
}

const materialDiff = (chess) => {
  let d = 0;
  for (const p of chess.board().flat()) if (p && p.type !== 'k') d += (p.color === 'w' ? 1 : -1) * VALUE[p.type];
  return d;
};
const fmtDiff = (d) => (d === 0 ? 'Material is level' : `${d > 0 ? 'White' : 'Black'} is ${Math.abs(d)} point${Math.abs(d) === 1 ? '' : 's'} up`);

function shuffle(a, rng) {
  const x = a.slice();
  for (let i = x.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [x[i], x[j]] = [x[j], x[i]];
  }
  return x;
}

/**
 * Questions about the end of the line. Each is
 * { kind: 'where', text, answer: square } — tap a square — or
 * { kind: 'what' | 'material' | 'check', text, options: [..], answer }.
 */
export function buildQuestions(fen, ucis, { rng = Math.random, n = 2 } = {}) {
  const { chess, at, visited, moves, captures } = traceLine(fen, ucis);
  const qs = [];
  // Where did a piece end up? Prefer pieces that moved more than once, then the last mover.
  const movers = [...at.entries()].filter(([, p]) => p.moved > 0 && !p.promoted).map(([sq, p]) => ({ sq, ...p }));
  if (movers.length) {
    const deep = movers.filter((p) => p.moved > 1);
    const pick = deep.length ? deep[Math.floor(rng() * deep.length)] : movers[Math.floor(rng() * movers.length)];
    qs.push({ kind: 'where', text: `Where is the ${pieceLabel(pick.color, pick.type)} that started on ${pick.start}? Tap its square.`, answer: pick.sq, piece: pick });
  }
  const others = [];
  // What is on a square the line went through?
  const squares = [...visited].filter((s) => !qs.length || s !== qs[0].answer);
  if (squares.length) {
    const sq = squares[Math.floor(rng() * squares.length)];
    const p = chess.get(sq);
    const answer = p ? cap(pieceLabel(p.color, p.type)) : 'Nothing — it’s empty';
    const pool = new Set(['Nothing — it’s empty']);
    for (const m of moves) {
      pool.add(cap(pieceLabel(m.color, m.piece)));
      if (m.captured) pool.add(cap(pieceLabel(m.color === 'w' ? 'b' : 'w', m.captured)));
    }
    if (p) pool.add(cap(pieceLabel(p.color === 'w' ? 'b' : 'w', p.type)));
    pool.delete(answer);
    const options = shuffle([answer, ...shuffle([...pool], rng).slice(0, 3)], rng);
    if (options.length >= 2) others.push({ kind: 'what', text: `What is on ${sq} at the end of the line?`, options, answer });
  }
  if (captures) {
    const d = materialDiff(chess);
    const answer = fmtDiff(d);
    const pool = new Set([fmtDiff(d + 1), fmtDiff(d - 1), fmtDiff(d + 3), fmtDiff(d - 3), fmtDiff(-d), fmtDiff(0)]);
    pool.delete(answer);
    others.push({ kind: 'material', text: 'Count the material at the end of the line (pawn 1, knight and bishop 3, rook 5, queen 9).', options: shuffle([answer, ...shuffle([...pool], rng).slice(0, 3)], rng), answer });
  }
  const side = sideName(chess.turn());
  const status = chess.isCheckmate() ? 'Checkmate' : chess.inCheck() ? 'Check, but not mate' : 'Not in check';
  others.push({ kind: 'check', text: `At the end of the line it’s ${side} to move. Is ${side}’s king in check?`, options: ['Not in check', 'Check, but not mate', 'Checkmate'], answer: status });
  // Checks are rarer, so weight a check/mate question in when it happens.
  const ordered = chess.inCheck() ? [others.pop(), ...shuffle(others, rng)] : shuffle(others, rng);
  for (const q of ordered) {
    if (qs.length >= n) break;
    qs.push(q);
  }
  return { questions: qs, finalFen: chess.fen(), moves };
}

/** Move the level after a round. */
export function scoreRound(calc, perfect, now = Date.now()) {
  const c = { level: 1, best: 1, rounds: 0, perfect: 0, good: 0, bad: 0, hist: [], ...calc };
  let change = 0;
  c.rounds++;
  if (perfect) {
    c.perfect++;
    c.good++;
    c.bad = 0;
    if (c.good >= UP_AFTER && c.level < MAX_LEVEL) {
      c.level++;
      c.good = 0;
      change = 1;
    }
  } else {
    c.bad++;
    c.good = 0;
    if (c.bad >= DOWN_AFTER && c.level > 1) {
      c.level--;
      c.bad = 0;
      change = -1;
    }
  }
  c.best = Math.max(c.best, c.level);
  c.hist = [...(c.hist || []), { t: now, level: calc.level || 1, ok: !!perfect }].slice(-60);
  return { calc: c, change };
}
