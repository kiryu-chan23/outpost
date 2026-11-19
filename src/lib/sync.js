// Account sync: fetch new games from chess.com and Lichess, import them with my
// side already set, and queue them for analysis.
//
// Both sites publish games without a login. Whether a browser page may fetch
// them depends on where the app runs: a copy opened from your own computer or
// hosted on a normal site can; a page inside a sandbox that blocks outside
// connections (like the hosted preview in chat) cannot, and gets one-click
// download links instead.
import { getState, update, logActivity } from './store.js';
import { parsePgn } from './chessx.js';
import { dedupe, saveImported } from './gameimport.js';
import { startBatch } from './batch.js';

export const SITES = {
  lichess: { name: 'Lichess', profile: (u) => `https://lichess.org/@/${encodeURIComponent(u)}` },
  chesscom: { name: 'Chess.com', profile: (u) => `https://www.chess.com/member/${encodeURIComponent(u)}` },
};

const FIRST_LICHESS = 200; // most recent games on the first sync
const FIRST_MONTHS = 3; // chess.com months on the first sync
const OVERLAP = 36 * 3600 * 1000; // re-ask a little before the last sync; duplicates are dropped
export const AUTO_EVERY = 3 * 3600 * 1000;
export const LIVE_EVERY = 4 * 60 * 1000; // while the app is open with live watching on

export const lichessUrl = (user, since) =>
  `https://lichess.org/api/games/user/${encodeURIComponent(user)}?clocks=true&opening=true&evals=false&literate=false${since ? `&since=${Math.max(0, since)}` : `&max=${FIRST_LICHESS}`}`;
export const chessComArchivesUrl = (user) => `https://api.chess.com/pub/player/${encodeURIComponent(user.toLowerCase())}/games/archives`;
export const chessComMonthPgnUrl = (user, y, m) => `https://api.chess.com/pub/player/${encodeURIComponent(user.toLowerCase())}/games/${y}/${String(m).padStart(2, '0')}/pgn`;

/** chess.com months (as [year, month]) to fetch: those from `since`'s month to now, or the last few. */
export function monthsToFetch(archives, since, now = Date.now()) {
  const months = archives
    .map((u) => u.match(/\/(\d{4})\/(\d{2})$/))
    .filter(Boolean)
    .map((m) => [+m[1], +m[2]])
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (!since) return months.slice(-FIRST_MONTHS);
  const d = new Date(since);
  const from = d.getUTCFullYear() * 12 + d.getUTCMonth();
  const to = new Date(now).getUTCFullYear() * 12 + new Date(now).getUTCMonth();
  return months.filter(([y, m]) => {
    const k = y * 12 + m - 1;
    return k >= from && k <= to;
  });
}

class SyncError extends Error {
  constructor(kind, message) {
    super(message);
    this.kind = kind; // blocked | notfound | limited | failed
  }
}

async function get(url, { signal, accept, fetchImpl }) {
  let res;
  try {
    res = await fetchImpl(url, { signal, headers: accept ? { Accept: accept } : {} });
  } catch (err) {
    if (err && err.name === 'AbortError') throw err;
    // A TypeError here means the request never got an answer the page may read:
    // offline, or blocked by the page's sandbox / the site's CORS rules.
    throw new SyncError('blocked', 'This page couldn’t reach the site.');
  }
  if (res.status === 404) throw new SyncError('notfound', 'No account with that name.');
  if (res.status === 429) throw new SyncError('limited', 'The site asked us to slow down. Try again in a minute.');
  if (!res.ok) throw new SyncError('failed', `The site answered with an error (${res.status}).`);
  return res;
}

export async function fetchLichess(user, since, { signal, fetchImpl = fetch } = {}) {
  const res = await get(lichessUrl(user, since), { signal, accept: 'application/x-chess-pgn', fetchImpl });
  return res.text();
}

/** Months from `since` to `now` (UTC), when that's at most two — no need to ask for the archive list. */
export function recentMonths(since, now = Date.now()) {
  if (!since) return null;
  const a = new Date(since);
  const b = new Date(now);
  const from = a.getUTCFullYear() * 12 + a.getUTCMonth();
  const to = b.getUTCFullYear() * 12 + b.getUTCMonth();
  if (to - from > 1 || to < from) return null;
  const out = [];
  for (let k = from; k <= to; k++) out.push([Math.floor(k / 12), (k % 12) + 1]);
  return out;
}

export async function fetchChessCom(user, since, { signal, fetchImpl = fetch, now = Date.now() } = {}) {
  const direct = recentMonths(since, now);
  if (direct) {
    // Frequent checks: just this month (and last), and a month with no games yet is simply empty.
    const texts = [];
    for (const [y, m] of direct) {
      try {
        const r = await get(chessComMonthPgnUrl(user, y, m), { signal, fetchImpl });
        texts.push(await r.text());
      } catch (err) {
        if (err && err.kind === 'notfound') continue;
        throw err;
      }
    }
    return texts.join('\n\n');
  }
  const res = await get(chessComArchivesUrl(user), { signal, fetchImpl });
  const { archives = [] } = await res.json();
  const months = monthsToFetch(archives, since, now);
  const texts = [];
  for (const [y, m] of months) {
    const r = await get(chessComMonthPgnUrl(user, y, m), { signal, fetchImpl });
    texts.push(await r.text());
  }
  return texts.join('\n\n');
}

