// Clock review: how long each move took, where time was burned on routine
// moves, and what happened once the clock got low. Needs per-move clock data
// (chess.com/Lichess PGNs carry it as [%clk], games played here record it).

/** Seconds spent on each ply, or null if the game has no usable clock data. */
export function timeSpent(game) {
  const clocks = game.clocks;
  const tc = game.timeControl && typeof game.timeControl === 'object' ? game.timeControl : null;
  if (!clocks || !tc || clocks.length !== game.moves.length) return null;
  return clocks.map((left, i) => {
    const prev = i < 2 ? tc.base : clocks[i - 2];
    return Math.max(0, Math.round((prev - left + (i < 2 ? 0 : tc.inc)) * 10) / 10);
  });
}

export const fmtSecs = (s) => (s >= 60 ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}` : `${Math.round(s)}s`);

/**
 * Report for one side ({ color } defaults to the user's colour).
 * { moves: [{ ply, spent, left, cls, loss }], total, avg, sinks, lowTime, lowBlunders, phase: { opening, middlegame, endgame } }
 */
export function clockReport(game, color = game.userColor) {
  const spent = timeSpent(game);
  if (!spent || !color) return null;
  const tc = game.timeControl;
  const firstMover = game.startFen ? game.startFen.split(' ')[1] : 'w';
  const an = game.analysis;
  const moves = [];
  spent.forEach((s, i) => {
    const mine = (i % 2 === 0) === (firstMover === color);
    if (!mine) return;
    const rec = an ? an.moves[i] : null;
    moves.push({ ply: i, spent: s, left: game.clocks[i], cls: rec ? rec.cls : null, loss: rec ? rec.loss : null });
  });
  if (!moves.length) return null;
  const total = moves.reduce((a, m) => a + m.spent, 0);
  const avg = total / moves.length;
  const lowLine = Math.max(30, tc.base * 0.1);
  // A "time sink": a long think (4× your average and at least 30s) on a move that didn't matter much.
  const sinks = moves
    .filter((m) => m.spent >= Math.max(30, avg * 4) && (m.loss == null || m.loss < 8))
    .sort((a, b) => b.spent - a.spent)
    .slice(0, 3);
  const low = moves.filter((m) => m.left - (tc.inc || 0) < lowLine || m.left < lowLine);
  const bad = (m) => m.cls === 'mistake' || m.cls === 'blunder';
  const phaseOf = (ply) => (ply < 20 ? 'opening' : ply < 60 ? 'middlegame' : 'endgame');
  const phase = {};
  for (const m of moves) {
    const k = phaseOf(m.ply);
    phase[k] = phase[k] || { n: 0, total: 0 };
    phase[k].n++;
    phase[k].total += m.spent;
  }
  return {
    moves,
    total,
    avg,
    lowLine,
    sinks,
    lowTime: low.length,
    lowBlunders: low.filter(bad).length,
    allBlunders: moves.filter(bad).length,
    longest: moves.slice().sort((a, b) => b.spent - a.spent)[0],
    phase,
    base: tc.base,
    inc: tc.inc,
  };
}

/** Across games: how much of my damage happens with the clock low. */
export function timeTrouble(games) {
  let withClocks = 0;
  let bad = 0;
  let lowBad = 0;
  let sinks = 0;
  let flagged = 0;
  const examples = [];
  for (const g of games) {
    const r = clockReport(g);
    if (!r) continue;
    withClocks++;
    if (/time/i.test(g.termination || '') && ((g.result === '1-0' && g.userColor === 'b') || (g.result === '0-1' && g.userColor === 'w'))) flagged++;
    if (!g.analysis) continue;
    bad += r.allBlunders;
    lowBad += r.lowBlunders;
    sinks += r.sinks.length;
    if (r.sinks[0]) examples.push({ gameId: g.id, ply: r.sinks[0].ply, spent: r.sinks[0].spent, label: `${g.white} – ${g.black}` });
  }
  return { withClocks, bad, lowBad, sinks, flagged, examples: examples.sort((a, b) => b.spent - a.spent).slice(0, 3) };
}
