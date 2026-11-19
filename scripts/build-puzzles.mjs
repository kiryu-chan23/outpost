// Builds src/data/puzzles.json from (a) the candidates mined by
// mine-puzzles.mjs / mine-themes.mjs and (b) a few hand-composed pattern
// positions below. Every puzzle is re-checked here: the line must be legal and
// the first move must be the engine's single clearly-best move.
//
//   npm run content:puzzles
import fs from 'node:fs';
import { Chess } from 'chess.js';
import { createEngine } from './sf.mjs';
import { classifyLine } from '../src/lib/motifs.js';
import { scoreToCp } from '../src/lib/uci.js';

const CACHE = new URL('./.cache/', import.meta.url);
const OUT = new URL('../src/data/puzzles.json', import.meta.url);

// Hand-composed pattern positions (original to this project). `moves` are SAN.
const COMPOSED = [
  { fen: '6rk/5Npp/8/8/8/8/5PPP/6K1 b - - 0 1', note: 'skip' },
  { fen: 'r1b2rk1/pp3ppp/8/4q3/1nB5/1Q6/PP3PPP/R4RK1 w - - 0 1', lead: null, moves: ['Bxf7+', 'Kh8', 'Qg8+', 'Rxg8', 'Nf7#'], note: 'skip' },
  // Smothered mate after a queen sacrifice.
  { fen: '5r1k/6pp/7N/8/2Q5/8/5PPP/6K1 w - - 0 1', moves: ['Qg8+', 'Rxg8', 'Nf7#'] },
  { fen: 'r4r1k/1p4pp/p6N/2q5/8/1Q6/PP3PPP/3R2K1 w - - 0 1', moves: ['Qg8+', 'Rxg8', 'Nf7#'] },
  { fen: '2r3rk/pp4pp/8/4N3/8/1Q6/PP3PPP/6K1 w - - 0 1', moves: ['Nf7#'] },
  // Back-rank patterns.
  { fen: '3r2k1/5ppp/8/8/8/8/5PPP/3RR1K1 w - - 0 1', moves: ['Rxd8#'] },
  { fen: '2r3k1/5ppp/8/8/8/2Q5/5PPP/6K1 b - - 0 1', moves: ['Rxc3'] },
  { fen: '3rr1k1/5ppp/8/8/8/1Q6/5PPP/3R2K1 w - - 0 1', moves: ['Rxd8', 'Rxd8', 'Qb8'], note: 'skip' },
  { fen: '6k1/3q1ppp/8/8/8/8/3Q1PPP/3R2K1 w - - 0 1', moves: ['Qxd7'], note: 'skip' },
  { fen: 'r5k1/5ppp/8/8/8/8/1Q3PPP/6K1 w - - 0 1', moves: ['Qb8+', 'Rxb8'], note: 'skip' },
  { fen: '1r4k1/5ppp/8/8/8/8/5PPP/RR4K1 w - - 0 1', moves: ['Rxb8#'] },
  { fen: '6k1/1q3ppp/8/8/8/8/1R3PPP/1R4K1 w - - 0 1', moves: ['Rxb7'], note: 'skip' },
  // Deflect the back-rank defender, then mate.
  { fen: '3r2k1/2q2ppp/8/8/8/8/2Q2PPP/2R3K1 w - - 0 1', moves: ['Qxc7'], note: 'skip' },
  { fen: '2r3k1/5ppp/8/8/8/8/2R2PPP/2R3K1 w - - 0 1', moves: ['Rxc8#'] },
];

const PRIORITY = ['smothered', 'backRank', 'skewer', 'pin', 'fork', 'discoveredAttack', 'promotion', 'mateIn3', 'mateIn2', 'mateIn1', 'hangingPiece'];
const CAPS = { smothered: 8, backRank: 12, skewer: 14, pin: 14, fork: 16, discoveredAttack: 14, promotion: 6, mateIn3: 4, mateIn2: 12, mateIn1: 12, hangingPiece: 10 };

const hash = (s) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
};
const mv = (u) => ({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });

function legalLine(fen, line) {
  const c = new Chess(fen);
  for (const u of line) {
    try {
      c.move(mv(u));
    } catch {
      return null;
    }
  }
  return c;
}

