// Local-first persistence. Everything lives in this browser's localStorage:
// one "core" record (settings, stats, history) plus one record per game, so a
// long game list never has to be rewritten on every change.
import { useEffect, useReducer } from 'preact/hooks';
import { replay } from './chessx.js';

const NS = 'outpost:v1';
const CORE = `${NS}:core`;
const GAME = (id) => `${NS}:game:${id}`;
export const SCHEMA_VERSION = 1;

const defaults = () => ({
  v: SCHEMA_VERSION,
  settings: {
    level: 3,
    side: 'w',
    timeControl: '10+0',
    coach: true,
    coords: true,
    autoQueen: false,
    reviewDepth: 'standard',
    names: ['ThePawnScum', 'ThePawnScum12'], // my usernames (chess.com, Lichess): imports use them to pick my side
    accounts: { chesscom: 'ThePawnScum', lichess: 'ThePawnScum12' }, // synced automatically
    sync: { auto: true, analyse: true, live: true, notify: false },
    wheels: { level: 3, games: [] }, // live coach: pre-move warnings, fading as games get cleaner
  },
  namesSeeded: true,
  gameOrder: [], // newest first
  current: null, // game in progress
  puzzleStats: {}, // id -> { attempts, correct, last, lastOk, srs }
  customPuzzles: {}, // saved positions from my own games
  attempts: [], // [{ t, id, themes, ok, hint, ms }]
  repertoire: {}, // id -> line
  repertoireSeeded: false,
  lessonProgress: {}, // id -> { step, done, at }
  drillStats: {}, // id -> { attempts, wins, best, last }
  puzzleRating: { r: 1000, n: 0, hist: [] }, // adaptive puzzle rating
  convertStats: {}, // won-position id -> { attempts, wins, last }
  academy: {}, // theme id -> { seen, learned, at }
  pathUnlocked: {}, // stage id -> true when skipped ahead
  debriefs: {}, // game id -> post-game debrief { headline, steps, done, found }
  goal: null, // { metric, target, setAt } — null means use the suggested goal
  syncLog: {}, // site -> { at, okAt, added, total, error, kind, user }, lastAttempt, blocked
  ownPositions: {}, // 'gameId:ply' -> { ok, tries, at } (lesson positions from my games)
  calc: { level: 1, best: 1, rounds: 0, perfect: 0, good: 0, bad: 0, hist: [] }, // calculation trainer
  activity: [], // [{ t, type, ref, label }]
  ui: { reviewId: null },
});

let memory = new Map(); // fallback when localStorage is unavailable
let storageOk = true;
let lastError = null;

function rawGet(key) {
  try {
    const v = window.localStorage.getItem(key);
    return v;
  } catch {
    storageOk = false;
    return memory.has(key) ? memory.get(key) : null;
  }
}
function rawSet(key, value) {
  try {
    window.localStorage.setItem(key, value);
    lastError = null;
    return true;
  } catch (e) {
    memory.set(key, value);
    const quota = e && (e.name === 'QuotaExceededError' || e.code === 22);
    lastError = quota ? 'quota' : 'unavailable';
    if (!quota) storageOk = false;
    return false;
  }
}
function rawRemove(key) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
  memory.delete(key);
}
function rawKeys() {
  const keys = new Set(memory.keys());
  try {
    for (let i = 0; i < window.localStorage.length; i++) keys.add(window.localStorage.key(i));
  } catch {
    /* ignore */
  }
  return [...keys].filter((k) => k && k.startsWith(NS));
}

function load() {
  const base = defaults();
  const raw = rawGet(CORE);
  if (!raw) return base;
  try {
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return base;
    const settings = { ...base.settings, ...(data.settings || {}) };
    // Earlier versions started with no names: add my usernames once.
    if (!data.namesSeeded) settings.names = [...new Set([...base.settings.names, ...(settings.names || [])])];
    return { ...base, ...data, settings, namesSeeded: true, ui: { ...base.ui, ...(data.ui || {}) } };
  } catch {
    return base;
  }
}

