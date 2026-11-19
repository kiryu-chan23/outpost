// Stockfish runs in a Web Worker, so searching never blocks the board.
// Each UciEngine owns one worker and runs one search at a time; searches can be
// cancelled with an AbortSignal (we send "stop" and wait for "bestmove").
import { parseInfo, scoreToCp } from './uci.js';

const FLAVOURS = [
  { id: 'wasm', label: 'Stockfish 19 Lite (WebAssembly)', url: 'engine/stockfish-19-lite-single.js' },
  { id: 'asm', label: 'Stockfish 19 (JavaScript fallback, slower)', url: 'engine/stockfish-19-asm.js' },
  // Some hosts only allow workers created from blob: URLs. The blob imports the script by absolute URL.
  { id: 'asm-blob', label: 'Stockfish 19 (JavaScript, compatibility mode)', url: 'engine/stockfish-19-asm.js', blob: true },
];
export const engineErrors = [];

const statusListeners = new Set();
export const engineStatus = { state: 'idle', flavour: null, error: null };
function setStatus(patch) {
  Object.assign(engineStatus, patch);
  statusListeners.forEach((l) => l());
}
export function onEngineStatus(fn) {
  statusListeners.add(fn);
  return () => statusListeners.delete(fn);
}

class UciEngine {
  constructor() {
    this.worker = null;
    this.ready = null;
    this.queue = Promise.resolve();
    this.onLine = null;
    this.options = {};
  }

  _spawn(flavour) {
    return new Promise((resolve, reject) => {
      let worker;
      try {
        const abs = new URL(flavour.url, document.baseURI).href;
        if (flavour.blob) {
          const src = `importScripts(${JSON.stringify(abs)});`;
          worker = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
        } else worker = new Worker(abs);
      } catch (e) {
        reject(e);
        return;
      }
      let stage = 0;
      const timeout = setTimeout(() => {
        worker.terminate();
        reject(new Error('The engine did not start in time.'));
      }, 25000);
      worker.onerror = (e) => {
        clearTimeout(timeout);
        worker.terminate();
        reject(new Error(e.message || 'The engine worker failed to load.'));
      };
      worker.onmessage = (ev) => {
        const line = typeof ev.data === 'string' ? ev.data : '';
        if (stage === 0 && line.startsWith('uciok')) {
          stage = 1;
          worker.postMessage('isready');
        } else if (stage === 1 && line.startsWith('readyok')) {
          stage = 2;
          clearTimeout(timeout);
          worker.onmessage = (e2) => this.onLine && typeof e2.data === 'string' && this.onLine(e2.data);
          worker.onerror = () => {};
          this.worker = worker;
          resolve(flavour);
        }
      };
      worker.postMessage('uci');
    });
  }

  init() {
    if (!this.ready) {
      setStatus({ state: engineStatus.state === 'ready' ? 'ready' : 'loading', error: null });
      const note = (f) => (e) => {
        engineErrors.push(`${f.id}: ${(e && e.message) || e}`);
        throw e;
      };
      this.ready = this._spawn(FLAVOURS[0])
        .catch(note(FLAVOURS[0]))
        .catch(() => this._spawn(FLAVOURS[1]).catch(note(FLAVOURS[1])))
        .catch(() => this._spawn(FLAVOURS[2]).catch(note(FLAVOURS[2])))
        .then((f) => {
          setStatus({ state: 'ready', flavour: f });
          return f;
        })
        .catch((e) => {
          this.ready = null;
          setStatus({ state: 'failed', error: engineErrors.slice(-3).join(' · ') || e.message || String(e) });
          throw e;
        });
    }
    return this.ready;
  }

  _send(cmd) {
    this.worker.postMessage(cmd);
  }
  _option(name, value) {
    if (this.options[name] === value) return;
    this.options[name] = value;
    this._send(`setoption name ${name} value ${value}`);
  }

  _enqueue(job) {
    const p = this.queue.then(() => this.init()).then(job);
    this.queue = p.catch(() => {});
    return p;
  }

