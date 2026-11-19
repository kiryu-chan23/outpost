// Turns an engine verdict into a short plain-English reason when the position
// supports one: a piece left hanging, a fork allowed or missed, a mate, a pin…
// When no simple reason fits, it says so and points at the variation instead of
// inventing a story.
import { Chess } from 'chess.js';
import { VALUE, PIECE_NAME, opp, sideName, playUci, turnOf, sanLineText } from './chessx.js';
import { attacksFrom, seeMove, threatsAgainst, isFork, pinsFrom, skewersFrom, discoveredAttacks, sqToXY } from './motifs.js';

const balanceFor = (chess, color) => {
  let s = 0;
  for (const row of chess.board()) for (const p of row) if (p && p.type !== 'k') s += (p.color === color ? 1 : -1) * VALUE[p.type];
  return s;
};

/**
 * Follow a principal variation until it goes quiet and report the material
 * change for `color`: { net, lost: [types], won: [types], plies }.
 */
export function materialSwing(fen, pv, color, maxPlies = 8) {
  const chess = new Chess(fen);
  const start = balanceFor(chess, color);
  const lost = [];
  const won = [];
  let quiet = 0;
  let plies = 0;
  for (const uci of pv.slice(0, maxPlies)) {
    const m = playUci(chess, uci);
    if (!m) break;
    plies++;
    if (m.captured) (m.color === color ? won : lost).push(m.captured);
    if (m.promotion) (m.color === color ? won : lost).push('promotion');
    quiet = m.captured || chess.inCheck() || m.promotion ? 0 : quiet + 1;
    if (quiet >= 2 && plies >= 2) break;
  }
  return { net: balanceFor(chess, color) - start, lost, won, plies };
}

const a = (name) => (/^[aeiou]/.test(name) ? `an ${name}` : `a ${name}`);

/** "a knight", "the exchange", "two pawns", "your queen for a rook"… from a swing where `lost` outweighs `won`. */
export function describeLoss(lost, won, net) {
  // Cancel pieces that were simply traded off (a bishop for a knight counts as even).
  const key = (t) => (t === 'b' ? 'n' : t);
  const L = lost.filter((t) => t !== 'promotion');
  const W = [];
  let traded = false;
  for (const t of won.filter((x) => x !== 'promotion')) {
    const i = L.findIndex((x) => key(x) === key(t));
    if (i >= 0) {
      L.splice(i, 1);
      traded = true;
    } else W.push(t);
  }
  const n = Math.abs(net);
  if (L.length === 1 && !W.length) return traded && (L[0] === 'n' || L[0] === 'b') ? 'a piece' : a(PIECE_NAME[L[0]]);
  if (L.length && !W.length && L.every((t) => t === 'p')) return L.length === 2 ? 'two pawns' : `${L.length} pawns`;
  if (L.length === 1 && W.length === 1 && L[0] === 'r' && (W[0] === 'n' || W[0] === 'b')) return 'the exchange (a rook for a minor piece)';
  if (L.length === 1 && W.length === 1 && VALUE[L[0]] > VALUE[W[0]]) return `${a(PIECE_NAME[L[0]])} for ${a(PIECE_NAME[W[0]])}`;
  if (L.includes('q') && n >= 3) return W.length ? `the queen for ${W.map((t) => a(PIECE_NAME[t])).join(' and ')}` : 'the queen';
  if (n === 1) return 'a pawn';
  if (n === 2) return 'two pawns’ worth of material';
  if (n === 3) return 'a piece';
  if (n === 5) return 'a rook';
  return `material (about ${n} points)`;
}

const between = (from, mid, to) => {
  const [ax, ay] = sqToXY(from);
  const [bx, by] = sqToXY(to);
  const [mx, my] = sqToXY(mid);
  const dx = Math.sign(bx - ax);
  const dy = Math.sign(by - ay);
  if (!((ax === bx || ay === by || Math.abs(ax - bx) === Math.abs(ay - by)) && (dx || dy))) return false;
  let x = ax + dx;
  let y = ay + dy;
  while (x !== bx || y !== by) {
    if (x === mx && y === my) return true;
    x += dx;
    y += dy;
  }
  return false;
};

function listTargets(targets, ownWord) {
  const names = targets.slice(0, 3).map((t) => `${ownWord} ${PIECE_NAME[t.piece]}`);
  return names.length === 2 ? names.join(' and ') : names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
}