let state = typeof window !== 'undefined' ? load() : defaults();
const gameCache = new Map();
const listeners = new Set();
let dirty = false;
let timer = null;

function flush() {
  if (timer) clearTimeout(timer);
  timer = null;
  if (!dirty) return;
  dirty = false;
  rawSet(CORE, JSON.stringify(state));
}
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && flush());
}

export const getState = () => state;
export const storageStatus = () => ({ ok: storageOk, error: lastError });

/** Mutate the store: update((s) => { s.settings.level = 4 }). Persists and notifies. */
export function update(fn, { immediate = false } = {}) {
  fn(state);
  state = { ...state };
  dirty = true;
  if (immediate) flush();
  else if (!timer) timer = setTimeout(flush, 60);
  listeners.forEach((l) => l());
}
export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
export function useStore(selector = (s) => s) {
  const [, force] = useReducer((x) => x + 1, 0);
  useEffect(() => subscribe(force), []);
  return selector(state);
}

// ---- games -----------------------------------------------------------------
// Games live in IndexedDB (room for thousands of analysed games) with an
// in-memory cache, so reads stay synchronous. If IndexedDB isn't available the
// old one-key-per-game localStorage layout is used instead.
const DB_NAME = 'outpost';
const STORE = 'games';
let db = null;
export let gameBackend = 'localStorage';
let gameVer = 0;
/** Bumps whenever a stored game changes — use it in memo dependencies. */
export const gamesVersion = () => gameVer;
function openDb() {
  return new Promise((resolve, reject) => {
    try {
      const r = indexedDB.open(DB_NAME, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
      r.onblocked = () => reject(new Error('blocked'));
    } catch (e) {
      reject(e);
    }
  });
}
function tx(mode, fn) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(req && req.result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}
const storeFailed = (e) => {
  lastError = e && e.name === 'QuotaExceededError' ? 'quota' : 'unavailable';
  listeners.forEach((l) => l());
};
/** Load games from IndexedDB (moving any older localStorage games across). Call once before rendering. */
export async function initGames() {
  if (typeof indexedDB === 'undefined') return gameBackend;
  try {
    db = await Promise.race([openDb(), new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000))]);
    const all = await tx('readonly', (st) => st.getAll());
    for (const g of all || []) if (g && g.id) gameCache.set(g.id, g);
    const keys = rawKeys().filter((k) => k.startsWith(`${NS}:game:`));
    if (keys.length) {
      const moved = [];
      for (const k of keys) {
        try {
          const g = JSON.parse(rawGet(k));
          if (g && g.id) {
            if (!gameCache.has(g.id)) gameCache.set(g.id, g);
            moved.push(gameCache.get(g.id));
          }
        } catch {
          /* skip damaged */
        }
      }
      await tx('readwrite', (st) => {
        for (const g of moved) st.put(g, g.id);
      });
      for (const k of keys) rawRemove(k);
    }
    gameBackend = 'indexedDB';
  } catch {
    db = null;
  }
  listeners.forEach((l) => l());
  return gameBackend;
}
function persistGame(g) {
  if (db) {
    tx('readwrite', (st) => st.put(g, g.id)).catch(storeFailed);
    return true;
  }
  return rawSet(GAME(g.id), JSON.stringify(g));
}
function removeStoredGame(id) {
  if (db) tx('readwrite', (st) => st.delete(id)).catch(() => {});
  rawRemove(GAME(id));
}
function clearStoredGames() {
  if (db) tx('readwrite', (st) => st.clear()).catch(() => {});
}