  /**
   * Search a position. Scores are from the side to move.
   * Resolves { best, lines, aborted } — lines sorted best first.
   */
  analyse(fen, { depth, movetime, multipv = 1, signal, onInfo } = {}) {
    return this._enqueue(
      () =>
        new Promise((resolve) => {
          if (signal?.aborted) {
            resolve({ best: null, lines: [], aborted: true });
            return;
          }
          const byPv = new Map();
          const stop = () => this._send('stop');
          signal?.addEventListener('abort', stop, { once: true });
          this.onLine = (line) => {
            if (line.startsWith('bestmove')) {
              this.onLine = null;
              signal?.removeEventListener('abort', stop);
              const best = line.split(/\s+/)[1];
              const lines = [...byPv.values()].sort((a, b) => a.multipv - b.multipv);
              resolve({ best: best && best !== '(none)' ? best : null, lines, aborted: !!signal?.aborted });
              return;
            }
            const info = parseInfo(line);
            if (info && !info.bound) {
              byPv.set(info.multipv, info);
              if (onInfo) onInfo(info);
            }
          };
          this._option('MultiPV', multipv);
          this._send(`position fen ${fen}`);
          const parts = ['go'];
          if (depth) parts.push('depth', depth);
          if (movetime) parts.push('movetime', movetime);
          if (!depth && !movetime) parts.push('depth', 12);
          this._send(parts.join(' '));
        })
    );
  }

  newGame() {
    return this._enqueue(() => {
      this._send('ucinewgame');
    });
  }
}

/** Two workers: one thinks for the computer opponent, one analyses for the coach/review. */
export const engines = { opponent: new UciEngine(), analyst: new UciEngine() };

// ---- opponent levels -----------------------------------------------------------
// The ratings are rough guides, not measurements: each level searches a little
// deeper, chooses less randomly among its top moves, and blunders less often.
export const LEVELS = [
  { id: 1, name: 'Newcomer', elo: '≈500', depth: 2, multipv: 6, temp: 260, blunder: 0.22 },
  { id: 2, name: 'Beginner', elo: '≈800', depth: 3, multipv: 5, temp: 170, blunder: 0.12 },
  { id: 3, name: 'Improver', elo: '≈1000', depth: 4, multipv: 5, temp: 120, blunder: 0.07 },
  { id: 4, name: 'Club player', elo: '≈1300', depth: 6, multipv: 4, temp: 80, blunder: 0.035 },
  { id: 5, name: 'Strong club', elo: '≈1600', depth: 8, multipv: 4, temp: 45, blunder: 0.015 },
  { id: 6, name: 'Expert', elo: '≈1900', depth: 10, multipv: 3, temp: 22, blunder: 0 },
  { id: 7, name: 'Master', elo: '≈2200', depth: 13, multipv: 2, temp: 8, blunder: 0 },
  { id: 8, name: 'Full strength', elo: 'max', depth: 18, movetime: 1500, multipv: 1, temp: 0, blunder: 0 },
];
export const levelById = (id) => LEVELS.find((l) => l.id === id) || LEVELS[2];

/** Pick the computer's move for a level. Returns a UCI move or null if there is none. */
export async function chooseMove(fen, level, { signal, ply = 99 } = {}) {
  const res = await engines.opponent.analyse(fen, { depth: level.depth, movetime: level.movetime, multipv: level.multipv, signal });
  if (res.aborted) return null;
  const lines = res.lines.filter((l) => l.pv.length);
  if (!lines.length) return res.best;
  const best = lines[0];
  if (lines.length === 1) return best.pv[0];
  if (best.mate === 1 && level.id >= 3) return best.pv[0];
  const top = scoreToCp(best);
  if (level.blunder && ply >= 8 && Math.random() < level.blunder) {
    // An honest slip: any of the weaker candidates, each as likely as the next.
    const others = lines.slice(1);
    return others[Math.floor(Math.random() * others.length)].pv[0];
  }
  // In the first moves keep a little variety so every game doesn't open the same way.
  const temp = Math.max(level.temp, ply < 8 ? 30 : 0);
  if (!temp) return best.pv[0];
  const pool = ply < 8 ? lines.filter((l) => top - scoreToCp(l) <= Math.max(60, level.temp)) : lines;
  const weights = pool.map((l) => Math.exp((scoreToCp(l) - top) / temp));
  let r = Math.random() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i];
    if (r <= 0) return pool[i].pv[0];
  }
  return best.pv[0];
}
