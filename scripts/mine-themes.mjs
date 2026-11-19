// Second miner, aimed at named motifs. It plays sensible self-play games and,
// at every position, tries a handful of plausible-but-wrong moves for the side
// to move. If one of them allows a single winning reply that shows a fork, pin,
// skewer, discovered attack or a short mate, the position is verified at depth
// and kept. Positions therefore stay natural: a real game position plus one
// mistake, exactly how tactics arise at the board.
//
//   node scripts/mine-themes.mjs --seed 3 --games 80 --out scripts/.cache/themes-3.json
import fs from 'node:fs';
import path from 'node:path';
import { Chess } from 'chess.js';
import { createEngine } from './sf.mjs';
import { classifyLine } from '../src/lib/motifs.js';
import { scoreToCp } from '../src/lib/uci.js';

const arg = (name, dflt) => {
  const i = process.argv.indexOf('--' + name);
  return i > 0 ? process.argv[i + 1] : dflt;
};
const SEED = +arg('seed', 1);
const GAMES = +arg('games', 40);
const OUT = arg('out', `scripts/.cache/themes-${SEED}.json`);
const WANTED = new Set(['fork', 'pin', 'skewer', 'discoveredAttack', 'doubleCheck', 'backRank', 'smothered', 'mateIn2', 'mateIn3', 'sacrifice', 'promotion', 'mateIn1']);

function mulberry32(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(SEED * 104729 + 7);
const eng = await createEngine();
const found = [];
const seen = new Set();
const perTheme = {};

const mv = (u) => ({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
function pick(lines, temp) {
  const best = scoreToCp(lines[0]);
  const w = lines.map((l) => Math.exp((scoreToCp(l) - best) / temp));
  let r = rng() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < lines.length; i++) {
    r -= w[i];
    if (r <= 0) return lines[i].pv[0];
  }
  return lines[0].pv[0];
}
function firstUnique(a, b) {
  const s1 = scoreToCp(a);
  const s2 = b ? scoreToCp(b) : -99999;
  if (a.mate != null && a.mate > 0) return a.mate <= 3 && s2 < 500;
  return s1 >= 220 && s1 - s2 >= 200 && s2 <= 160;
}
function laterUnique(a, b) {
  const s1 = scoreToCp(a);
  const s2 = b ? scoreToCp(b) : -99999;
  if (a.mate != null && a.mate > 0) return !(b && b.mate != null && b.mate > 0) && s2 < 700;
  return s1 >= 200 && s1 - s2 >= 170;
}
async function verify(fen) {
  const c = new Chess(fen);
  const first = await eng.analyse(fen, { depth: 16, multipv: 2 });
  if (!first.lines.length || !firstUnique(first.lines[0], first.lines[1])) return null;
  const line = [first.lines[0].pv[0]];
  c.move(mv(line[0]));
  let finalScore = scoreToCp(first.lines[0]);
  for (let k = 0; k < 3 && !c.isGameOver(); k++) {
    const reply = await eng.analyse(c.fen(), { depth: 14, multipv: 1 });
    if (!reply.best) break;
    const c2 = new Chess(c.fen());
    c2.move(mv(reply.best));
    if (c2.isGameOver()) break;
    const next = await eng.analyse(c2.fen(), { depth: 15, multipv: 2 });
    if (!next.lines.length || !laterUnique(next.lines[0], next.lines[1])) break;
    line.push(reply.best, next.lines[0].pv[0]);
    c.load(c2.fen());
    c.move(mv(next.lines[0].pv[0]));
    finalScore = scoreToCp(next.lines[0]);
  }
  return { line, finalScore, mate: c.isCheckmate() };
}

async function tryBlunders(chess, topMoves, ply, g) {
  const fenBefore = chess.fen();
  const legal = chess.moves({ verbose: true }).filter((m) => !topMoves.has(m.lan));
  // Shuffle and take a few candidates.
  for (let i = legal.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [legal[i], legal[j]] = [legal[j], legal[i]];
  }
  for (const m of legal.slice(0, 7)) {
    const c = new Chess(fenBefore);
    c.move(m);
    if (c.isGameOver()) continue;
    const fen = c.fen();
    const key = fen.split(' ').slice(0, 2).join(' ');
    if (seen.has(key)) continue;
    const quick = await eng.analyse(fen, { depth: 8, multipv: 2 });
    if (!quick.lines.length || !firstUnique(quick.lines[0], quick.lines[1])) continue;
    const first = quick.lines[0].pv[0];
    if (m.captured && first.slice(2, 4) === m.to) continue; // plain recapture
    // Cheap motif pre-check on the shallow line before paying for depth 16.
    const pre = classifyLine(fen, quick.lines[0].pv.slice(0, 5).filter((_, i) => i < 5));
    const preOk = pre.ok && pre.themes.some((t) => WANTED.has(t));
    if (!preOk && !(quick.lines[0].mate > 0)) continue;
    const v = await verify(fen);
    if (!v) continue;
    const cls = classifyLine(fen, v.line);
    if (!cls.ok) continue;
    const themes = cls.themes.filter((t) => WANTED.has(t) || t === 'mate');
    if (!themes.some((t) => WANTED.has(t))) continue;
    const main = themes.find((t) => WANTED.has(t));
    if ((perTheme[main] || 0) >= 40) continue;
    perTheme[main] = (perTheme[main] || 0) + 1;
    seen.add(key);
    found.push({ fen, fenBefore, lastMove: m.lan, solution: v.line, themes: cls.themes, gained: cls.gained, mate: v.mate, score: v.finalScore, ply, game: `t${SEED}-${g}` });
    process.stdout.write(`  + [${cls.themes.join(',')}] ${fen}  ${v.line.join(' ')}\n`);
    return; // one puzzle per position is plenty
  }
}

async function playGame(g) {
  const chess = new Chess();
  eng.newGame();
  for (let ply = 0; ply < 110 && !chess.isGameOver(); ply++) {
    const res = await eng.analyse(chess.fen(), { depth: ply < 8 ? 5 : 8, multipv: 4 });
    if (!res.lines.length) break;
    const s1 = scoreToCp(res.lines[0]);
    if (Math.abs(s1) > 700) break; // decided games stop producing clean puzzles
    if (ply >= 12 && Math.abs(s1) < 250) await tryBlunders(chess, new Set(res.lines.map((l) => l.pv[0])), ply, g);
    const uci = ply < 8 ? pick(res.lines, 80) : pick(res.lines, 45);
    chess.move(mv(uci));
  }
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
const t0 = Date.now();
for (let g = 0; g < GAMES; g++) {
  await playGame(g);
  fs.writeFileSync(OUT, JSON.stringify(found, null, 1));
  console.log(`game ${g + 1}/${GAMES} — ${found.length} kept ${JSON.stringify(perTheme)} — ${Math.round((Date.now() - t0) / 1000)}s`);
}
eng.quit();
