import { describe, it, expect } from 'vitest';
import { Chess } from 'chess.js';
import { replay, parsePgn, buildPgn, describeEnd, isPromotion } from '../src/lib/chessx.js';
import { readExport } from '../src/lib/store.js';
import { schedule, recordAttempt, dueIds, DAY } from '../src/lib/srs.js';
import { streak, openingPerformance, recurringMistakes, nextActions } from '../src/lib/insights.js';
import PUZZLES from '../src/data/puzzles.json';
import { LESSONS } from '../src/data/lessons.js';
import { DRILLS } from '../src/data/drills.js';
import { SEED_LINES } from '../src/data/repertoire-seed.js';
import { THEME_BY_ID } from '../src/data/themes.js';

describe('rules (chess.js through our helpers)', () => {
  it('castles both ways and records it in SAN', () => {
    const r = replay('r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1', ['O-O', 'O-O-O']);
    expect(r.fens[2].split(' ')[0]).toBe('2kr3r/pppppppp/8/8/8/8/PPPPPPPP/R4RK1');
    expect(r.plies[0].flags).toContain('k');
    expect(r.plies[1].flags).toContain('q');
  });
  it('refuses castling through check', () => {
    expect(() => replay('4k3/8/8/8/8/8/5r2/4K2R w K - 0 1', ['O-O'])).toThrow(/not legal/);
  });
  it('captures en passant only immediately', () => {
    const r = replay(null, ['e4', 'a6', 'e5', 'd5', 'exd6']);
    expect(r.plies[4].flags).toContain('e');
    expect(r.fens[5].split(' ')[0]).toBe('rnbqkbnr/1pp1pppp/p2P4/8/8/8/PPPP1PPP/RNBQKBNR');
    expect(() => replay(null, ['e4', 'a6', 'e5', 'd5', 'h3', 'h6', 'exd6'])).toThrow();
  });
  it('detects promotion and promotes to any piece', () => {
    const c = new Chess('4k3/1P6/8/8/8/8/8/4K3 w - - 0 1');
    expect(isPromotion(c, 'b7', 'b8')).toBe(true);
    expect(isPromotion(c, 'e1', 'e2')).toBe(false);
    const r = replay('4k3/1P6/8/8/8/8/8/4K3 w - - 0 1', ['b8=N']);
    expect(r.fens[1].startsWith('1N2k3')).toBe(true);
  });
  it('ends the game on checkmate, stalemate and dead positions', () => {
    expect(describeEnd(replay(null, ['f3', 'e5', 'g4', 'Qh4#']).final)).toMatchObject({ over: true, result: '0-1', reason: 'checkmate' });
    expect(describeEnd(new Chess('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1'))).toMatchObject({ result: '1/2-1/2', reason: 'stalemate' });
    expect(describeEnd(new Chess('8/8/4k3/8/8/3NK3/8/8 w - - 0 1')).reason).toBe('insufficient material');
  });
});

describe('PGN', () => {
  it('reports invalid PGN in plain words', () => {
    expect(parsePgn('').errors[0]).toMatch(/Nothing to import/);
    expect(parsePgn('1. e4 e5 2. Ke3 Nc6').errors[0]).toMatch(/Ke3/);
    expect(parsePgn('this is not chess').errors.length).toBe(1);
  });
  it('reads several games with headers and a FEN start', () => {
    const src = '[White "A"]\n[Black "B"]\n[Result "1-0"]\n\n1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7# 1-0\n\n[White "C"]\n[Black "D"]\n[SetUp "1"]\n[FEN "4k3/8/8/8/8/8/4P3/4K3 w - - 0 1"]\n\n1. e4 Kd7 *';
    const { games, errors } = parsePgn(src);
    expect(errors).toEqual([]);
    expect(games).toHaveLength(2);
    expect(games[0]).toMatchObject({ white: 'A', black: 'B', result: '1-0' });
    expect(games[1].startFen).toBe('4k3/8/8/8/8/8/4P3/4K3 w - - 0 1');
  });
  it('round-trips our own games through PGN export', () => {
    const g = { moves: ['e4', 'c5', 'Nf3', 'd6'], white: 'You', black: 'Outpost L3', result: '0-1', created: Date.UTC(2026, 10, 17), source: 'play', termination: 'White resigned' };
    const pgn = buildPgn(g);
    expect(pgn).toMatch(/\[Result "0-1"\]/);
    expect(pgn.trim().endsWith('0-1')).toBe(true);
    expect(parsePgn(pgn).games[0].moves).toEqual(g.moves);
  });
});