/**
 * Does the first move of `pv` set up a fork, skewer, pin or discovered attack
 * that the same side then cashes in on within the line? Only then do we name it.
 */
export function verifiedMotif(fen, pv) {
  const c = new Chess(fen);
  const m0 = playUci(c, pv[0]);
  if (!m0) return null;
  const cashesOn = (squares) => {
    const d = new Chess(c.fen());
    for (let i = 1; i < Math.min(pv.length, 7); i++) {
      const m = playUci(d, pv[i]);
      if (!m) break;
      if (i % 2 === 0 && m.captured && squares.includes(m.to)) return true;
    }
    return false;
  };
  const fork = isFork(c, m0.to);
  if (fork && cashesOn(fork.filter((t) => t.piece !== 'k').map((t) => t.square))) return { kind: 'fork', move: m0, targets: fork };
  const sk = skewersFrom(c, m0.to).find((x) => cashesOn([x.back.square]));
  if (sk) return { kind: 'skewer', move: m0, front: sk.front, back: sk.back };
  const pin = pinsFrom(c, m0.to).find((x) => cashesOn([x.front.square]));
  if (pin) return { kind: 'pin', move: m0, front: pin.front, back: pin.back };
  const disc = discoveredAttacks(c, m0).find((x) => x.target.piece !== 'k' && cashesOn([x.target.square]));
  if (disc) return { kind: 'discovery', move: m0, slider: disc.slider, target: disc.target };
  return null;
}

/**
 * Explain a move.
 *   fenBefore / fenAfter  positions around the move
 *   played                { uci, san, from, to, piece, captured }
 *   before / after        engine results for those positions, scores from the mover's side
 *                         ({ cp, mate, pv }) — `after` is negated so both read "good for mover = positive"
 *   voice                 'you' when the mover is the user, otherwise 'they'
 * Returns { text, tags, line, lineFen, bestSan }.
 */
