// Tactical motif detection on top of chess.js: exchanges, hanging pieces,
// forks, pins, skewers, discovered attacks and two mating patterns.
// Used by the review explanations, mistake tagging and the puzzle build script.
import { Chess } from 'chess.js';
import { VALUE, opp, kingSquare, playUci, withTurn } from './chessx.js';

const FILES = 'abcdefgh';
export const sqToXY = (sq) => [sq.charCodeAt(0) - 97, sq.charCodeAt(1) - 49];
export const xyToSq = (x, y) => (x < 0 || x > 7 || y < 0 || y > 7 ? null : FILES[x] + (y + 1));

const DIAG = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const ORTH = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const KNIGHT = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];
const RAYS = { b: DIAG, r: ORTH, q: [...DIAG, ...ORTH] };

/** Squares the piece on `sq` attacks or defends (sliders stop at the first piece). */
export function attacksFrom(chess, sq) {
  const p = chess.get(sq);
  if (!p) return [];
  const [x, y] = sqToXY(sq);
  const out = [];
  if (p.type === 'p') {
    const dy = p.color === 'w' ? 1 : -1;
    for (const dx of [-1, 1]) {
      const t = xyToSq(x + dx, y + dy);
      if (t) out.push(t);
    }
  } else if (p.type === 'n' || p.type === 'k') {
    for (const [dx, dy] of p.type === 'n' ? KNIGHT : RAYS.q) {
      const t = xyToSq(x + dx, y + dy);
      if (t) out.push(t);
    }
  } else {
    for (const [dx, dy] of RAYS[p.type]) {
      let cx = x + dx;
      let cy = y + dy;
      let t;
      while ((t = xyToSq(cx, cy))) {
        out.push(t);
        if (chess.get(t)) break;
        cx += dx;
        cy += dy;
      }
    }
  }
  return out;
}

/** Static exchange evaluation: material the side to move nets by capturing on `sq` (never below 0). */
export function see(chess, sq, depth = 0) {
  if (depth > 12) return 0;
  const caps = chess.moves({ verbose: true }).filter((m) => m.to === sq && m.captured && !m.flags.includes('e'));
  if (!caps.length) return 0;
  caps.sort((a, b) => VALUE[a.piece] - VALUE[b.piece]);
  const m = caps[0];
  const gain = VALUE[m.captured] + (m.promotion ? VALUE[m.promotion] - 1 : 0);
  chess.move(m);
  const reply = see(chess, sq, depth + 1);
  chess.undo();
  return Math.max(0, gain - reply);
}

/** Net material of one specific capture, assuming best recaptures on that square. */
export function seeMove(chess, move) {
  const m = playUci(chess, move.from + move.to + (move.promotion || ''));
  if (!m) return 0;
  const gain = (m.captured ? VALUE[m.captured] : 0) + (m.promotion ? VALUE[m.promotion] - 1 : 0);
  const reply = see(chess, m.to);
  chess.undo();
  return gain - reply;
}

/** Enemy pieces the side to move can win material on right now, biggest first. */
export function hanging(chess) {
  const them = opp(chess.turn());
  const out = [];
  const seen = new Set();
  for (const m of chess.moves({ verbose: true })) {
    if (!m.captured || m.flags.includes('e') || seen.has(m.to)) continue;
    seen.add(m.to);
    const p = chess.get(m.to);
    if (!p || p.color !== them || p.type === 'k') continue;
    const gain = see(chess, m.to);
    if (gain > 0) out.push({ square: m.to, piece: p.type, gain });
  }
  return out.sort((a, b) => b.gain - a.gain);
}

/** What `color`'s opponent could win if it were their move in this position. */
export function threatsAgainst(fen, color) {
  const f = withTurn(fen, opp(color));
  if (!f) return [];
  return hanging(new Chess(f));
}

const defended = (chess, sq, color) => chess.attackers(sq, color).length > 0;

/**
 * Pieces forked by the piece standing on `sq` (call with the opponent to move).
 * A target counts if it is the king, worth more than the forking piece, or undefended.
 */
export function forkTargets(chess, sq) {
  const p = chess.get(sq);
  if (!p) return [];
  const targets = [];
  for (const t of attacksFrom(chess, sq)) {
    const q = chess.get(t);
    if (!q || q.color === p.color) continue;
    if (q.type === 'k') targets.push({ square: t, piece: 'k' });
    else if (q.type !== 'p' && (VALUE[q.type] > VALUE[p.type] || !defended(chess, t, q.color))) targets.push({ square: t, piece: q.type });
  }
  return targets;
}