describe('backup files', () => {
  it('rejects anything that is not an Outpost export', () => {
    expect(readExport('nope').ok).toBe(false);
    expect(readExport('{"a":1}').ok).toBe(false);
    expect(readExport(JSON.stringify({ app: 'outpost', schema: 99, core: {} })).error).toMatch(/newer version/);
  });
  it('keeps valid games and skips damaged ones', () => {
    const r = readExport(JSON.stringify({ app: 'outpost', schema: 1, core: { gameOrder: ['g1', 'g2'] }, games: { g1: { id: 'g1', moves: ['e4', 'e5'] }, g2: { id: 'g2', moves: ['e4', 'Ke7??'] } } }));
    expect(r.ok).toBe(true);
    expect(r.summary).toMatchObject({ games: 1, skipped: 1 });
    expect(r.data.core.gameOrder).toEqual(['g1']);
  });
});

describe('spaced repetition', () => {
  it('only queues misses, then spaces successes out', () => {
    const now = Date.UTC(2026, 0, 1);
    expect(recordAttempt(null, { ok: true, now }).srs).toBeUndefined();
    const missed = recordAttempt(null, { ok: false, now });
    expect(missed.srs.due).toBe(now + 10 * 60 * 1000);
    const again = recordAttempt(missed, { ok: true, now: now + 1 });
    expect(again.srs.box).toBe(1);
    expect(again.srs.due).toBe(now + 1 + DAY);
    expect(schedule(again.srs, false, now).box).toBe(0);
    expect(dueIds({ a: missed, b: again }, now + 11 * 60 * 1000)).toEqual(['a']);
  });
  it('counts a hinted solve as a miss', () => {
    expect(recordAttempt(null, { ok: true, hint: true }).srs).toBeDefined();
  });
});

describe('insights', () => {
  const day = (n) => Date.UTC(2026, 10, 17, 12) - n * DAY;
  it('counts a streak of consecutive training days', () => {
    expect(streak([{ t: day(0) }, { t: day(1) }, { t: day(3) }], [], day(0))).toBe(2);
    expect(streak([{ t: day(1) }, { t: day(2) }], [], day(0))).toBe(2); // today not done yet
    expect(streak([], [], day(0))).toBe(0);
  });
  it('groups results by opening family and colour', () => {
    const games = [
      { id: '1', userColor: 'w', result: '1-0', opening: 'Italian Game, Giuoco Piano', moves: [] },
      { id: '2', userColor: 'w', result: '0-1', opening: 'Italian Game, Two Knights Defence', moves: [] },
      { id: '3', userColor: 'b', result: '1/2-1/2', opening: 'Sicilian Defence', moves: [] },
      { id: '4', userColor: 'w', result: '*', opening: 'Italian Game', moves: [] },
    ];
    const p = openingPerformance(games);
    expect(p.games).toBe(3);
    expect(p.rows[0]).toMatchObject({ name: 'Italian Game', color: 'w', n: 2, w: 1, l: 1, score: 50 });
  });
  it('tags only my own mistakes', () => {
    const g = { id: 'x', userColor: 'b', white: 'A', black: 'B', analysis: { moves: [{ cls: 'blunder', tags: ['hung-piece'], loss: 40 }, { cls: 'blunder', tags: ['allowed-fork'], loss: 35 }] } };
    const r = recurringMistakes([g]);
    expect(r.list.map((x) => x.tag)).toEqual(['allowed-fork']);
    expect(r.byTheme[0].theme).toBe('fork');
  });
  it('always offers a next action, preferring an unreviewed game', () => {
    const base = { current: null, puzzleStats: {}, attempts: [], lessonProgress: {}, customPuzzles: {} };
    expect(nextActions(base, []).length).toBeGreaterThan(0);
    const g = { id: 'g', source: 'play', created: Date.now(), white: 'You', black: 'Bot', moves: ['e4'], analysis: null };
    expect(nextActions(base, [g])[0].id).toBe('review');
  });
});

describe('content integrity', () => {
  it('every puzzle is legal, tagged with known themes and ends well for the solver', () => {
    for (const p of PUZZLES) {
      if (p.lead) {
        const c = new Chess(p.lead.fen);
        c.move({ from: p.lead.uci.slice(0, 2), to: p.lead.uci.slice(2, 4), promotion: p.lead.uci[4] });
        expect(c.fen()).toBe(p.fen);
      }
      const c = new Chess(p.fen);
      for (const u of p.solution) c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
      expect(p.solution.length % 2).toBe(1); // the solver plays the last move
      for (const t of p.themes) expect(THEME_BY_ID[t], `${p.id} theme ${t}`).toBeTruthy();
    }
    expect(new Set(PUZZLES.map((p) => p.id)).size).toBe(PUZZLES.length);
  });
  it('lesson, drill and repertoire positions are legal', () => {
    for (const l of LESSONS)
      for (const s of l.steps) {
        const c = new Chess(s.fen);
        for (const san of s.accept || []) expect(() => new Chess(s.fen).move(san), `${l.id}: ${san}`).not.toThrow();
        if (s.reply) {
          c.move(s.accept[0]);
          expect(() => c.move(s.reply)).not.toThrow();
        }
      }
    for (const d of DRILLS) expect(new Chess(d.fen).isGameOver()).toBe(false);
    for (const line of SEED_LINES) expect(() => replay(null, line.moves)).not.toThrow();
  });
});
