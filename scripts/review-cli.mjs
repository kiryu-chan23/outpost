// Dev tool: review a PGN from the command line with the same report code the app uses.
//   node scripts/review-cli.mjs game.pgn [w|b] [depth]
import fs from 'node:fs';
import { Chess } from 'chess.js';
import { createEngine } from './sf.mjs';
import { parsePgn, replay, turnOf } from '../src/lib/chessx.js';
import { flipScore, formatScore } from '../src/lib/uci.js';
import { buildReport, CLASS_MARK } from '../src/lib/analysis.js';

const [file, userColor = 'w', depthArg = '13'] = process.argv.slice(2);
const { games, errors } = parsePgn(fs.readFileSync(file, 'utf8'));
if (!games.length) { console.error(errors.join('\n')); process.exit(1); }
const eng = await createEngine();
for (const g of games) {
  const game = { ...g, userColor: userColor === '-' ? null : userColor };
  const { fens, plies } = replay(game.startFen, game.moves);
  const evals = [];
  for (const fen of fens) {
    const c = new Chess(fen);
    if (c.isCheckmate()) { evals.push({ cp: null, mate: 0, winner: c.turn() === 'w' ? 'b' : 'w', pv: [], best: null }); continue; }
    if (c.isGameOver()) { evals.push({ cp: 0, mate: null, pv: [], best: null }); continue; }
    const r = await eng.analyse(fen, { depth: +depthArg });
    const top = r.lines[0];
    const white = turnOf(fen) === 'w' ? top : flipScore(top);
    evals.push({ cp: white.cp, mate: white.mate, best: top.pv[0], pv: top.pv.slice(0, 10) });
  }
  const rep = buildReport(game, evals, +depthArg);
  console.log(`\n${g.white} – ${g.black}  accuracy W ${rep.accuracy.w} / B ${rep.accuracy.b}`);
  rep.moves.forEach((m, i) => {
    if (m.cls === 'best' || m.cls === 'good') return;
    const p = plies[i];
    console.log(`${Math.floor(i / 2) + 1}${p.color === 'w' ? '.' : '…'} ${p.san}${CLASS_MARK[m.cls]}  [${m.cls}${m.turning ? ', turning point' : ''}] loss ${m.loss}  eval ${formatScore(evals[i])} → ${formatScore(evals[i + 1])}  tags: ${m.tags.join(',')}\n     ${m.text}`);
  });
}
eng.quit();
