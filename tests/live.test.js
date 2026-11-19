import { describe, it, expect } from 'vitest';
import { preMoveWarning, verdictFor, adjustWheels } from '../src/lib/coach.js';
import { gameMetrics, reviewedSeries, trend, goalStatus, targetFor, suggestedGoal } from '../src/lib/goals.js';
import { makeDebrief, pendingDebriefs, debriefHook, FRESH } from '../src/lib/debrief.js';
import { recentMonths, liveSyncDue } from '../src/lib/sync.js';
import { getState, update } from '../src/lib/store.js';

const mv = (cls, loss, tags = [], phase = 'middlegame') => ({ cls, loss, tags, text: 'Explained.', turning: false, phase, bestSan: 'Nf3' });
// I'm White: move 3 (ply 4) hangs a piece; Black's moves are fine.
const mk = (id, created, { hung = 1, acc = 80, source = 'sync' } = {}) => ({
  id, created, source, userColor: 'w', white: 'ThePawnScum', black: 'Rival', result: '0-1',
  moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6', 'd3', 'Be7', 'O-O', 'O-O', 'Re1', 'd6'],
  analysis: {
    accuracy: { w: acc, b: 85 },
    moves: Array.from({ length: 12 }, (_, i) => (i === 4 && hung ? mv('blunder', 40, ['hung-piece']) : i === 8 && hung > 1 ? mv('mistake', 20, ['hung-piece']) : mv('good', 1))),
    evals: Array.from({ length: 13 }, () => ({ cp: 0, best: 'a2a3', pv: ['a2a3'] })),
  },
});

describe('live coach', () => {
  it('warns before a move that hangs a piece, and before allowing mate', () => {
    // 1.e4 e5 2.Qh5?? Nc6 3.Qxe5+?? — the queen move into a defended pawn
    const fen = 'r1bqkbnr/pppp1ppp/2n5/4p2Q/4P3/8/PPPP1PPP/RNB1KBNR w KQkq - 2 3';
    const w = preMoveWarning(fen, { from: 'h5', to: 'e5' }, 'w', 3);
    expect(w && w.kind).toBe('piece');
    expect(w.text).toMatch(/queen you just moved/);
    expect(preMoveWarning(fen, { from: 'h5', to: 'e5' }, 'w', 1)).toBe(null); // mates only
    expect(preMoveWarning(fen, { from: 'g1', to: 'f3' }, 'w', 3)).toBe(null);
    // Fool's mate: 1.f3 e5 2.g4?? allows Qh4#
    const fool = 'rnbqkbnr/pppp1ppp/8/4p3/8/5P2/PPPPP1PP/RNBQKBNR w KQkq - 0 2';
    expect(preMoveWarning(fool, { from: 'g2', to: 'g4' }, 'w', 1).kind).toBe('mate');
    expect(preMoveWarning(fool, { from: 'g2', to: 'g4' }, 'w', 0)).toBe(null);
  });
  it('gives every move a verdict', () => {
    expect(verdictFor(0, true).label).toBe('Best move');
    expect(verdictFor(4, false).key).toBe('good');
    expect(verdictFor(8, false).key).toBe('inaccuracy');
    expect(verdictFor(20, false).key).toBe('mistake');
    expect(verdictFor(45, false).key).toBe('blunder');
  });
  it('lowers the training wheels after three clean games and raises them after a messy one', () => {
    let w = { level: 3, games: [] };
    for (let i = 0; i < 2; i++) w = adjustWheels(w, { moves: 30, warned: 1 }).wheels;
    expect(w.level).toBe(3);
    const r = adjustWheels(w, { moves: 30, warned: 0 });
    expect([r.wheels.level, r.change]).toEqual([2, -1]);
    expect(adjustWheels(r.wheels, { moves: 30, warned: 5 }).wheels.level).toBe(3);
    expect(adjustWheels({ level: 2, games: [{ moves: 30, warned: 0 }, { moves: 30, warned: 0 }] }, { moves: 8, warned: 0 }).wheels.level).toBe(2); // too short to count
  });
});

describe('goals', () => {
  const now = Date.now();
  const games = Array.from({ length: 30 }, (_, i) => mk(`g${i}`, now - (30 - i) * 3600e3, { hung: i < 20 ? 2 : 0, acc: i < 20 ? 70 : 88 }));
  it('counts per-game numbers', () => {
    expect(gameMetrics(mk('x', now, { hung: 2 }))).toMatchObject({ hung: 2, blunders: 1, mistakes: 2, accuracy: 80 });
  });
  it('compares the last 10 with the last 50 and says which way it is going', () => {
    const s = reviewedSeries(games);
    const t = trend(s, 'hung');
    expect([t.last10, t.last50, t.direction]).toEqual([0, 1.3, 'better']);
    expect(trend(s, 'accuracy').direction).toBe('better');
    expect(t.spark.length).toBeGreaterThan(5);
    expect(targetFor('hung', t)).toBe(0.8);
    expect(goalStatus({ metric: 'hung', target: 0.8 }, t).state).toBe('met');
    expect(goalStatus({ metric: 'hung', target: 0.8 }, trend([], 'hung')).state).toBe('none');
  });
  it('suggests a goal from the biggest weakness', () => {
    expect(suggestedGoal(games).metric).toBe('hung');
  });
});

describe('debrief', () => {
  it('summarises the biggest moment of a fresh synced game', () => {
    const d = makeDebrief(mk('d1', Date.now() - 60000));
    expect(d.steps).toBeGreaterThan(0);
    expect(d.headline).toMatch(/Left a piece hanging on move 3 \(Bc4\)/);
    expect(d.opp).toBe('Rival');
  });
  it('only debriefs fresh synced games, once', () => {
    update((s) => (s.debriefs = {}));
    expect(debriefHook(mk('old', Date.now() - FRESH - 1000), { quiet: true })).toBe(null);
    expect(debriefHook(mk('mine', Date.now() - 1000, { source: 'play' }), { quiet: true })).toBe(null);
    expect(debriefHook(mk('new', Date.now() - 1000), { quiet: true })).toBeTruthy();
    expect(debriefHook(mk('new', Date.now() - 1000), { quiet: true })).toBe(null);
    expect(pendingDebriefs(getState()).map((d) => d.id)).toEqual(['new']);
  });
});

describe('live sync', () => {
  it('asks chess.com for just this month (and last) on frequent checks', () => {
    expect(recentMonths(Date.UTC(2026, 10, 18), Date.UTC(2026, 10, 19))).toEqual([[2026, 11]]);
    expect(recentMonths(Date.UTC(2026, 9, 31), Date.UTC(2026, 10, 1))).toEqual([[2026, 10], [2026, 11]]);
    expect(recentMonths(Date.UTC(2025, 11, 31), Date.UTC(2026, 0, 2))).toEqual([[2025, 12], [2026, 1]]);
    expect(recentMonths(Date.UTC(2026, 6, 1), Date.UTC(2026, 10, 1))).toBe(null);
    expect(recentMonths(0)).toBe(null);
  });
  it('checks every few minutes while open, unless blocked or switched off', () => {
    const base = { settings: { accounts: { lichess: 'x' }, sync: { auto: true } }, syncLog: {} };
    expect(liveSyncDue(base)).toBe(true);
    expect(liveSyncDue({ ...base, syncLog: { lastAttempt: Date.now() - 60e3 } })).toBe(false);
    expect(liveSyncDue({ ...base, syncLog: { blocked: true } })).toBe(false);
    expect(liveSyncDue({ ...base, settings: { ...base.settings, sync: { auto: true, live: false } } })).toBe(false);
  });
});
