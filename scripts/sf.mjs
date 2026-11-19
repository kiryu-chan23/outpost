// Minimal Node wrapper around the Stockfish WASM build, for the content scripts.
import { createRequire } from 'node:module';
import { parseInfo } from '../src/lib/uci.js';

const require = createRequire(import.meta.url);

export async function createEngine(flavour = 'lite-single') {
  const sf = require('stockfish');
  let handler = null;
  const eng = sf(flavour, (line) => handler && handler(String(line)));
  const send = (c) => eng.processCommand(c);
  const until = (re) =>
    new Promise((res) => {
      handler = (l) => {
        if (re.test(l)) {
          handler = null;
          res(l);
        }
      };
    });
  // The engine can answer synchronously, so always listen before sending.
  let p = until(/^uciok/);
  send('uci');
  await p;
  p = until(/^readyok/);
  send('isready');
  await p;

  let lastMultipv = 1;
  /** Returns { best, lines: [{multipv, depth, cp, mate, pv}] } with scores from the side to move. */
  async function analyse(fen, { depth = 12, multipv = 1, moves = [] } = {}) {
    if (multipv !== lastMultipv) {
      send(`setoption name MultiPV value ${multipv}`);
      lastMultipv = multipv;
    }
    send(`position fen ${fen}${moves.length ? ' moves ' + moves.join(' ') : ''}`);
    const byPv = new Map();
    const done = new Promise((res) => {
      handler = (l) => {
        if (l.startsWith('bestmove')) {
          handler = null;
          res(l.split(/\s+/)[1]);
          return;
        }
        const info = parseInfo(l);
        if (info && !info.bound) byPv.set(info.multipv, info);
      };
    });
    send(`go depth ${depth}`);
    const best = await done;
    const lines = [...byPv.values()].sort((a, b) => a.multipv - b.multipv);
    return { best: best === '(none)' ? null : best, lines };
  }
  return { analyse, send, newGame: () => send('ucinewgame'), quit: () => eng.terminate() };
}