/** Which side `user` played, by name (case-insensitive). */
export function sideOf(g, user) {
  const u = user.toLowerCase();
  return (g.white || '').toLowerCase() === u ? 'w' : (g.black || '').toLowerCase() === u ? 'b' : null;
}

let running = null;
export const syncRunning = () => !!running;

/**
 * Sync every account that has a username. Returns per-site results:
 * { site, user, added, dupes, error?, kind? }, plus the new game ids.
 * Records the outcome in state.syncLog.
 */
export async function syncAccounts({ signal, fetchImpl = typeof fetch !== 'undefined' ? fetch.bind(globalThis) : null, analyse, quiet = false } = {}) {
  if (running) return running;
  running = (async () => {
    const s = getState();
    const accounts = s.settings.accounts || {};
    const log = s.syncLog || {};
    const results = [];
    const ids = [];
    for (const site of ['chesscom', 'lichess']) {
      const user = (accounts[site] || '').trim();
      if (!user) continue;
      const prev = log[site] || {};
      const since = prev.okAt ? prev.okAt - OVERLAP : 0;
      try {
        const text = site === 'lichess' ? await fetchLichess(user, since, { signal, fetchImpl }) : await fetchChessCom(user, since, { signal, fetchImpl });
        const { games } = parsePgn(text || '');
        const { fresh, dupes } = dedupe(games);
        const saved = saveImported(
          fresh.map((g) => ({ ...g, side: sideOf(g, user) })),
          { source: 'sync', site },
        );
        ids.push(...saved.ids);
        results.push({ site, user, added: saved.ids.length, dupes, full: saved.full });
      } catch (err) {
        if (err && err.name === 'AbortError') throw err;
        results.push({ site, user, added: 0, dupes: 0, error: err.message || String(err), kind: err.kind || 'failed' });
      }
    }
    const now = Date.now();
    update((st) => {
      const l = { ...(st.syncLog || {}) };
      for (const r of results) {
        const p = l[r.site] || {};
        l[r.site] = r.error ? { ...p, at: now, error: r.error, kind: r.kind, user: r.user } : { at: now, okAt: now, added: r.added, user: r.user, error: null, kind: null, total: (p.user === r.user ? p.total || 0 : 0) + r.added };
      }
      l.lastAttempt = now;
      l.blocked = results.length > 0 && results.every((r) => r.kind === 'blocked');
      st.syncLog = l;
      const learned = new Set(st.settings.names || []);
      for (const r of results) if (!r.error) learned.add(r.user);
      st.settings.names = [...learned].slice(-12);
    });
    const added = ids.length;
    if (added) logActivity('import', `Synced ${added} new game${added === 1 ? '' : 's'} from ${results.filter((r) => r.added).map((r) => SITES[r.site].name).join(' and ')}`, ids[ids.length - 1]);
    const doAnalyse = analyse ?? getState().settings.sync?.analyse ?? true;
    if (added && doAnalyse) startBatch(ids.slice().reverse(), { front: true }); // newest first, ahead of any backlog
    return { results, ids, quiet, analysing: !!(added && doAnalyse) };
  })();
  try {
    return await running;
  } finally {
    running = null;
  }
}

/** Should the app sync by itself now? */
export function autoSyncDue(state, now = Date.now()) {
  const a = state.settings.accounts || {};
  if (!state.settings.sync?.auto || !(a.lichess || a.chesscom)) return false;
  const log = state.syncLog || {};
  // Once a sync has been blocked here, don't retry on every open; the Data page offers download links.
  if (log.blocked) return now - (log.lastAttempt || 0) > 24 * AUTO_EVERY;
  return now - (log.lastAttempt || 0) > AUTO_EVERY;
}

/** While the app is open: check every few minutes so a finished game gets its debrief quickly. */
export function liveSyncDue(state, now = Date.now()) {
  const a = state.settings.accounts || {};
  const sy = state.settings.sync || {};
  if (!sy.auto || sy.live === false || !(a.lichess || a.chesscom)) return false;
  const log = state.syncLog || {};
  if (log.blocked) return false;
  return now - (log.lastAttempt || 0) > LIVE_EVERY;
}

/** Plain download links for when the page can't fetch: since the last good sync, or recent. */
export function downloadLinks(state, now = new Date()) {
  const a = state.settings.accounts || {};
  const log = state.syncLog || {};
  const out = [];
  if (a.lichess) {
    const since = log.lichess?.okAt ? log.lichess.okAt - OVERLAP : 0;
    out.push({ site: 'lichess', label: `Lichess games${since ? ' since your last sync' : ` (last ${FIRST_LICHESS})`}`, url: lichessUrl(a.lichess, since) });
  }
  if (a.chesscom) {
    const y = now.getUTCFullYear();
    const m = now.getUTCMonth() + 1;
    out.push({ site: 'chesscom', label: 'Chess.com games this month', url: chessComMonthPgnUrl(a.chesscom, y, m) });
    const py = m === 1 ? y - 1 : y;
    const pm = m === 1 ? 12 : m - 1;
    out.push({ site: 'chesscom', label: 'Chess.com games last month', url: chessComMonthPgnUrl(a.chesscom, py, pm) });
  }
  return out;
}