/** True fork: two or more targets and the forking piece cannot simply be captured for profit. */
export function isFork(chess, sq) {
  const targets = forkTargets(chess, sq);
  if (targets.length < 2) return null;
  const p = chess.get(sq);
  if (chess.turn() !== p.color && see(chess, sq) > 0) return null;
  return targets;
}

/** For a slider on `sq`: enemy piece pairs lined up on one of its rays. */
export function lineUps(chess, sq) {
  const p = chess.get(sq);
  if (!p || !RAYS[p.type]) return [];
  const [x, y] = sqToXY(sq);
  const out = [];
  for (const [dx, dy] of RAYS[p.type]) {
    let cx = x + dx;
    let cy = y + dy;
    let front = null;
    let t;
    while ((t = xyToSq(cx, cy))) {
      const q = chess.get(t);
      if (q) {
        if (q.color === p.color) break;
        if (!front) front = { square: t, piece: q.type };
        else {
          out.push({ front, back: { square: t, piece: q.type } });
          break;
        }
      }
      cx += dx;
      cy += dy;
    }
  }
  return out;
}

/** Pins created by the slider on `sq`: a piece shielding something more valuable behind it. */
export function pinsFrom(chess, sq) {
  const p = chess.get(sq);
  if (!p) return [];
  return lineUps(chess, sq).filter(({ front, back }) => {
    if (front.piece === 'p' || front.piece === 'k') return false;
    if (back.piece === 'k') return true;
    return VALUE[back.piece] > VALUE[front.piece] && (VALUE[back.piece] > VALUE[p.type] || !defended(chess, back.square, opp(p.color)));
  });
}

/** Skewers created by the slider on `sq`: a valuable piece in front must move and expose the one behind. */
export function skewersFrom(chess, sq) {
  const p = chess.get(sq);
  if (!p) return [];
  return lineUps(chess, sq).filter(({ front, back }) => {
    if (back.piece === 'p' || back.piece === 'k') return false;
    const frontBig = front.piece === 'k' || VALUE[front.piece] > VALUE[p.type];
    const backLoose = VALUE[back.piece] > VALUE[p.type] || !defended(chess, back.square, opp(p.color));
    return frontBig && VALUE[front.piece] > VALUE[back.piece] && backLoose;
  });
}

/**
 * Discovered attacks unveiled by a move that has just been played on `chess`
 * (pass the verbose move). Returns [{ slider, target }] for worthwhile targets.
 */
export function discoveredAttacks(chess, move) {
  const us = move.color;
  const [fx, fy] = sqToXY(move.from);
  const out = [];
  for (const [dx, dy] of RAYS.q) {
    // Walk from the vacated square in one direction to find a friendly slider…
    let cx = fx + dx;
    let cy = fy + dy;
    let t;
    let slider = null;
    while ((t = xyToSq(cx, cy))) {
      const q = chess.get(t);
      if (q) {
        const diag = dx !== 0 && dy !== 0;
        if (q.color === us && t !== move.to && (q.type === 'q' || q.type === (diag ? 'b' : 'r'))) slider = { square: t, piece: q.type };
        break;
      }
      cx += dx;
      cy += dy;
    }
    if (!slider) continue;
    // …then the opposite direction to find what it now hits.
    cx = fx - dx;
    cy = fy - dy;
    while ((t = xyToSq(cx, cy))) {
      const q = chess.get(t);
      if (q) {
        if (q.color !== us && q.type !== 'p') {
          const worth = q.type === 'k' || VALUE[q.type] > VALUE[slider.piece] || !defended(chess, t, q.color);
          if (worth) out.push({ slider, target: { square: t, piece: q.type } });
        }
        break;
      }
      cx -= dx;
      cy -= dy;
    }
  }
  return out;
}

/** Name the mating pattern in a checkmated position, if it is one we recognise. */
export function matePattern(chess) {
  if (!chess.isCheckmate()) return null;
  const loser = chess.turn();
  const k = kingSquare(chess, loser);
  const [kx, ky] = sqToXY(k);
  const checkers = chess.attackers(k, opp(loser));
  const around = [];
  for (const [dx, dy] of RAYS.q) {
    const t = xyToSq(kx + dx, ky + dy);
    if (t) around.push(t);
  }
  const own = (t) => {
    const q = chess.get(t);
    return q && q.color === loser;
  };
  if (checkers.length === 1 && chess.get(checkers[0]).type === 'n' && around.every(own)) return 'smothered';
  const backRank = loser === 'w' ? 0 : 7;
  if (ky === backRank && checkers.length === 1) {
    const c = chess.get(checkers[0]);
    const [, cy] = sqToXY(checkers[0]);
    const fwd = loser === 'w' ? 1 : -1;
    const front = [-1, 0, 1].map((dx) => xyToSq(kx + dx, ky + fwd)).filter(Boolean);
    if ((c.type === 'r' || c.type === 'q') && cy === backRank && front.length && front.every(own)) return 'backRank';
  }
  return null;
}

