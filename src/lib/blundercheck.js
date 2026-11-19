// Blunder check: before each move you mark what of yours is in danger.
// The "truth" is computed without the engine: pieces the opponent could win
// right now by static exchange (worth at least a minor piece), plus whether
// they threaten mate in one.
import { Chess } from 'chess.js';
import { hanging } from './motifs.js';
import { withTurn, opp, PIECE_NAME } from './chessx.js';

const MIN_GAIN = 2; // ignore loose pawns: the scan is about pieces

/** What `color` actually has in danger in this position (it's `color`'s move). */
export function scanTruth(fen, color) {
  const f = withTurn(fen, opp(color));
  if (!f) return { squares: [], pieces: [], mate: false };
  const c = new Chess(f);
  const loose = hanging(c).filter((h) => h.gain >= MIN_GAIN);
  const mate = c.moves({ verbose: true }).some((m) => {
    const d = new Chess(f);
    d.move(m);
    return d.isCheckmate();
  });
  return { squares: loose.map((h) => h.square).sort(), pieces: loose.map((h) => ({ square: h.square, piece: h.piece })), mate };
}

export function judgeScan(truth, marked, mateMarked) {
  const m = [...marked].sort();
  const missed = truth.pieces.filter((p) => !m.includes(p.square));
  const extra = m.filter((sq) => !truth.squares.includes(sq));
  const ok = !missed.length && !extra.length && !!mateMarked === truth.mate;
  return { ok, missed, extra, mateMissed: truth.mate && !mateMarked, mateExtra: !truth.mate && !!mateMarked };
}

const name = (p) => `${PIECE_NAME[p.piece]} on ${p.square}`;
export function scanFeedback(truth, verdict, chess) {
  if (verdict.ok) {
    if (!truth.pieces.length && !truth.mate) return 'Right — nothing of yours is in danger. Now pick your move.';
    const bits = truth.pieces.map(name);
    if (truth.mate) bits.push('a mate threat');
    return `Right — ${bits.join(' and ')}. Deal with it in your move.`;
  }
  const out = [];
  if (verdict.missed.length) out.push(`You missed: your ${verdict.missed.map(name).join(', ')} can be won.`);
  if (verdict.mateMissed) out.push('You missed a mate-in-one threat.');
  if (verdict.extra.length) {
    const ps = verdict.extra.map((sq) => {
      const p = chess.get(sq);
      return p ? `${PIECE_NAME[p.type]} on ${sq}` : sq;
    });
    out.push(`Not actually in danger: ${ps.join(', ')} (defended well enough, or not attacked).`);
  }
  if (verdict.mateExtra) out.push('There’s no mate threat right now.');
  return out.join(' ');
}

/** After my move (opponent to move): did I leave material or mate on the board? */
export function hungAfter(fenAfter, myColor, capturedValue = 0) {
  const c = new Chess(fenAfter);
  if (c.isGameOver()) return null;
  // A capture I just made pays for some of it: trading a bishop for a knight isn't a blunder.
  const loose = hanging(c).filter((h) => h.gain - capturedValue >= MIN_GAIN);
  const mate = c.moves({ verbose: true }).some((m) => {
    const d = new Chess(fenAfter);
    d.move(m);
    return d.isCheckmate();
  });
  if (mate) return { kind: 'mate' };
  if (loose.length) return { kind: 'piece', square: loose[0].square, piece: loose[0].piece, gain: loose[0].gain, color: myColor };
  return null;
}

/** Summary over a game's checks: { scans, right, hung, hungAfterWrong }. */
export function scanSummary(checks) {
  const list = checks || [];
  return {
    scans: list.length,
    right: list.filter((c) => c.ok).length,
    hung: list.filter((c) => c.hung).length,
    hungAfterWrong: list.filter((c) => c.hung && !c.ok).length,
  };
}
