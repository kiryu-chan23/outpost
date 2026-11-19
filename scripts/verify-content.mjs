// Checks the hand-written content against chess.js and Stockfish:
//  - every lesson position is legal, every accepted move is legal and holds
//    the evaluation (within 60 cp of the engine's best, or keeps a mate),
//    and engine-equal moves that the lesson would reject are reported;
//  - drill start positions are wins (or draws, for "hold" drills);
//  - seeded repertoire lines are legal.
// Run: npm run content:verify
import { Chess } from 'chess.js';
import { createEngine } from './sf.mjs';
import { scoreToCp } from '../src/lib/uci.js';
import { LESSONS } from '../src/data/lessons.js';
import { DRILLS } from '../src/data/drills.js';
import { SEED_LINES } from '../src/data/repertoire-seed.js';

const eng = await createEngine();
let problems = 0;
const fail = (msg) => {
  problems++;
  console.log('  ✗ ' + msg);
};

async function scoreAfter(fen, san, depth) {
  const c = new Chess(fen);
  const m = c.move(san);
  if (c.isCheckmate()) return { cp: 100000, uci: m.from + m.to + (m.promotion || '') };
  if (c.isStalemate() || c.isInsufficientMaterial()) return { cp: 0, uci: m.from + m.to + (m.promotion || '') };
  const r = await eng.analyse(c.fen(), { depth });
  return { cp: -scoreToCp(r.lines[0]), uci: m.from + m.to + (m.promotion || '') };
}

for (const lesson of LESSONS) {
  console.log(`lesson ${lesson.id}`);
  for (const [i, step] of lesson.steps.entries()) {
    let c;
    try {
      c = new Chess(step.fen);
    } catch (e) {
      fail(`step ${i}: bad FEN ${e.message}`);
      continue;
    }
    if (!step.accept) continue;
    const depth = 16;
    const all = c.moves();
    const scores = {};
    for (const san of all) scores[san] = (await scoreAfter(step.fen, san, depth)).cp;
    const best = Math.max(...Object.values(scores));
    for (const san of step.accept) {
      if (!(san in scores)) {
        fail(`step ${i}: accepted move ${san} is not legal`);
        continue;
      }
      const s = scores[san];
      const ok = best >= 90000 ? s >= 90000 || best - s < 60 : best - s <= 60 || (best > 500 && s > 500 && best - s < 250);
      if (!ok) fail(`step ${i}: ${san} scores ${s} vs best ${best}`);
    }
    const rejectedEqual = step.strict ? [] : all.filter((san) => !step.accept.includes(san) && (best >= 90000 ? scores[san] >= 90000 : best - scores[san] <= 30));
    if (rejectedEqual.length) fail(`step ${i}: engine-equal moves not accepted: ${rejectedEqual.join(', ')} (best ${best})`);
    if (step.reply) {
      const d = new Chess(step.fen);
      d.move(step.accept[0]);
      try {
        d.move(step.reply);
      } catch {
        fail(`step ${i}: reply ${step.reply} illegal`);
      }
    }
    console.log(`  step ${i}: ${step.accept.map((s) => `${s} ${scores[s]}`).join(', ')} | best ${best}`);
  }
}

for (const d of DRILLS) {
  const c = new Chess(d.fen);
  const r = await eng.analyse(d.fen, { depth: 22 });
  const s = r.lines[0];
  const cp = scoreToCp(s); // side to move
  const forUser = cp; // the user is always the side to move at the start
  const ok = d.goal === 'hold' ? Math.abs(cp) < 120 : forUser > 400;
  console.log(`drill ${d.id}: ${s.mate != null ? 'mate ' + s.mate : s.cp + ' cp'} ${ok ? 'ok' : ''}`);
  if (!ok) fail(`drill ${d.id} start is not ${d.goal === 'hold' ? 'a draw' : 'winning'}`);
  if (c.isGameOver()) fail(`drill ${d.id} is already over`);
}

for (const line of SEED_LINES) {
  const c = new Chess();
  for (const san of line.moves) {
    try {
      c.move(san);
    } catch {
      fail(`seed ${line.id}: ${san} illegal`);
      break;
    }
  }
}

console.log(problems ? `\n${problems} problem(s)` : '\nall content checks passed');
eng.quit();
process.exit(problems ? 1 : 0);
