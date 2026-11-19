// Small helpers around chess.js. All rules (legality, check, draws, PGN) come
// from chess.js; nothing here re-implements them.
import { Chess, validateFen, DEFAULT_POSITION } from 'chess.js';

export { Chess, validateFen };
export const START_FEN = DEFAULT_POSITION;
export const VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };
export const PIECE_NAME = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
export const ROLE = PIECE_NAME;
export const opp = (c) => (c === 'w' ? 'b' : 'w');
export const sideName = (c) => (c === 'w' ? 'White' : 'Black');
export const cgColor = (c) => (c === 'w' ? 'white' : 'black');
export const turnOf = (fen) => fen.split(' ')[1];
export const fullmoveOf = (fen) => parseInt(fen.split(' ')[5], 10) || 1;

export function uciToMove(uci) {
  return { from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || undefined };
}
export const moveToUci = (m) => m.from + m.to + (m.promotion || '');

/** Play a UCI move on a Chess instance. Returns the verbose move, or null if illegal. */
export function playUci(chess, uci) {
  try {
    return chess.move(uciToMove(uci));
  } catch {
    return null;
  }
}
/** Play SAN (or a {from,to,promotion} object). Returns the move or null if illegal. */
export function playSan(chess, san) {
  try {
    return chess.move(san);
  } catch {
    return null;
  }
}

/** Legal destinations for chessground: Map<from, to[]>. */
export function legalDests(chess) {
  const dests = new Map();
  for (const m of chess.moves({ verbose: true })) {
    if (!dests.has(m.from)) dests.set(m.from, []);
    if (!dests.get(m.from).includes(m.to)) dests.get(m.from).push(m.to);
  }
  return dests;
}

export function isPromotion(chess, from, to) {
  const p = chess.get(from);
  if (!p || p.type !== 'p') return false;
  if ((p.color === 'w' && to[1] !== '8') || (p.color === 'b' && to[1] !== '1')) return false;
  return chess.moves({ verbose: true, square: from }).some((m) => m.to === to && m.promotion);
}

export function material(chess) {
  const out = { w: 0, b: 0 };
  for (const row of chess.board()) for (const p of row) if (p && p.type !== 'k') out[p.color] += VALUE[p.type];
  return out;
}
/** Material balance from `color`'s point of view. */
export const balance = (chess, color) => {
  const m = material(chess);
  return m[color] - m[opp(color)];
};

export function kingSquare(chess, color) {
  return chess.findPiece({ type: 'k', color })[0];
}

/**
 * Turn a UCI line into SAN tokens with move numbers, e.g. ["12…", "Nf6", "13.", "Bg5"].
 * Stops silently at the first illegal move (engine lines can be truncated).
 */
export function sanLine(fen, ucis, max = 99) {
  const chess = new Chess(fen);
  const out = [];
  let first = true;
  for (const uci of ucis.slice(0, max)) {
    const turn = chess.turn();
    const num = chess.moveNumber();
    const m = playUci(chess, uci);
    if (!m) break;
    out.push({ san: m.san, uci, label: turn === 'w' ? `${num}.` : first ? `${num}…` : '', color: turn, fen: chess.fen() });
    first = false;
  }
  return out;
}
export function sanLineText(fen, ucis, max = 99) {
  return sanLine(fen, ucis, max)
    .map((t) => (t.label ? t.label + ' ' : '') + t.san)
    .join(' ');
}

/** Replay a game into per-ply records. Throws with a readable message on an illegal move. */
export function replay(startFen, sans) {
  const chess = new Chess(startFen || START_FEN);
  const plies = [];
  const fens = [chess.fen()];
  sans.forEach((san, i) => {
    const m = playSan(chess, san);
    if (!m) throw new Error(`Move ${Math.floor(i / 2) + 1}${i % 2 ? '…' : '.'} ${san} is not legal in this position.`);
    plies.push({ san: m.san, uci: moveToUci(m), from: m.from, to: m.to, color: m.color, piece: m.piece, captured: m.captured, promotion: m.promotion, flags: m.flags });
    fens.push(chess.fen());
  });
  return { plies, fens, final: chess };
}

export function describeEnd(chess) {
  if (chess.isCheckmate()) return { over: true, result: chess.turn() === 'w' ? '0-1' : '1-0', reason: 'checkmate' };
  if (chess.isStalemate()) return { over: true, result: '1/2-1/2', reason: 'stalemate' };
  if (chess.isInsufficientMaterial()) return { over: true, result: '1/2-1/2', reason: 'insufficient material' };
  if (chess.isThreefoldRepetition()) return { over: true, result: '1/2-1/2', reason: 'threefold repetition' };
  if (chess.isDrawByFiftyMoves()) return { over: true, result: '1/2-1/2', reason: 'the fifty-move rule' };
  return { over: false };
}

/** Same position with the other side to move (en passant cleared). Null if that would be illegal. */
export function withTurn(fen, color) {
  const parts = fen.split(' ');
  if (parts[1] === color) return fen;
  parts[1] = color;
  parts[3] = '-';
  try {
    const c = new Chess(parts.join(' '));
    const k = kingSquare(c, opp(color));
    if (!k || c.isAttacked(k, color)) return null;
    return c.fen();
  } catch {
    return null;
  }
}

