// "Convert your wins": positions from your reviewed games where you were
// clearly winning but the game didn't end in a win (or nearly slipped).
// Each starts just before the move that let the advantage go.
import { replay, sideName } from './chessx.js';

export const WIN_CP = 300; // "clearly winning" from your side
export const LOST_CP = 120; // below this the advantage is gone
export const CONVERTED_CP = 900; // a queen up or a forced mate counts as converted

/** Your evaluation (centipawns) from a stored white-POV eval; mates count as ±10000. */
export function userCp(ev, color) {
  if (!ev) return 0;
  if (ev.winner) return ev.winner === color ? 10000 : -10000;
  if (ev.mate != null) {
    const v = ev.mate > 0 ? 10000 - ev.mate : ev.mate < 0 ? -10000 - ev.mate : 0;
    return color === 'w' ? v : -v;
  }
  return color === 'w' ? ev.cp || 0 : -(ev.cp || 0);
}

const userWon = (g) => (g.result === '1-0' && g.userColor === 'w') || (g.result === '0-1' && g.userColor === 'b');

export function wonPositions(games) {
  const out = [];
  for (const g of games) {
    if (!g.analysis || !g.userColor || g.result === '*') continue;
    const evals = g.analysis.evals;
    const { fens, plies } = replay(g.startFen, g.moves);
    const firstMover = g.startFen ? g.startFen.split(' ')[1] : 'w';
    const mine = (ply) => (ply % 2 === 0) === (firstMover === g.userColor);
    // The worst move I made while clearly winning.
    let worst = null;
    for (let i = 0; i < plies.length; i++) {
      if (!mine(i)) continue;
      const before = userCp(evals[i], g.userColor);
      const after = userCp(evals[i + 1], g.userColor);
      if (before < WIN_CP || after >= LOST_CP) continue;
      const drop = Math.min(before, 2000) - after;
      if (!worst || drop > worst.drop) worst = { ply: i, before, after, drop };
    }
    const won = userWon(g);
    if (!worst) continue;
    if (won && worst.after >= 0) continue; // only count near-throws in won games when it really swung
    out.push({
      id: `cv-${g.id}-${worst.ply}`,
      gameId: g.id,
      ply: worst.ply,
      fen: fens[worst.ply],
      userColor: g.userColor,
      before: worst.before,
      after: worst.after,
      played: plies[worst.ply].san,
      result: g.result,
      outcome: won ? 'won anyway' : g.result === '1/2-1/2' ? 'drew' : 'lost',
      label: `${g.white} – ${g.black}`,
      created: g.created,
      opening: g.opening,
    });
  }
  return out.sort((a, b) => b.created - a.created);
}

export const fmtAdv = (cp) => (cp >= 9000 ? 'a forced mate' : cp >= 900 ? 'a queen or more' : `+${(cp / 100).toFixed(1)}`);

export function convertDrill(p) {
  return {
    id: p.id,
    title: p.label,
    level: 'Your game',
    fen: p.fen,
    goal: 'convert',
    limit: 40,
    orientation: p.userColor === 'w' ? 'white' : 'black',
    blurb: `You were ${p.before >= 9000 ? 'mating' : `${fmtAdv(p.before)} up`} here as ${sideName(p.userColor)}. In the game you played ${p.played} and ${p.outcome === 'won anyway' ? 'nearly let it go' : `${p.outcome}`}. Win it this time: reach a forced mate or a queen up, without letting the advantage drop.`,
    tips: ['First look for checks, captures and threats — for both sides.', 'When you’re winning, safety first: take away their counterplay before grabbing more.', 'Trade pieces, not pawns. Every trade makes your extra material count more.'],
    source: p,
  };
}