export function explainMove({ fenBefore, fenAfter, played, before, after, voice = 'you' }) {
  const mover = turnOf(fenBefore);
  const pos0 = new Chess(fenBefore);
  const pos1 = new Chess(fenAfter);
  const you = voice === 'you';
  const Own = you ? 'Your' : `${sideName(mover)}’s`;
  const own = you ? 'your' : `${sideName(mover)}’s`;
  const Subject = you ? 'You' : sideName(mover);
  const their = you ? 'the' : `${sideName(opp(mover))}’s`;
  const tags = [];
  const bestUci = before?.pv?.[0] || null;
  const bestPv = before?.pv || [];
  const refPv = after?.pv || [];
  const san1 = (fen, uci) => {
    const c = new Chess(fen);
    const m = playUci(c, uci);
    return m ? m.san : uci;
  };
  const bestSan = bestUci ? san1(fenBefore, bestUci) : null;
  const playedBest = bestUci === played.uci;

  // ---- A. What does the move allow? -----------------------------------------
  let allow = null;
  const mateAgainst = after && after.mate != null && after.mate < 0 && !(before && before.mate != null && before.mate < 0);
  if (mateAgainst) {
    const n = -after.mate;
    allow = {
      text: n === 1 ? `This allows checkmate in one: ${san1(fenAfter, refPv[0])}.` : n <= 3 && refPv.length >= n * 2 - 1 ? `This allows a forced checkmate in ${n}: ${sanLineText(fenAfter, refPv, n * 2 - 1)}.` : `This allows a forced checkmate in ${n}.`,
      tag: 'allowed-mate',
      line: refPv,
    };
  } else if (refPv.length) {
    const swing = materialSwing(fenAfter, refPv, mover);
    const r0 = playUci(new Chess(fenAfter), refPv[0]);
    if (r0 && swing.net <= -1) {
      const what = describeLoss(swing.lost, swing.won, swing.net);
      const direct = r0.captured ? seeMove(new Chess(fenAfter), r0) : 0;
      // A "clean" capture: the mover never wins anything bigger back along the way.
      const clean = r0.captured && swing.won.every((t) => t !== 'promotion' && VALUE[t] <= VALUE[r0.captured]);
      const more = -swing.net - direct >= 2 ? ` More follows: ${sanLineText(fenAfter, refPv, Math.min(6, swing.plies))}.` : '';
      if (r0.captured && direct >= 1 && clean) {
        const victim = PIECE_NAME[r0.captured];
        const what = more ? `the ${victim}` : direct === VALUE[r0.captured] ? `the ${victim}` : describeLoss(swing.lost, swing.won, swing.net);
        if (r0.to === played.to) {
          const guards = pos1.attackers(played.to, mover).length;
          allow = {
            text: guards
              ? `${Own} ${victim} isn’t safe on ${played.to}: ${r0.san} wins ${direct === VALUE[r0.captured] ? `the ${victim}` : describeLoss(swing.lost, swing.won, swing.net)}.${more}`
              : `This puts ${own} ${victim} on ${played.to}, where it can simply be taken (${r0.san}).${more}`,
            tag: 'hung-piece',
          };
        } else {
          const already = threatsAgainst(fenBefore, mover).some((t) => t.square === r0.to);
          const wasGuard = attacksFrom(pos0, played.from).includes(r0.to);
          const opened = 'brq'.includes(r0.piece) && between(r0.from, played.from, r0.to);
          let text;
          if (already) text = `${Own} ${victim} on ${r0.to} was already under attack, and this move doesn’t deal with it — ${r0.san} wins ${what}.`;
          else if (opened) text = `Moving the ${PIECE_NAME[played.piece]} opens the line to ${own} ${victim} on ${r0.to}: ${r0.san} wins ${what}.`;
          else if (wasGuard) text = `This move leaves ${own} ${victim} on ${r0.to} undefended — the ${PIECE_NAME[played.piece]} was guarding it — so ${r0.san} wins ${what}.`;
          else text = `This leaves ${own} ${victim} on ${r0.to} hanging: ${r0.san} wins ${what}.`;
          allow = { text: text + more, tag: 'hung-piece' };
        }
      } else if (r0.captured) {
        // An even first capture: does something drop off after the trade?
        const c = new Chess(fenAfter);
        playUci(c, refPv[0]);
        const r1 = refPv[1] ? playUci(c, refPv[1]) : null;
        const r2 = r1 && refPv[2] ? playUci(c, refPv[2]) : null;
        if (r1 && r1.to === r0.to && r1.captured && r2 && r2.captured) {
          allow = {
            text: `After the trade on ${r0.to} (${sanLineText(fenAfter, refPv, 3)}), ${own} ${PIECE_NAME[r2.captured]} on ${r2.to} is left undefended and ${Subject === 'You' ? 'you lose' : `${Subject} loses`} ${what}.`,
            tag: 'trade-error',
          };
        }
      }
      if (!allow) {
        const mo = !r0.captured || clean ? verifiedMotif(fenAfter, refPv) : null;
        const lose = Subject === 'You' ? 'you lose' : `${Subject} loses`;
        if (mo?.kind === 'fork') allow = { text: `This allows ${r0.san}, a fork: the ${PIECE_NAME[r0.piece]} attacks ${listTargets(mo.targets, own)} at the same time, and ${lose} ${what}.`, tag: 'allowed-fork' };
        else if (mo?.kind === 'skewer') allow = { text: `This allows ${r0.san}, a skewer: ${own} ${PIECE_NAME[mo.front.piece]} has to move and the ${PIECE_NAME[mo.back.piece]} behind it is lost.`, tag: 'allowed-skewer' };
        else if (mo?.kind === 'pin') allow = { text: `This allows ${r0.san}, pinning ${own} ${PIECE_NAME[mo.front.piece]} to ${own} ${PIECE_NAME[mo.back.piece]} — it costs ${what}.`, tag: 'allowed-pin' };
        else if (mo?.kind === 'discovery') allow = { text: `This allows ${r0.san}, which uncovers an attack on ${own} ${PIECE_NAME[mo.target.piece]} from the ${PIECE_NAME[mo.slider.piece]} and wins ${what}.`, tag: 'allowed-discovery' };
        else allow = { text: `This loses ${what} by force: ${sanLineText(fenAfter, refPv, Math.min(7, swing.plies))}.`, tag: 'lost-material' };
      }
      allow.line = refPv;
    }
  }

  // ---- B. What did the best move offer? ----------------------------------------
  let missed = null;
  if (bestUci && !playedBest) {
    const hadMate = before.mate != null && before.mate > 0 && !(after && after.mate != null && after.mate > 0);
    if (hadMate) {
      const n = before.mate;
      missed = { text: `${Subject} had checkmate in ${n === 1 ? 'one' : n}: ${sanLineText(fenBefore, bestPv, n * 2 - 1)}.`, tag: 'missed-mate' };
    } else {
      const gain = materialSwing(fenBefore, bestPv, mover);
      const b0 = playUci(new Chess(fenBefore), bestUci);
      if (b0 && gain.net >= 1) {
        const what = describeLoss(gain.won, gain.lost, gain.net);
        const direct = b0.captured ? seeMove(new Chess(fenBefore), b0) : 0;
        const cleanB = b0.captured && gain.lost.every((t) => t !== 'promotion' && VALUE[t] <= VALUE[b0.captured]);
        const mo = !b0.captured || cleanB ? verifiedMotif(fenBefore, bestPv) : null;
        if (b0.captured && direct >= 1 && cleanB) {
          const free = pos0.attackers(b0.to, opp(mover)).length === 0;
          const prize = direct === VALUE[b0.captured] ? a(PIECE_NAME[b0.captured]) : what;
          missed = { text: `${Subject} could have won ${prize} with ${b0.san}${free ? ` — ${their} ${PIECE_NAME[b0.captured]} on ${b0.to} was undefended` : ''}.`, tag: 'missed-capture' };
        } else if (mo?.kind === 'fork') missed = { text: `${Subject} missed a fork: ${b0.san} attacks ${listTargets(mo.targets, 'the')} at once and wins ${what}.`, tag: 'missed-fork' };
        else if (mo?.kind === 'skewer') missed = { text: `${Subject} missed a skewer: ${b0.san} forces the ${PIECE_NAME[mo.front.piece]} away and wins the ${PIECE_NAME[mo.back.piece]} behind it.`, tag: 'missed-skewer' };
        else if (mo?.kind === 'pin') missed = { text: `${Subject} missed ${b0.san}, pinning the ${PIECE_NAME[mo.front.piece]} to the ${PIECE_NAME[mo.back.piece]} and winning ${what}.`, tag: 'missed-pin' };
        else if (mo?.kind === 'discovery') missed = { text: `${Subject} missed a discovered attack: ${b0.san} unveils the ${PIECE_NAME[mo.slider.piece]} against the ${PIECE_NAME[mo.target.piece]} and wins ${what}.`, tag: 'missed-discovery' };
        else missed = { text: `${b0.san} would have won ${what}: ${sanLineText(fenBefore, bestPv, Math.min(7, gain.plies))}.`, tag: 'missed-win' };
      }
    }
  }

  // ---- compose ---------------------------------------------------------------------
  let text;
  let line = bestPv;
  let lineFen = fenBefore;
  if (allow) {
    tags.push(allow.tag);
    text = allow.text;
    line = allow.line || refPv;
    lineFen = fenAfter;
    if (missed && missed.tag !== 'missed-win') {
      tags.push(missed.tag);
      text += ' ' + missed.text;
    } else if (bestSan) text += ` Better was ${bestSan}.`;
  } else if (missed) {
    tags.push(missed.tag);
    text = missed.text;
  } else if (bestSan && !playedBest) {
    tags.push('positional');
    text = `${bestSan} was stronger. No single tactic explains the gap — the difference only shows up in the line, so play through it below.`;
  } else {
    text = '';
  }
  return { text, tags, line, lineFen, bestSan };
}

