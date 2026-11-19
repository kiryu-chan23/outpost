// Puzzle library access, adaptive practice queues, the puzzle rating and
// attempt recording.
//
// Two sources:
//  - 115 starter puzzles mined from Stockfish self-play (bundled, src/data/puzzles.json);
//  - 4,000 rated puzzles from the Lichess puzzle database (CC0), loaded on demand
//    as a separate chunk (src/data/lichess-puzzles.json, [id, fen, moves, rating, themes]).
import MINED from '../data/puzzles.json';
import { Chess } from 'chess.js';
import { getState, update, logActivity } from './store.js';
import { recordAttempt, dueIds, DAY } from './srs.js';
import { playUci } from './chessx.js';

// Mined puzzles have no rating; these are estimates by difficulty level.
const LEVEL_RATING = { 1: 900, 2: 1100, 3: 1300 };
const mined = MINED.map((p) => ({ ...p, rating: p.rating || LEVEL_RATING[p.level] || 1100, source: 'outpost' }));

export const LIBRARY = mined.slice();
const byId = new Map(LIBRARY.map((p) => [p.id, p]));
const lichessRows = new Map(); // id -> raw row, expanded on first use
const listeners = new Set();
export let libraryReady = false;
let loading = null;

/** Load the Lichess set (once). Resolves when it is available. */
export function loadLibrary() {
  if (!loading) {
    loading = import('../data/lichess-puzzles.json')
      .then((mod) => {
        const rows = mod.default || mod;
        for (const r of rows) {
          const id = `lc-${r[0]}`;
          if (byId.has(id)) continue;
          lichessRows.set(id, r);
          const themes = r[4] ? r[4].split(' ') : [];
          const tags = r[5] ? r[5].split(' ') : []; // the original Lichess theme tags
          // A light record for queues and counts; the position is expanded in getPuzzle.
          const lite = { id, rating: r[3], themes, primary: themes.find((t) => t !== 'mate' && t !== 'endgame') || themes[0] || null, source: 'lichess', tags, moves: r[2].split(' ').length - 1 };
          LIBRARY.push(lite);
          byId.set(id, lite);
        }
        libraryReady = true;
        counts = null;
        listeners.forEach((l) => l());
      })
      .catch((e) => {
        loading = null;
        throw e;
      });
  }
  return loading;
}
export function onLibrary(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function expandLichess(id) {
  const r = lichessRows.get(id);
  const lite = byId.get(id);
  if (!r || lite.fen) return lite;
  const [lead, ...solution] = r[2].split(' ');
  const c = new Chess(r[1]);
  playUci(c, lead);
  Object.assign(lite, { fen: c.fen(), lead: { fen: r[1], uci: lead }, solution, lichessId: r[0] });
  return lite;
}

/** Built-in or saved-from-my-games puzzle, normalised. */
export function getPuzzle(id, state = getState()) {
  if (byId.has(id)) {
    const p = lichessRows.has(id) ? expandLichess(id) : byId.get(id);
    return { ...p, custom: false };
  }
  const c = state.customPuzzles[id];
  if (!c) return null;
  return { id: c.id, fen: c.fen, solution: c.solution, line: c.line, ref: c.ref, themes: c.themes || [], primary: (c.themes || [])[0] || null, note: c.note, played: c.played, source: c.source, custom: true, created: c.created };
}

export const hasTheme = (p, theme) => p.themes.includes(theme) || (p.tags ? p.tags.includes(theme) : false);

let counts = null;
export function themeCounts() {
  if (counts) return counts;
  counts = {};
  for (const p of LIBRARY) for (const t of p.themes) counts[t] = (counts[t] || 0) + 1;
  return counts;
}

/** Lichess-tagged puzzles for one tag, easiest first (for academy examples). */
export function examplesFor(tag, n = 3) {
  return LIBRARY.filter((p) => p.tags && p.tags.includes(tag)).sort((a, b) => a.rating - b.rating).slice(0, n).map((p) => p.id);
}
export function tagCount(tag) {
  let n = 0;
  for (const p of LIBRARY) if (p.tags && p.tags.includes(tag)) n++;
  return n;
}

/** Per-theme accuracy from the attempt log (first try only, hints count as misses). Counts both app themes and Lichess tags. */
export function themeStats(attempts) {
  const out = {};
  for (const a of attempts) {
    for (const t of new Set([...(a.themes || []), ...(a.tags || [])])) {
      const s = (out[t] = out[t] || { n: 0, ok: 0, last: 0 });
      s.n++;
      if (a.ok && !a.hint) s.ok++;
      s.last = Math.max(s.last, a.t);
    }
  }
  return out;
}

// ---- puzzle rating ---------------------------------------------------------------------
export const START_RATING = 1000;
export const PROVISIONAL = 15;
export const ratingOf = (state = getState()) => state.puzzleRating || { r: START_RATING, n: 0, hist: [] };
const expected = (r, p) => 1 / (1 + 10 ** ((p - r) / 400));
/** Score for one attempt: 1 = clean solve, 0.3 = solved with a hint, 0 = missed. */
export const attemptScore = ({ ok, hint }) => (ok && !hint ? 1 : ok && hint ? 0.3 : 0);
export function nextRating(cur, puzzleRating, score) {
  const k = cur.n < 10 ? 64 : cur.n < PROVISIONAL * 2 ? 36 : 22;
  const r = Math.round(Math.max(400, Math.min(3000, cur.r + k * (score - expected(cur.r, puzzleRating)))));
  return { r, n: cur.n + 1, hist: [...(cur.hist || []), { t: Date.now(), r }].slice(-400) };
}

// ---- queues -----------------------------------------------------------------------------
const recently = (stats, id, days = 7) => stats[id] && stats[id].last && Date.now() - stats[id].last < days * DAY;

/**
 * Pick the next puzzle for an adaptive session: unseen first, closest to a
 * target a little below your rating (aiming for roughly two right out of three).
 */
export function pickAdaptive({ theme = null, exclude = new Set() } = {}, state = getState()) {
  const r = ratingOf(state).r;
  const target = r - 40;
  const stats = state.puzzleStats;
  let pool = LIBRARY.filter((p) => !exclude.has(p.id) && (!theme || hasTheme(p, theme)));
  const fresh = pool.filter((p) => !stats[p.id]);
  if (fresh.length) pool = fresh;
  else pool = pool.filter((p) => !recently(stats, p.id, 2)).length ? pool.filter((p) => !recently(stats, p.id, 2)) : pool;
  if (!pool.length) return null;
  // Short lines are friendlier at the same rating: nudge them forward below 1300.
  const cost = (p) => Math.abs(p.rating - target) + (r < 1300 ? (p.moves || p.solution?.length || 1) * 12 : 0) + Math.random() * 70;
  let best = null;
  let bestCost = Infinity;
  for (const p of pool) {
    const c = cost(p);
    if (c < bestCost) {
      bestCost = c;
      best = p;
    }
  }
  return best ? best.id : null;
}

/** Fixed queues: { mode: 'review' } | { mode: 'mine' } | { mode: 'ids', ids }. */
export function buildQueue(spec, state = getState()) {
  const stats = state.puzzleStats;
  if (spec.mode === 'review') return dueIds(stats).filter((id) => getPuzzle(id, state)).slice(0, 20);
  if (spec.mode === 'ids') return spec.ids.filter((id) => getPuzzle(id, state));
  if (spec.mode === 'mine') {
    return Object.values(state.customPuzzles)
      .sort((a, b) => (stats[a.id]?.srs?.due || 0) - (stats[b.id]?.srs?.due || 0) || b.created - a.created)
      .map((p) => p.id)
      .slice(0, 20);
  }
  return null; // adaptive modes pick one at a time
}

/** Record one attempt (first resolution of a puzzle visit). Returns the rating change, if rated. */
export function recordPuzzle(p, { ok, hint, ms }) {
  let delta = null;
  update((s) => {
    s.puzzleStats[p.id] = recordAttempt(s.puzzleStats[p.id], { ok, hint });
    s.attempts.push({ t: Date.now(), id: p.id, themes: p.themes.slice(), tags: p.tags ? p.tags.slice() : undefined, ok, hint: !!hint, ms: Math.round(ms || 0), custom: !!p.custom, rating: p.rating || null });
    if (s.attempts.length > 5000) s.attempts.splice(0, s.attempts.length - 5000);
    if (!p.custom && p.rating) {
      const cur = ratingOf(s);
      const next = nextRating(cur, p.rating, attemptScore({ ok, hint }));
      delta = next.r - cur.r;
      s.puzzleRating = next;
    }
  });
  return delta;
}

export function logSession(label, solved, total) {
  if (total) logActivity('puzzles', `${label}: ${solved} of ${total} solved first try`);
}
