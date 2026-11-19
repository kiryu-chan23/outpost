// Mines original tactics puzzles from engine self-play.
//
// Two deliberately fallible engine "players" play each other. Whenever one of
// them errs and the other has exactly one clearly winning continuation, the
// position is verified at higher depth, extended while the solver's move stays
// unique, tagged by motif and written out as a candidate. Nothing is copied
// from any puzzle database: every position comes from games generated here.
//
//   node scripts/mine-puzzles.mjs --seed 1 --games 60 --out scripts/.cache/mined-1.json
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
const OUT = arg('out', `scripts/.cache/mined-${SEED}.json`);

function mulberry32(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(SEED * 7919 + 13);
const eng = await createEngine();
const found = [];
const seenFens = new Set();

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

function firstMoveUnique(a, b) {
  const s1 = scoreToCp(a);
  const s2 = b ? scoreToCp(b) : -99999;
  if (a.mate != null && a.mate > 0) return a.mate <= 3 && s2 < 500;
  return s1 >= 220 && s1 - s2 >= 200 && s2 <= 160;
}
function laterMoveUnique(a, b) {
  const s1 = scoreToCp(a);
  const s2 = b ? scoreToCp(b) : -99999;
  if (a.mate != null && a.mate > 0) return !(b && b.mate != null && b.mate > 0) && s2 < 700;
  return s1 >= 200 && s1 - s2 >= 170;
}

async function verify(fen) {
  const c = new Chess(fen);
  const first = await eng.analyse(fen, { depth: 16, multipv: 2 });
  if (!first.lines.length || !firstMoveUnique(first.lines[0], first.lines[1])) return null;
  const line = [first.lines[0].pv[0]];
  c.move({ from: line[0].slice(0, 2), to: line[0].slice(2, 4), promotion: line[0][4] });
  let finalScore = scoreToCp(first.lines[0]);
  for (let k = 0; k < 3 && !c.isGameOver(); k++) {
    const reply = await eng.analyse(c.fen(), { depth: 14, multipv: 1 });
    if (!reply.best) break;
    const c2 = new Chess(c.fen());
    c2.move({ from: reply.best.slice(0, 2), to: reply.best.slice(2, 4), promotion: reply.best[4] });
    if (c2.isGameOver()) break;
    const next = await eng.analyse(c2.fen(), { depth: 15, multipv: 2 });
    if (!next.lines.length || !laterMoveUnique(next.lines[0], next.lines[1])) break;
    const mv = next.lines[0].pv[0];
    line.push(reply.best, mv);
    c.load(c2.fen());
    c.move({ from: mv.slice(0, 2), to: mv.slice(2, 4), promotion: mv[4] });
    finalScore = scoreToCp(next.lines[0]);
  }
  return { line, finalScore, mate: c.isCheckmate() };
}

async function playGame(g) {
  const chess = new Chess();
  eng.newGame();
  let prevBest = 0; // best score for the side that moved last, before it moved
  let last = null; // { fenBefore, uci, capture }
  for (let ply = 0; ply < 150 && !chess.isGameOver(); ply++) {
    const fen = chess.fen();
    const res = await eng.analyse(fen, { depth: ply < 8 ? 5 : 8, multipv: 4 });
    if (!res.lines.length) break;
    const s1 = scoreToCp(res.lines[0]);
    const advBefore = -prevBest; // how the side to move stood before the opponent's last move
    const legal = chess.moves({ verbose: true });
    if (ply >= 10 && last && advBefore <= 220 && s1 - advBefore >= 150 && firstMoveUnique(res.lines[0], res.lines[1]) && !seenFens.has(fen.split(' ').slice(0, 2).join(' ')) && !(chess.inCheck() && legal.length <= 2)) {
      const recapture = last.capture && res.lines[0].pv[0].slice(2, 4) === last.uci.slice(2, 4);
      if (!recapture) {
        const v = await verify(fen);
        if (v) {
          const cls = classifyLine(fen, v.line);
          if (cls.ok && (v.mate || cls.gained >= 1 || cls.themes.length)) {
            seenFens.add(fen.split(' ').slice(0, 2).join(' '));
            found.push({ fen, fenBefore: last.fenBefore, lastMove: last.uci, solution: v.line, themes: cls.themes, gained: cls.gained, mate: v.mate, score: v.finalScore, ply, game: `${SEED}-${g}` });
            process.stdout.write(`  + [${cls.themes.join(',') || 'win'}] ${fen}  ${v.line.join(' ')}\n`);
          }
        }
      }
    }
    // Choose a fallible move.
    let uci;
    if (ply < 6) uci = pick(res.lines, 90);
    else if (rng() < 0.05) uci = legal[Math.floor(rng() * legal.length)].lan;
    else uci = pick(res.lines, 130);
    prevBest = s1;
    const m = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
    last = { fenBefore: fen, uci, capture: !!m.captured };
    // Stop hopeless games early; they stop producing instructive positions.
    if (Math.abs(s1) > 1500 && ply > 40) break;
  }
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
const t0 = Date.now();
for (let g = 0; g < GAMES; g++) {
  await playGame(g);
  fs.writeFileSync(OUT, JSON.stringify(found, null, 1));
  console.log(`game ${g + 1}/${GAMES} — ${found.length} candidates — ${Math.round((Date.now() - t0) / 1000)}s`);
}
eng.quit();