export const newId = (prefix = 'g') => `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export function getGame(id) {
  if (!id) return null;
  if (gameCache.has(id)) return gameCache.get(id);
  const raw = rawGet(GAME(id));
  if (!raw) return null;
  try {
    const g = JSON.parse(raw);
    gameCache.set(id, g);
    return g;
  } catch {
    return null;
  }
}
export function saveGame(game) {
  gameCache.set(game.id, game);
  gameVer++;
  persistGame(game);
  update((s) => {
    if (!s.gameOrder.includes(game.id)) s.gameOrder.unshift(game.id);
  }, { immediate: true });
  return game;
}
export function deleteGame(id) {
  gameCache.delete(id);
  gameVer++;
  removeStoredGame(id);
  update((s) => {
    s.gameOrder = s.gameOrder.filter((g) => g !== id);
    if (s.ui.reviewId === id) s.ui.reviewId = null;
  }, { immediate: true });
}
export const listGames = () => state.gameOrder.map(getGame).filter(Boolean);

export function logActivity(type, label, ref) {
  update((s) => {
    s.activity.unshift({ t: Date.now(), type, label, ref: ref || null });
    if (s.activity.length > 600) s.activity.length = 600;
  });
}

// ---- export / import ---------------------------------------------------------
export function exportAll() {
  flush();
  const games = {};
  for (const id of state.gameOrder) {
    const g = getGame(id);
    if (g) games[id] = g;
  }
  return JSON.stringify({ app: 'outpost', schema: SCHEMA_VERSION, exportedAt: new Date().toISOString(), core: state, games }, null, 1);
}

const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x);

/** Validate an export file. Returns { ok, error } or { ok, data, summary }. */
export function readExport(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: 'That file isn’t valid JSON. Choose a file created with “Export training data”.' };
  }
  if (!isObj(data) || data.app !== 'outpost' || !isObj(data.core)) return { ok: false, error: 'That JSON isn’t an Outpost export (missing the "app" and "core" fields).' };
  if (typeof data.schema === 'number' && data.schema > SCHEMA_VERSION) return { ok: false, error: `That export comes from a newer version (schema ${data.schema}); this app reads up to schema ${SCHEMA_VERSION}.` };
  const games = {};
  let skipped = 0;
  for (const [id, g] of Object.entries(isObj(data.games) ? data.games : {})) {
    try {
      if (!isObj(g) || !Array.isArray(g.moves) || g.id !== id) throw new Error('shape');
      replay(g.startFen || null, g.moves); // every stored game must be legal chess
      games[id] = g;
    } catch {
      skipped++;
    }
  }
  const base = defaults();
  const c = data.core;
  const core = {
    ...base,
    settings: { ...base.settings, ...(isObj(c.settings) ? c.settings : {}) },
    gameOrder: (Array.isArray(c.gameOrder) ? c.gameOrder : Object.keys(games)).filter((id) => games[id]),
    current: null,
    puzzleStats: isObj(c.puzzleStats) ? c.puzzleStats : {},
    customPuzzles: isObj(c.customPuzzles) ? c.customPuzzles : {},
    attempts: Array.isArray(c.attempts) ? c.attempts.filter(isObj) : [],
    repertoire: isObj(c.repertoire) ? c.repertoire : {},
    repertoireSeeded: !!c.repertoireSeeded,
    lessonProgress: isObj(c.lessonProgress) ? c.lessonProgress : {},
    drillStats: isObj(c.drillStats) ? c.drillStats : {},
    puzzleRating: isObj(c.puzzleRating) && typeof c.puzzleRating.r === 'number' ? c.puzzleRating : base.puzzleRating,
    convertStats: isObj(c.convertStats) ? c.convertStats : {},
    academy: isObj(c.academy) ? c.academy : {},
    pathUnlocked: isObj(c.pathUnlocked) ? c.pathUnlocked : {},
    debriefs: isObj(c.debriefs) ? c.debriefs : {},
    goal: isObj(c.goal) ? c.goal : null,
    ownPositions: isObj(c.ownPositions) ? c.ownPositions : {},
    calc: isObj(c.calc) && typeof c.calc.level === 'number' ? c.calc : base.calc,
    activity: Array.isArray(c.activity) ? c.activity.filter(isObj) : [],
    ui: { ...base.ui },
  };
  for (const id of Object.keys(games)) if (!core.gameOrder.includes(id)) core.gameOrder.push(id);
  const summary = {
    games: Object.keys(games).length,
    skipped,
    puzzles: Object.keys(core.puzzleStats).length,
    saved: Object.keys(core.customPuzzles).length,
    lines: Object.keys(core.repertoire).length,
    exportedAt: data.exportedAt || null,
  };
  return { ok: true, data: { core, games }, summary };
}

/** Apply a validated export. mode: 'replace' wipes first, 'merge' keeps what is here and adds what is new. */
export function applyImport({ core, games }, mode) {
  if (mode === 'replace') {
    for (const k of rawKeys()) rawRemove(k);
    clearStoredGames();
    gameCache.clear();
    state = core;
  } else {
    const s = state;
    for (const key of ['puzzleStats', 'customPuzzles', 'repertoire', 'lessonProgress', 'drillStats']) {
      for (const [id, v] of Object.entries(core[key])) {
        const mine = s[key][id];
        const newer = !mine || (v.last || v.at || v.updated || v.created || 0) > (mine.last || mine.at || mine.updated || mine.created || 0);
        if (newer) s[key][id] = v;
      }
    }
    const seen = new Set(s.attempts.map((a) => `${a.t}:${a.id}`));
    s.attempts = [...s.attempts, ...core.attempts.filter((a) => !seen.has(`${a.t}:${a.id}`))].sort((a, b) => a.t - b.t);
    const seenAct = new Set(s.activity.map((a) => `${a.t}:${a.type}`));
    s.activity = [...s.activity, ...core.activity.filter((a) => !seenAct.has(`${a.t}:${a.type}`))].sort((a, b) => b.t - a.t).slice(0, 600);
    s.repertoireSeeded = s.repertoireSeeded || core.repertoireSeeded;
    if (core.puzzleRating && (!s.puzzleRating || core.puzzleRating.n > s.puzzleRating.n)) s.puzzleRating = core.puzzleRating;
    s.convertStats = { ...(core.convertStats || {}), ...(s.convertStats || {}) };
    s.academy = { ...(core.academy || {}), ...(s.academy || {}) };
    s.pathUnlocked = { ...(core.pathUnlocked || {}), ...(s.pathUnlocked || {}) };
    s.debriefs = { ...(core.debriefs || {}), ...(s.debriefs || {}) };
    if (!s.goal && core.goal) s.goal = core.goal;
    s.ownPositions = { ...(core.ownPositions || {}), ...(s.ownPositions || {}) };
    if (core.calc && (!s.calc || (core.calc.rounds || 0) > (s.calc.rounds || 0))) s.calc = core.calc;
    s.settings.names = [...new Set([...(s.settings.names || []), ...(core.settings.names || [])])];
    const order = [...new Set([...s.gameOrder, ...core.gameOrder])];
    s.gameOrder = order;
  }
  for (const [id, g] of Object.entries(games)) {
    if (mode === 'merge' && getGame(id)) continue;
    gameCache.set(id, g);
    gameVer++;
    persistGame(g);
  }
  if (mode === 'merge') {
    state.gameOrder = state.gameOrder.filter((id) => getGame(id)).sort((a, b) => (getGame(b).created || 0) - (getGame(a).created || 0));
  }
  state = { ...state };
  dirty = true;
  flush();
  listeners.forEach((l) => l());
}

export function resetAll() {
  for (const k of rawKeys()) rawRemove(k);
  clearStoredGames();
  gameCache.clear();
  memory = new Map();
  state = defaults();
  dirty = true;
  flush();
  listeners.forEach((l) => l());
}

export function storageUsage() {
  let bytes = 0;
  for (const k of rawKeys()) bytes += (rawGet(k) || '').length + k.length;
  if (db) for (const g of gameCache.values()) bytes += JSON.stringify(g).length;
  return bytes;
}
