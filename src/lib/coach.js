// Live coach for games in Outpost: an instant warning before a move that
// leaves a piece hanging or allows mate in one (no engine needed), a verdict
// on every move, and "training wheels" that fade as your games get cleaner.
import { Chess } from 'chess.js';
import { hungAfter } from './blundercheck.js';
import { VALUE, PIECE_NAME, sideName, opp } from './chessx.js';

export const WHEELS = [
  { level: 0, label: 'Off', hint: 'No warnings before you move — the coach only reviews afterwards.' },
  { level: 1, label: 'Mates', hint: 'Warns only when a move allows checkmate in one.' },
  { level: 2, label: 'Pieces', hint: 'Warns before moves that drop a knight, bishop or more, or allow mate.' },
  { level: 3, label: 'All', hint: 'Warns before any move that loses material for nothing, or allows mate.' },
];
const MIN_GAIN = { 1: Infinity, 2: 3, 3: 2 };
export const CLEAN_GAMES = 3; // clean coached games in a row before the wheels come down a level
const MIN_MOVES = 15;

/** A warning for `move` (from `fenBefore`, played by `color`), or null if it's safe at this level. */
export function preMoveWarning(fenBefore, move, color, level) {
  if (!level) return null;
  const c = new Chess(fenBefore);
  let m;
  try {
    m = c.move(move);
  } catch {
    return null;
  }
  if (!m) return null;
  const hung = hungAfter(c.fen(), color, m.captured ? VALUE[m.captured] : 0);
  if (!hung) return null;
  if (hung.kind === 'mate') return { kind: 'mate', san: m.san, text: `After ${m.san}, ${sideName(opp(color))} has checkmate in one. Look at their checks before you move.` };
  if (hung.gain < MIN_GAIN[level]) return null;
  const pts = hung.gain;
  const own = hung.square === m.to ? `the ${PIECE_NAME[hung.piece]} you just moved` : `your ${PIECE_NAME[hung.piece]} on ${hung.square}`;
  return { kind: 'piece', san: m.san, square: hung.square, gain: pts, text: `After ${m.san}, ${own} can be taken — ${sideName(opp(color))} wins about ${pts} point${pts === 1 ? '' : 's'} of material for nothing.` };
}

/** A word on every move, from the drop in winning chances (0–100) and whether it was the engine's choice. */
export function verdictFor(loss, best) {
  if (best || loss < 2) return { key: 'best', label: best ? 'Best move' : 'Excellent', kind: 'good' };
  if (loss < 6) return { key: 'good', label: 'Good', kind: 'good' };
  if (loss < 12) return { key: 'inaccuracy', label: 'Inaccuracy', kind: 'warn' };
  if (loss < 30) return { key: 'mistake', label: 'Mistake', kind: 'bad' };
  return { key: 'blunder', label: 'Blunder', kind: 'bad' };
}

/**
 * After a coached game: record it, and move the training wheels.
 * Down a level after CLEAN_GAMES clean games in a row (at most one warning each);
 * up a level after a game with four or more warnings.
 */
export function adjustWheels(wheels, log) {
  const w = { level: 3, games: [], ...(wheels || {}) };
  const games = [...(w.games || []), log].slice(-10);
  let level = w.level;
  let change = 0;
  if (log.warned >= 4 && level < 3 && level > 0) {
    level++;
    change = 1;
  } else {
    const run = games.slice(-CLEAN_GAMES);
    if (level > 0 && run.length === CLEAN_GAMES && run.every((g) => g.warned <= 1 && g.moves >= MIN_MOVES)) {
      level--;
      change = -1;
    }
  }
  return { wheels: { level, games: change ? [] : games }, change };
}
