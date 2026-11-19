// Turning parsed PGN games into stored games: duplicate detection, the time a
// game was played, and saving. Shared by the import panel and account sync.
import { saveGame, listGames, newId, storageStatus } from './store.js';
import { nameOpening } from '../data/openings.js';

export const gameKey = (g) => g.link || `${g.white}|${g.black}|${g.date || ''}|${g.moves.slice(0, 40).join(' ')}`;

export const playedAt = (g, i = 0) => {
  const h = g.headers || {};
  const d = (h.UTCDate || h.Date || '').replace(/\./g, '-');
  const t = h.UTCTime || h.StartTime || '12:00:00.001'; // .001 marks "date only"
  const ms = /^\d{4}-\d{2}-\d{2}$/.test(d) ? Date.parse(`${d}T${t}${h.UTCDate ? 'Z' : ''}`) : NaN;
  return Number.isFinite(ms) ? ms : Date.now() - 1000 - i;
};

/** Drop games already in the library (or repeated in this batch). */
export function dedupe(games, have = new Set(listGames().map(gameKey))) {
  const seen = new Set();
  const fresh = [];
  let dupes = 0;
  for (const g of games) {
    const k = gameKey(g);
    if (have.has(k) || seen.has(k)) {
      dupes++;
      continue;
    }
    seen.add(k);
    fresh.push(g);
  }
  return { fresh, dupes };
}

/**
 * Save parsed games (each with `side`: 'w' | 'b' | null), oldest first so the
 * newest ends up on top. Stops if storage fills. Returns { ids, full }.
 */
export function saveImported(games, { source = 'import', site = null } = {}) {
  const list = games.map((g, i) => ({ g, at: playedAt(g, i) })).sort((a, b) => a.at - b.at);
  const ids = [];
  let full = false;
  for (const { g, at } of list) {
    const id = newId('i');
    saveGame({
      id,
      created: at,
      source,
      site,
      white: g.white,
      black: g.black,
      result: g.result,
      date: g.date ? g.date.replace(/-/g, '.') : null,
      event: g.event,
      userColor: g.side || null,
      startFen: g.startFen,
      moves: g.moves,
      clocks: g.clocks,
      timeControl: g.timeControl,
      whiteElo: g.whiteElo,
      blackElo: g.blackElo,
      link: g.link,
      termination: g.termination,
      opening: nameOpening(g.moves, g.startFen).name,
      analysis: null,
    });
    ids.push(id);
    if (storageStatus().error === 'quota') {
      full = true;
      break;
    }
  }
  return { ids, full, total: list.length };
}