/**
 * Tag a verified puzzle line (solver moves at even indexes) with themes.
 * Purely descriptive: the engine decides whether the line is correct.
 */
export function classifyLine(fen, line) {
  const chess = new Chess(fen);
  const solver = chess.turn();
  const themes = new Set();
  const pending = []; // motifs waiting for the follow-up capture that proves them
  const startBalance = balanceOf(chess, solver);
  for (let i = 0; i < line.length; i++) {
    const mine = i % 2 === 0;
    const before = mine && i === 0 ? new Chess(chess.fen()) : null;
    const m = playUci(chess, line[i]);
    if (!m) return { themes: [], ok: false };
    if (!mine) {
      for (const pnd of pending) {
        if (pnd.theme !== 'pin') continue;
        const holder = chess.get(pnd.holder);
        if (!holder || holder.color !== solver) pnd.alive = false;
      }
      continue;
    }
    const moveNo = i / 2 + 1;
    if (m.promotion) themes.add('promotion');
    if (chess.isCheckmate()) {
      themes.add('mate');
      themes.add(moveNo === 1 ? 'mateIn1' : moveNo === 2 ? 'mateIn2' : 'mateIn3');
      const pat = matePattern(chess);
      if (pat) themes.add(pat);
      continue;
    }
    // Confirm earlier motifs only when this move cashes in on them in the way the
    // motif promises (the forking piece takes a forked piece, and so on).
    for (const pnd of pending) {
      if (!m.captured) continue;
      const hit = pnd.squares.includes(m.to);
      if (pnd.theme === 'fork' || pnd.theme === 'skewer') {
        if (hit && m.from === pnd.by) themes.add(pnd.theme);
      } else if (pnd.theme === 'pin') {
        if (hit && pnd.alive) themes.add('pin');
      } else if (pnd.theme === 'discoveredAttack') {
        if ((hit && m.from === pnd.slider) || (pnd.check && m.from === pnd.by)) themes.add('discoveredAttack');
      }
    }
    const last = i + 2 >= line.length;
    const fork = isFork(chess, m.to);
    if (fork) {
      if (last && line.length === 1) themes.add('fork');
      pending.push({ theme: 'fork', squares: fork.filter((t) => t.piece !== 'k').map((t) => t.square), by: m.to });
    }
    const disc = discoveredAttacks(chess, m);
    if (disc.length) {
      const check = disc.some((d) => d.target.piece === 'k');
      if (check && chess.attackers(kingSquare(chess, opp(solver)), solver).length > 1) themes.add('doubleCheck');
      for (const d of disc) pending.push({ theme: 'discoveredAttack', squares: [d.target.square], slider: d.slider.square, by: m.to, check });
    }
    for (const pin of pinsFrom(chess, m.to)) pending.push({ theme: 'pin', squares: [pin.front.square], holder: m.to, alive: true });
    for (const sk of skewersFrom(chess, m.to)) pending.push({ theme: 'skewer', squares: [sk.back.square], by: m.to });
    if (i === 0 && before) {
      if (m.captured && !themes.size && seeMove(before, m) >= VALUE[m.captured] && VALUE[m.captured] >= 3) themes.add('hangingPiece');
      // A sacrifice: the piece we just moved can be taken at a material loss for us.
      if (m.piece !== 'p' && m.piece !== 'k' && see(chess, m.to) - (m.captured ? VALUE[m.captured] : 0) >= 2) {
        const reply = line[1];
        if (reply && reply.slice(2, 4) === m.to) themes.add('sacrifice');
      }
    }
  }
  // Exploiting a pin that already exists: winning a piece that cannot move away.
  const gained = balanceOf(chess, solver) - startBalance;
  return { themes: [...themes], ok: true, gained, mate: themes.has('mate') };
}

function balanceOf(chess, color) {
  let s = 0;
  for (const row of chess.board()) for (const p of row) if (p && p.type !== 'k') s += (p.color === color ? 1 : -1) * VALUE[p.type];
  return s;
}