export function gamePhase(chess, ply) {
  let nonPawn = 0;
  for (const row of chess.board()) for (const p of row) if (p && p.type !== 'k' && p.type !== 'p') nonPawn += VALUE[p.type];
  if (nonPawn <= 14) return 'endgame';
  if (ply < 20) return 'opening';
  return 'middlegame';
}

/** Parse one or more games from PGN text. Returns { games: [...], errors: [...] }. */
export function parsePgn(text) {
  const src = String(text || '').replace(/\r\n?/g, '\n').trim();
  if (!src) return { games: [], errors: ['Nothing to import — paste a PGN or choose a .pgn file.'] };
  // Split on the start of a new tag section that follows movetext.
  const chunks = [];
  let cur = [];
  let inMoves = false;
  for (const line of src.split('\n')) {
    const isTag = /^\s*\[[A-Za-z0-9_]+\s+"/.test(line);
    if (isTag && inMoves) {
      chunks.push(cur.join('\n'));
      cur = [];
      inMoves = false;
    }
    if (!isTag && line.trim()) inMoves = true;
    cur.push(line);
  }
  if (cur.join('').trim()) chunks.push(cur.join('\n'));

  const games = [];
  const errors = [];
  chunks.forEach((chunk, idx) => {
    const label = chunks.length > 1 ? `Game ${idx + 1}: ` : '';
    try {
      const chess = new Chess();
      chess.loadPgn(chunk, { strict: false });
      const sans = chess.history();
      if (!sans.length) {
        errors.push(`${label}no moves found. A PGN needs movetext such as "1. e4 e5 2. Nf3".`);
        return;
      }
      const h = chess.getHeaders();
      const startFen = h.FEN && h.FEN !== START_FEN ? h.FEN : null;
      // chess.com and Lichess write the clock after every move: {[%clk 0:09:58.3]}
      const clk = [...chunk.matchAll(/\[%clk\s+(\d+):(\d+):(\d+(?:\.\d+)?)\]/g)].map((m) => +m[1] * 3600 + +m[2] * 60 + +m[3]);
      const tc = /^(\d+)(?:\+(\d+))?$/.exec(h.TimeControl || '');
      const url = [h.Link, h.Site].find((x) => x && /^https?:\/\//.test(x)) || null;
      games.push({
        headers: h,
        white: h.White && h.White !== '?' ? h.White : 'White',
        black: h.Black && h.Black !== '?' ? h.Black : 'Black',
        result: ['1-0', '0-1', '1/2-1/2'].includes(h.Result) ? h.Result : '*',
        date: h.Date && !/\?/.test(h.Date) ? h.Date : null,
        event: h.Event && h.Event !== '?' ? h.Event : null,
        startFen,
        moves: sans,
        clocks: clk.length === sans.length ? clk : null,
        timeControl: tc ? { base: +tc[1], inc: +(tc[2] || 0) } : null,
        whiteElo: +h.WhiteElo || null,
        blackElo: +h.BlackElo || null,
        link: url,
        termination: h.Termination || null,
      });
    } catch (e) {
      const msg = String(e && e.message ? e.message : e).split('\n')[0].slice(0, 180);
      errors.push(`${label}couldn’t read this PGN — ${humanPgnError(msg)}`);
    }
  });
  if (!games.length && !errors.length) errors.push('No games found in that text.');
  return { games, errors };
}

function humanPgnError(msg) {
  const m = /Invalid move in PGN: (\S+)/.exec(msg);
  if (m) return `the move “${m[1]}” isn’t legal where it appears. Check for a typo or a missing move before it.`;
  if (/Expected/.test(msg)) return 'the text isn’t valid PGN movetext. It should look like "1. e4 e5 2. Nf3 Nc6".';
  return msg;
}

/** Build PGN text from our own game record. */
export function buildPgn(game) {
  const chess = new Chess(game.startFen || START_FEN);
  for (const san of game.moves) if (!playSan(chess, san)) break;
  const d = new Date(game.created || Date.now());
  const pad = (n) => String(n).padStart(2, '0');
  chess.setHeader('Event', game.event || (game.source === 'play' ? 'Outpost training game' : 'Imported game'));
  chess.setHeader('Site', 'Outpost');
  chess.setHeader('Date', game.date || `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`);
  chess.setHeader('White', game.white || 'White');
  chess.setHeader('Black', game.black || 'Black');
  chess.setHeader('Result', game.result || '*');
  const tc = game.timeControl;
  if (tc && typeof tc === 'object') chess.setHeader('TimeControl', `${tc.base}${tc.inc ? `+${tc.inc}` : ''}`);
  else if (tc && tc !== 'none') {
    const [m, inc] = String(tc).split('+').map(Number); // older games stored "10+0" in minutes
    if (m) chess.setHeader('TimeControl', `${m * 60}${inc ? `+${inc}` : ''}`);
  }
  if (game.termination) chess.setHeader('Termination', game.termination);
  let pgn = chess.pgn({ maxWidth: 80, newline: '\n' });
  // chess.js only appends a result when the game ended on the board.
  if (game.result && game.result !== '*' && !new RegExp(game.result.replace(/[/]/g, '\\/') + '\\s*$').test(pgn)) pgn += ' ' + game.result;
  return pgn + '\n';
}
