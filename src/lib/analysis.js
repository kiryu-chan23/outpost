// Whole-game review: evaluate every position with the engine (in the worker),
// then classify each move by how much winning chance it gave away.
import { Chess } from 'chess.js';
import { replay, turnOf, gamePhase } from './chessx.js';
import { winPct, flipScore } from './uci.js';
import { explainMove } from './explain.js';
import { engines } from './engine.js';

export const REVIEW_DEPTH = { quick: 10, standard: 13, deep: 16 };
export const CLASS_LABEL = { best: 'Best move', good: 'Good', inaccuracy: 'Inaccuracy', mistake: 'Mistake', blunder: 'Blunder' };
export const CLASS_MARK = { best: '', good: '', inaccuracy: '?!', mistake: '?', blunder: '??' };

/** Evaluate one position. Returns a White-point-of-view record. */
export async function evaluateFen(fen, { depth = 13, signal, multipv = 1 } = {}) {
  const chess = new Chess(fen);
  if (chess.isCheckmate()) return { cp: null, mate: 0, winner: chess.turn() === 'w' ? 'b' : 'w', pv: [], best: null, terminal: true };
  if (chess.isGameOver()) return { cp: 0, mate: null, pv: [], best: null, terminal: true };
  const r = await engines.analyst.analyse(fen, { depth, multipv, signal });
  if (r.aborted || !r.lines.length) return null;
  const top = r.lines[0];
  const white = turnOf(fen) === 'w' ? top : flipScore(top);
  return { cp: white.cp, mate: white.mate, best: top.pv[0], pv: top.pv.slice(0, 10), depth: top.depth, alts: r.lines.slice(1).map((l) => ({ move: l.pv[0], ...(turnOf(fen) === 'w' ? { cp: l.cp, mate: l.mate } : flipScore(l)) })) };
}

/** Expected score for White (0–100) from a stored evaluation. */
export function whiteWin(ev) {
  if (!ev) return 50;
  if (ev.winner) return ev.winner === 'w' ? 100 : 0;
  return winPct(ev);
}
const moverScore = (ev, color) => (color === 'w' ? { cp: ev.cp, mate: ev.mate } : flipScore(ev));

export function classify(loss, isBest) {
  if (isBest) return 'best';
  if (loss >= 30) return 'blunder';
  if (loss >= 20) return 'mistake';
  if (loss >= 10) return 'inaccuracy';
  return 'good';
}
/** Per-move accuracy from the winning chances given away (0–100). */
export const moveAccuracy = (loss) => Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * loss) - 3.1669));

const zone = (w) => (w >= 70 ? 'W' : w <= 30 ? 'B' : '=');

/** Build the review report from per-position evaluations. Pure — unit tested. */
export function buildReport(game, evals, depth) {
  const { plies, fens } = replay(game.startFen, game.moves);
  const moves = [];
  const sums = { w: 0, b: 0 };
  const n = { w: 0, b: 0 };
  const counts = { w: { inaccuracy: 0, mistake: 0, blunder: 0 }, b: { inaccuracy: 0, mistake: 0, blunder: 0 } };
  plies.forEach((p, i) => {
    const e0 = evals[i];
    const e1 = evals[i + 1];
    const w0 = whiteWin(e0);
    const w1 = whiteWin(e1);
    const loss = Math.max(0, p.color === 'w' ? w0 - w1 : w1 - w0);
    const isBest = e0.best === p.uci;
    const cls = classify(loss, isBest);
    const acc = moveAccuracy(loss);
    sums[p.color] += acc;
    n[p.color]++;
    const rec = { ply: i, cls, loss: Math.round(loss * 10) / 10, tags: [], text: '', turning: false, phase: gamePhase(new Chess(fens[i]), i) };
    if (cls === 'inaccuracy' || cls === 'mistake' || cls === 'blunder') {
      counts[p.color][cls]++;
      const voice = game.userColor ? (game.userColor === p.color ? 'you' : 'they') : 'they';
      const ex = explainMove({
        fenBefore: fens[i],
        fenAfter: fens[i + 1],
        played: p,
        before: { ...moverScore(e0, p.color), pv: e0.pv },
        after: { ...moverScore(e1, p.color), pv: e1.pv },
        voice,
      });
      rec.text = ex.text;
      rec.tags = ex.tags;
      rec.bestSan = ex.bestSan;
      rec.missed = ex.tags.some((t) => t.startsWith('missed-'));
    }
    if (zone(w0) !== zone(w1) && loss >= 12) rec.zoneShift = true;
    moves.push(rec);
  });
  // Turning points: the biggest swings that changed who was better.
  moves
    .filter((m) => m.zoneShift)
    .sort((a, b) => b.loss - a.loss)
    .slice(0, 3)
    .forEach((m) => (m.turning = true));
  moves.forEach((m) => delete m.zoneShift);
  return {
    depth,
    at: Date.now(),
    evals,
    moves,
    accuracy: { w: n.w ? Math.round((sums.w / n.w) * 10) / 10 : null, b: n.b ? Math.round((sums.b / n.b) * 10) / 10 : null },
    counts,
  };
}

/**
 * Analyse a full game. onProgress(done, total). Honour `signal` to cancel:
 * resolves null when cancelled so the caller can keep what it had.
 */
export async function analyseGame(game, { depth = 13, signal, onProgress } = {}) {
  const { fens } = replay(game.startFen, game.moves);
  const evals = [];
  await engines.analyst.newGame();
  for (let i = 0; i < fens.length; i++) {
    if (signal?.aborted) return null;
    const ev = await evaluateFen(fens[i], { depth, signal });
    if (!ev) return null;
    evals.push(ev);
    if (onProgress) onProgress(i + 1, fens.length);
  }
  return buildReport(game, evals, depth);
}

/** Moves worth revisiting for one side, most costly first. */
export function keyMoments(game, color) {
  if (!game?.analysis) return [];
  const { plies } = replayCache(game);
  return game.analysis.moves
    .filter((m) => (m.cls === 'mistake' || m.cls === 'blunder' || m.turning || m.missed) && (!color || plies[m.ply].color === color))
    .sort((a, b) => b.loss - a.loss);
}

const cache = new WeakMap();
export function replayCache(game) {
  if (!cache.has(game)) cache.set(game, replay(game.startFen, game.moves));
  return cache.get(game);
}

/**
 * Judge a retry: is `uci` as good as the engine's choice in this position?
 * `refEval` is the stored White-POV evaluation of the position.
 */
export async function judgeAttempt(fen, uci, refEval, { depth = 12, signal } = {}) {
  if (refEval?.best === uci) return { ok: true, exact: true, loss: 0 };
  const chess = new Chess(fen);
  const color = chess.turn();
  let m;
  try {
    m = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
  } catch {
    return { ok: false, loss: 100 };
  }
  if (chess.isCheckmate()) return { ok: true, exact: false, loss: 0, san: m.san };
  const after = await evaluateFen(chess.fen(), { depth, signal });
  if (!after) return null;
  const ref = refEval || (await evaluateFen(fen, { depth, signal }));
  if (!ref) return null;
  const w0 = whiteWin(ref);
  const w1 = whiteWin(after);
  const loss = Math.max(0, color === 'w' ? w0 - w1 : w1 - w0);
  return { ok: loss < 5, exact: false, loss, san: m.san, after };
}
