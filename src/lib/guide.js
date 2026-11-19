// Guided review: the handful of moments in a game worth learning from, the
// chances the opponent gave you (and whether you took them), and the threat
// you didn't see before a mistake.
import { Chess } from 'chess.js';
import { replayCache } from './analysis.js';
import { engines } from './engine.js';
import { withTurn, opp, playUci, PIECE_NAME, VALUE, sideName } from './chessx.js';
import { materialSwing, describeLoss, TAG_THEME, TAG_LABEL } from './explain.js';

const BAD = (m) => m && (m.cls === 'mistake' || m.cls === 'blunder');
const firstMover = (game) => (game.startFen ? game.startFen.split(' ')[1] : 'w');
export const isMine = (game, ply) => !!game.userColor && (ply % 2 === 0) === (firstMover(game) === game.userColor);

/**
 * Chances the opponent gave me: every opponent mistake/blunder, and whether my
 * very next move kept the gain (punished) or let it go (missed).
 */
export function punishments(game) {
  const an = game.analysis;
  if (!an || !game.userColor) return { chances: 0, punished: 0, missed: [] };
  const out = { chances: 0, punished: 0, missed: [] };
  an.moves.forEach((m, ply) => {
    if (isMine(game, ply) || !BAD(m)) return;
    const reply = an.moves[ply + 1];
    if (!reply) return;
    out.chances++;
    if (reply.loss < 8) out.punished++;
    else out.missed.push({ ply: ply + 1, oppPly: ply, gift: m.loss, loss: reply.loss, cls: reply.cls });
  });
  out.missed.sort((a, b) => b.gift - a.gift);
  return out;
}

/** Across games: how often I take the chances I'm given. */
export function punishStats(games) {
  const sum = { games: 0, chances: 0, punished: 0, examples: [] };
  for (const g of games) {
    if (!g.analysis || !g.userColor) continue;
    const p = punishments(g);
    if (!p.chances) continue;
    sum.games++;
    sum.chances += p.chances;
    sum.punished += p.punished;
    for (const m of p.missed) sum.examples.push({ ...m, gameId: g.id, label: `${g.white} – ${g.black}`, text: g.analysis.moves[m.ply].text });
  }
  sum.examples.sort((a, b) => b.gift - a.gift);
  sum.examples = sum.examples.slice(0, 3);
  return sum;
}

/**
 * The steps of a guided review, in game order: my biggest mistakes and the
 * opponent blunders I failed to punish (up to `max`).
 */
export function guideSteps(game, max = 5) {
  const an = game.analysis;
  if (!an || !game.userColor) return [];
  const missed = new Set(punishments(game).missed.map((m) => m.ply));
  const mine = an.moves
    .map((m, ply) => ({ ...m, ply }))
    .filter((m) => isMine(game, m.ply) && (BAD(m) || missed.has(m.ply)))
    .sort((a, b) => b.loss - a.loss)
    .slice(0, max)
    .sort((a, b) => a.ply - b.ply);
  return mine.map((m) => ({ ply: m.ply, kind: missed.has(m.ply) ? 'punish' : 'mistake', cls: m.cls, loss: m.loss, tags: m.tags, text: m.text, bestSan: m.bestSan }));
}

/** What the game teaches: my mistake tags grouped into practice themes. */
export function lessonsOf(game) {
  const an = game.analysis;
  if (!an || !game.userColor) return [];
  const by = {};
  an.moves.forEach((m, ply) => {
    if (!isMine(game, ply) || !BAD(m)) return;
    for (const t of m.tags) {
      const theme = TAG_THEME[t];
      if (!theme) continue;
      const r = (by[theme] = by[theme] || { theme, count: 0, labels: new Set() });
      r.count++;
      if (TAG_LABEL[t]) r.labels.add(TAG_LABEL[t]);
    }
  });
  return Object.values(by)
    .map((r) => ({ ...r, labels: [...r.labels] }))
    .sort((a, b) => b.count - a.count);
}

/**
 * The threat I didn't see: what the opponent would play if it were their move
 * in the position before my move. Returns { uci, from, to, san, text } or null.
 */
export async function threatBefore(fen, mover, { signal } = {}) {
  const f = withTurn(fen, opp(mover));
  if (!f) return null;
  const r = await engines.analyst.analyse(f, { depth: 11, movetime: 700, signal }).catch(() => null);
  if (!r || !r.best || !r.lines[0]) return null;
  const c = new Chess(f);
  const m = playUci(c, r.best);
  if (!m) return null;
  const line = r.lines[0];
  const them = sideName(opp(mover));
  if (line.mate != null && line.mate > 0) return { uci: r.best, from: m.from, to: m.to, san: m.san, text: `${them} was threatening ${m.san}${line.mate === 1 ? ' — checkmate' : `, with mate in ${line.mate}`}.` };
  const swing = materialSwing(f, line.pv || [r.best], opp(mover));
  if (swing.net >= 1) {
    const what = m.captured && swing.net >= VALUE[m.captured] - 0.5 ? `your ${PIECE_NAME[m.captured]}` : describeLoss(swing.won, swing.lost, swing.net);
    return { uci: r.best, from: m.from, to: m.to, san: m.san, text: `${them} was threatening ${m.san}, winning ${what}.` };
  }
  return null;
}
