import { describe, it, expect, beforeEach } from 'vitest';
import { monthsToFetch, sideOf, lichessUrl, chessComMonthPgnUrl, syncAccounts, autoSyncDue, downloadLinks } from '../src/lib/sync.js';
import { getState, update, listGames } from '../src/lib/store.js';

const pgn = (site, white, black, id, date = '2026.11.10') => `[Event "Rated Blitz game"]
[Site "${site}/${id}"]
[Date "${date}"]
[White "${white}"]
[Black "${black}"]
[Result "1-0"]
[UTCDate "${date}"]
[UTCTime "18:00:00"]
${site.includes('chess.com') ? `[Link "${site}/game/live/${id}"]\n` : ''}
1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7# 1-0
`;

function fakeFetch(routes, calls = []) {
  return async (url) => {
    calls.push(url);
    for (const [re, body] of routes) {
      if (re.test(url)) {
        if (body instanceof Error) throw body;
        if (typeof body === 'number') return { ok: false, status: body, text: async () => '', json: async () => ({}) };
        return { ok: true, status: 200, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)), json: async () => body };
      }
    }
    return { ok: false, status: 404, text: async () => '', json: async () => ({}) };
  };
}

describe('account sync', () => {
  beforeEach(() => {
    update((s) => {
      s.settings.accounts = { chesscom: 'ThePawnScum', lichess: 'ThePawnScum12' };
      s.settings.sync = { auto: true, analyse: false };
      s.syncLog = {};
    });
  });

  it('builds the right URLs and months', () => {
    expect(lichessUrl('ThePawnScum12', 0)).toContain('/api/games/user/ThePawnScum12?');
    expect(lichessUrl('ThePawnScum12', 0)).toContain('max=200');
    expect(lichessUrl('x', 1000)).toContain('since=1000');
    expect(chessComMonthPgnUrl('ThePawnScum', 2026, 3)).toBe('https://api.chess.com/pub/player/thepawnscum/games/2026/03/pgn');
    const arch = ['2025/12', '2026/01', '2026/09', '2026/10', '2026/11'].map((m) => `https://api.chess.com/pub/player/x/games/${m}`);
    expect(monthsToFetch(arch, 0)).toEqual([[2026, 9], [2026, 10], [2026, 11]]);
    expect(monthsToFetch(arch, Date.UTC(2026, 9, 20), Date.UTC(2026, 10, 19))).toEqual([[2026, 10], [2026, 11]]);
  });

  it('knows which side I played', () => {
    expect(sideOf({ white: 'thepawnscum', black: 'x' }, 'ThePawnScum')).toBe('w');
    expect(sideOf({ white: 'x', black: 'ThePawnScum12' }, 'ThePawnScum12')).toBe('b');
    expect(sideOf({ white: 'x', black: 'y' }, 'ThePawnScum')).toBe(null);
  });

  it('imports new games from both sites with my side set, and skips them next time', async () => {
    const before = listGames().length;
    const routes = [
      [/lichess\.org\/api\/games\/user\/ThePawnScum12/, pgn('https://lichess.org', 'Rival', 'ThePawnScum12', 'abc12345') + '\n' + pgn('https://lichess.org', 'ThePawnScum12', 'Other', 'def67890')],
      [/games\/archives$/, { archives: ['https://api.chess.com/pub/player/thepawnscum/games/2026/11'] }],
      [/games\/2026\/11\/pgn$/, pgn('https://www.chess.com', 'ThePawnScum', 'Opp', '111')],
    ];
    const res = await syncAccounts({ fetchImpl: fakeFetch(routes) });
    expect(res.results.map((r) => [r.site, r.added])).toEqual([['chesscom', 1], ['lichess', 2]]);
    const games = listGames().slice(0, 3);
    expect(listGames().length).toBe(before + 3);
    expect(games.map((g) => g.userColor).sort()).toEqual(['b', 'w', 'w']);
    expect(games.every((g) => g.source === 'sync')).toBe(true);
    expect(getState().syncLog.lichess.okAt).toBeGreaterThan(0);
    const calls = [];
    const again = await syncAccounts({ fetchImpl: fakeFetch(routes, calls) });
    expect(again.ids.length).toBe(0);
    expect(again.results.find((r) => r.site === 'lichess').dupes).toBe(2);
    expect(calls.find((u) => u.includes('lichess')).includes('since=')).toBe(true);
  });

  it('reports a blocked page and a missing account plainly', async () => {
    const blocked = await syncAccounts({ fetchImpl: fakeFetch([[/./, new TypeError('Failed to fetch')]]) });
    expect(blocked.results.every((r) => r.kind === 'blocked')).toBe(true);
    expect(getState().syncLog.blocked).toBe(true);
    expect(autoSyncDue(getState())).toBe(false);
    expect(downloadLinks(getState()).map((l) => l.site)).toEqual(['lichess', 'chesscom', 'chesscom']);
    update((s) => (s.syncLog = {}));
    const missing = await syncAccounts({ fetchImpl: fakeFetch([[/lichess/, 404], [/archives/, 404]]) });
    expect(missing.results.every((r) => r.kind === 'notfound')).toBe(true);
    expect(getState().syncLog.blocked).toBe(false);
  });

  it('only auto-syncs every few hours, and only when switched on', () => {
    const s = getState();
    expect(autoSyncDue({ ...s, syncLog: {} })).toBe(true);
    expect(autoSyncDue({ ...s, syncLog: { lastAttempt: Date.now() - 60000 } })).toBe(false);
    expect(autoSyncDue({ ...s, settings: { ...s.settings, sync: { auto: false } }, syncLog: {} })).toBe(false);
  });
});