/** Which practice theme helps with a given mistake tag. */
export const TAG_THEME = {
  'hung-piece': 'hangingPiece',
  'missed-capture': 'hangingPiece',
  'lost-material': 'hangingPiece',
  'trade-error': 'hangingPiece',
  'allowed-fork': 'fork',
  'missed-fork': 'fork',
  'allowed-pin': 'pin',
  'missed-pin': 'pin',
  'allowed-skewer': 'skewer',
  'missed-skewer': 'skewer',
  'allowed-discovery': 'discoveredAttack',
  'missed-discovery': 'discoveredAttack',
  'allowed-mate': 'mate',
  'missed-mate': 'mate',
};
export const TAG_LABEL = {
  'hung-piece': 'Left a piece hanging',
  'missed-capture': 'Missed a free capture',
  'lost-material': 'Lost material by force',
  'trade-error': 'Miscounted a trade',
  'allowed-fork': 'Walked into a fork',
  'missed-fork': 'Missed a fork',
  'allowed-pin': 'Walked into a pin',
  'missed-pin': 'Missed a pin',
  'allowed-skewer': 'Walked into a skewer',
  'missed-skewer': 'Missed a skewer',
  'allowed-discovery': 'Allowed a discovered attack',
  'missed-discovery': 'Missed a discovered attack',
  'allowed-mate': 'Allowed a checkmate',
  'missed-mate': 'Missed a checkmate',
  'missed-win': 'Missed a winning line',
  positional: 'Positional slip',
};