const eng = await createEngine();
async function engineAgrees(fen, first) {
  const r = await eng.analyse(fen, { depth: 16, multipv: 2 });
  const a = r.lines[0];
  const b = r.lines[1];
  if (!a || a.pv[0] !== first) return false;
  const s1 = scoreToCp(a);
  const s2 = b ? scoreToCp(b) : -99999;
  if (a.mate != null && a.mate > 0) return s2 < 600;
  return s1 >= 200 && s1 - s2 >= 180;
}

// ---- gather ----------------------------------------------------------------------
let pool = [];
for (const f of fs.readdirSync(CACHE)) {
  if (!/^(mined|themes)-\d+\.json$/.test(f)) continue;
  for (const p of JSON.parse(fs.readFileSync(new URL(f, CACHE), 'utf8'))) pool.push({ ...p, origin: 'self-play' });
}
for (const c of COMPOSED) {
  if (c.note === 'skip') continue;
  const chess = new Chess(c.fen);
  const line = [];
  let ok = true;
  for (const san of c.moves) {
    try {
      const m = chess.move(san);
      line.push(m.from + m.to + (m.promotion || ''));
    } catch {
      ok = false;
      console.warn('composed: illegal', c.fen, san);
      break;
    }
  }
  if (ok) pool.push({ fen: c.fen, fenBefore: null, lastMove: null, solution: line, origin: 'composed', game: 'composed-' + hash(c.fen) });
}
console.log('candidates', pool.length);

// ---- validate, tag, select ------------------------------------------------------------
const seen = new Set();
const buckets = Object.fromEntries(PRIORITY.map((t) => [t, []]));
for (const p of pool) {
  const key = p.fen.split(' ').slice(0, 2).join(' ');
  if (seen.has(key)) continue;
  if (p.solution.length % 2 === 0) p.solution = p.solution.slice(0, -1);
  const end = legalLine(p.fen, p.solution);
  if (!end) continue;
  if (p.fenBefore && !legalLine(p.fenBefore, [p.lastMove])) continue;
  const cls = classifyLine(p.fen, p.solution);
  if (!cls.ok) continue;
  const mate = end.isCheckmate();
  if (!mate && cls.gained < 2 && !cls.themes.includes('promotion')) continue;
  const primary = PRIORITY.find((t) => cls.themes.includes(t));
  if (!primary) continue;
  seen.add(key);
  buckets[primary].push({ ...p, themes: cls.themes, primary, mate, gained: cls.gained });
}

const picked = [];
const perGame = {};
for (const t of PRIORITY) {
  // Prefer lines that show the pay-off (3+ plies) and spread across source games.
  const list = buckets[t].sort((a, b) => (b.origin === 'composed') - (a.origin === 'composed') || Math.min(b.solution.length, 5) - Math.min(a.solution.length, 5) || a.fen.localeCompare(b.fen));
  let n = 0;
  for (const p of list) {
    if (n >= CAPS[t]) break;
    if ((perGame[p.game] || 0) >= 2) continue;
    if (!(await engineAgrees(p.fen, p.solution[0]))) {
      if (p.origin === 'composed') console.warn('composed puzzle rejected by engine:', p.fen, p.solution.join(' '));
      continue;
    }
    perGame[p.game] = (perGame[p.game] || 0) + 1;
    n++;
    picked.push(p);
  }
  console.log(t.padEnd(18), `${n} of ${list.length}`);
}
eng.quit();

const out = picked.map((p) => {
  const themes = p.themes.filter((t) => t !== 'mate');
  if (p.mate) themes.push('mate');
  const level = p.solution.length >= 5 || themes.includes('sacrifice') ? 3 : p.solution.length >= 3 ? 2 : 1;
  return {
    id: 'p' + hash(p.fen),
    fen: p.fen,
    ...(p.fenBefore ? { lead: { fen: p.fenBefore, uci: p.lastMove } } : {}),
    solution: p.solution,
    themes,
    primary: p.primary,
    level,
    origin: p.origin,
  };
});
out.sort((a, b) => a.level - b.level || a.id.localeCompare(b.id));
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
const counts = {};
for (const p of out) for (const t of p.themes) counts[t] = (counts[t] || 0) + 1;
console.log(`wrote ${out.length} puzzles`, counts);
