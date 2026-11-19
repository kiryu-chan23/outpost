import { describe, it, expect } from 'vitest';
import { Chess } from 'chess.js';
import { parsePgn, buildPgn } from '../src/lib/chessx.js';
import { timeSpent, clockReport } from '../src/lib/clock.js';
import { wonPositions, userCp } from '../src/lib/convert.js';
import { scanTruth, judgeScan, hungAfter, scanSummary } from '../src/lib/blundercheck.js';
import { nextRating, attemptScore } from '../src/lib/puzzles.js';
import LICHESS from '../src/data/lichess-puzzles.json';
import { THEME_BY_ID } from '../src/data/themes.js';

describe('PGN clocks and headers', () => {
  const pgn = `[Event "Live Chess"]
[Site "Chess.com"]
[White "ThePawnScum"]
[Black "Opp"]
[Result "0-1"]
[WhiteElo "1002"]
[TimeControl "600"]
[Link "https://www.chess.com/game/live/1"]
[Termination "Opp won on time"]

1. e4 {[%clk 0:09:58.1]} 1... e5 {[%clk 0:09:57]} 2. Nf3 {[%clk 0:09:40]} 2... Nc6 {[%clk 0:09:50.5]} 0-1`;
  it('reads %clk, time control, ratings and the game link', () => {
    const g = parsePgn(pgn).games[0];
    expect(g.clocks).toEqual([598.1, 597, 580, 590.5]);
    expect(g.timeControl).toEqual({ base: 600, inc: 0 });
    expect(g.whiteElo).toBe(1002);
    expect(g.link).toBe('https://www.chess.com/game/live/1');
  });
  it('works out time per move and flags long thinks', () => {
    const g = { ...parsePgn(pgn).games[0], userColor: 'w' };
    expect(timeSpent(g)).toEqual([1.9, 3, 18.1, 6.5]);
    const r = clockReport(g);
    expect(r.moves.map((m) => m.spent)).toEqual([1.9, 18.1]);
    expect(r.total).toBeCloseTo(20);
  });
  it('exports TimeControl in seconds for both old and new games', () => {
    expect(buildPgn({ moves: ['e4'], white: 'a', black: 'b', result: '*', created: 0, timeControl: '10+0' })).toMatch(/TimeControl "600"/);
    expect(buildPgn({ moves: ['e4'], white: 'a', black: 'b', result: '*', created: 0, timeControl: { base: 180, inc: 2 } })).toMatch(/TimeControl "180\+2"/);
  });
});

describe('convert your wins', () => {
  const ev = (cp) => ({ cp, mate: null });
  it('reads evaluations from my side', () => {
    expect(userCp(ev(250), 'b')).toBe(-250);
    expect(userCp({ cp: null, mate: 3 }, 'w')).toBeGreaterThan(9000);
    expect(userCp({ winner: 'b' }, 'b')).toBe(10000);
  });
  it('finds the move that threw away a winning position in a game I didn’t win', () => {
    // 6 plies, I am White; I'm +5 before my 3rd move (ply 4) and it drops to 0.
    const g = { id: 'x', userColor: 'w', result: '1/2-1/2', white: 'Me', black: 'Them', moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5'], created: 1, analysis: { evals: [ev(20), ev(20), ev(400), ev(500), ev(500), ev(0), ev(0)] } };
    const [p] = wonPositions([g]);
    expect(p.ply).toBe(4);
    expect(p.played).toBe('Bc4');
    expect(p.outcome).toBe('drew');
    // A clean win is not a thrown win.
    expect(wonPositions([{ ...g, result: '1-0', analysis: { evals: [ev(20), ev(20), ev(400), ev(500), ev(600), ev(700), ev(800)] } }])).toEqual([]);
  });
});

describe('blunder check', () => {
  it('knows a loose knight is in danger and a defended one isn’t', () => {
    expect(scanTruth('4k3/8/8/8/3b4/8/1N6/4K3 w - - 0 1', 'w').squares).toEqual(['b2']);
    expect(scanTruth('4k3/8/8/8/3b4/8/1N6/2K5 w - - 0 1', 'w').squares).toEqual([]); // king defends b2: bishop for knight is even
  });
  it('spots a mate-in-one threat', () => {
    expect(scanTruth('6k1/8/8/8/8/8/5PPP/6K1 w - - 0 1', 'w').mate).toBe(false);
    expect(scanTruth('3r2k1/8/8/8/8/8/5PPP/6K1 w - - 0 1', 'w').mate).toBe(true);
  });
  it('scores a scan', () => {
    const t = { squares: ['b2'], pieces: [{ square: 'b2', piece: 'n' }], mate: false };
    expect(judgeScan(t, ['b2'], false).ok).toBe(true);
    expect(judgeScan(t, [], false)).toMatchObject({ ok: false, missed: [{ square: 'b2', piece: 'n' }] });
    expect(judgeScan(t, ['b2', 'e1'], false).extra).toEqual(['e1']);
  });
  it('flags a move that hangs a piece but not a fair trade', () => {
    expect(hungAfter('4k3/8/8/8/3b4/8/1N6/4K3 b - - 0 1', 'w')).toMatchObject({ kind: 'piece', square: 'b2' });
    expect(hungAfter('4k3/8/8/8/3b4/8/1N6/4K3 b - - 0 1', 'w', 3)).toBe(null);
    expect(scanSummary([{ ok: true, hung: null }, { ok: false, hung: { kind: 'piece' } }])).toEqual({ scans: 2, right: 1, hung: 1, hungAfterWrong: 1 });
  });
});

describe('puzzle rating', () => {
  it('moves fast at first and towards the puzzle’s rating', () => {
    const start = { r: 1000, n: 0, hist: [] };
    const up = nextRating(start, 1000, 1);
    const down = nextRating(start, 1000, 0);
    expect(up.r).toBe(1032);
    expect(down.r).toBe(968);
    expect(nextRating({ r: 1000, n: 50, hist: [] }, 1000, 1).r).toBe(1011);
    expect(attemptScore({ ok: true, hint: true })).toBeCloseTo(0.3);
    expect(nextRating(start, 1000, attemptScore({ ok: true, hint: true })).r).toBeLessThan(1000);
  });
});

describe('Lichess puzzle data', () => {
  it('every puzzle is legal from the setup move through the solution, with known themes', () => {
    for (const [id, fen, moves, rating, themes] of LICHESS) {
      const c = new Chess(fen);
      const ms = moves.split(' ');
      expect(ms.length % 2, id).toBe(0); // setup move + an odd-length solution
      for (const u of ms) expect(c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }), id).toBeTruthy();
      expect(rating).toBeGreaterThan(400);
      for (const t of themes ? themes.split(' ') : []) expect(THEME_BY_ID[t], `${id} ${t}`).toBeTruthy();
    }
  });
});

import { punishments, guideSteps, lessonsOf, punishStats } from '../src/lib/guide.js';
describe('guided review and missed punishments', () => {
  // I am White. Ply 3 (2…Qg5??) is their blunder; ply 4 (3.d3) is my missed punishment; ply 6 is my own blunder.
  const mv = (cls, loss, tags = [], text = '') => ({ cls, loss, tags, text, turning: false });
  const game = {
    id: 'g', userColor: 'w', white: 'Me', black: 'Them', moves: ['e4', 'e5', 'Nf3', 'Qg5', 'd3', 'Qd8', 'Bc4', 'Nf6'],
    analysis: { moves: [mv('best', 0), mv('good', 1), mv('best', 0), mv('blunder', 45), mv('blunder', 44, ['missed-capture'], 'You could have won the queen with Nxg5.'), mv('good', 2), mv('mistake', 22, ['hung-piece']), mv('good', 1)] },
  };
  it('counts chances given and taken', () => {
    const p = punishments(game);
    expect(p.chances).toBe(1);
    expect(p.punished).toBe(0);
    expect(p.missed[0]).toMatchObject({ ply: 4, oppPly: 3 });
  });
  it('builds guide steps in game order, tagging missed chances', () => {
    expect(guideSteps(game).map((s) => [s.ply, s.kind])).toEqual([[4, 'punish'], [6, 'mistake']]);
  });
  it('turns my mistakes into practice themes', () => {
    expect(lessonsOf(game).map((l) => l.theme)).toEqual(['hangingPiece']);
    expect(punishStats([game])).toMatchObject({ games: 1, chances: 1, punished: 0 });
  });
});

import { pathState, nextStep, lessonPositions, backRankMate, weaknesses, STAGES } from '../src/lib/path.js';
describe('learning path', () => {
  const mv = (cls, loss, tags = [], text = '', phase = 'opening') => ({ cls, loss, tags, text, turning: false, phase, bestSan: 'Nxg5' });
  const ev = (best) => ({ cp: 0, best, pv: [best] });
  // I am White; 3.d3 missed 3.Nxg5 winning the queen (tagged missed-capture), 4.Bc4 hung… (tagged hung-piece)
  const mk = (id, created) => ({
    id, created, userColor: 'w', white: 'Me', black: 'Them', moves: ['e4', 'e5', 'Nf3', 'Qg5', 'd3', 'Qd8', 'Be2', 'Nf6'],
    analysis: {
      moves: [mv('best', 0), mv('good', 1), mv('best', 0), mv('blunder', 45), mv('blunder', 44, ['missed-capture'], 'You could have won the queen with Nxg5.'), mv('good', 2), mv('mistake', 22, ['hung-piece']), mv('good', 1)],
      evals: Array.from({ length: 9 }, (_, i) => ev(i === 4 ? 'f3g5' : 'a2a3')),
    },
  });
  const empty = { lessonProgress: {}, academy: {}, drillStats: {}, convertStats: {}, pathUnlocked: {} };
  it('opens the first stage only, and unlocks the next at half done', () => {
    let st = pathState(empty);
    expect(st.map((s) => s.open)).toEqual([true, false, false, false, false]);
    st = pathState({ ...empty, lessonProgress: { 'loose-pieces': { done: true }, 'opening-principles': { done: true } } });
    expect(st[1].open).toBe(true);
    expect(st[2].open).toBe(false);
    expect(pathState({ ...empty, pathUnlocked: { mates: true } })[2].open).toBe(true);
  });
  it('picks the next step from my weaknesses, else in order', () => {
    expect(nextStep(empty, []).id).toBe('loose-pieces');
    const games = [mk('a', 1), mk('b', 2)];
    expect(weaknesses(games).count.hangingPiece).toBe(4);
    const done = { ...empty, lessonProgress: { 'loose-pieces': { done: true } } };
    const n = nextStep(done, games);
    expect(n.id).toBe('hangingPiece');
    expect(n.why).toMatch(/4 times in your last 2 reviewed games/);
  });
  it('every path step points at real content', () => {
    for (const st of STAGES) for (const s of st.steps) expect(pathState(empty).flatMap((x) => x.steps).find((y) => y.id === s.id).title).not.toBe(s.id === 'convert' ? '' : s.id);
  });
  it('finds lesson positions in my games, missed chances first, one per game', () => {
    const ps = lessonPositions([mk('a', 1), mk('b', 2)], 'loose-pieces', 3);
    expect(ps.length).toBe(3);
    expect(ps[0]).toMatchObject({ kind: 'missed', played: 'd3', ply: 4 });
    expect(new Set(ps.slice(0, 2).map((p) => p.gameId)).size).toBe(2);
    expect(lessonPositions([mk('a', 1)], 'knight-forks')).toEqual([]);
  });
  it('recognises a back-rank mate in a line', () => {
    expect(backRankMate('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1', ['a1a8'])).toBe(true);
    expect(backRankMate('6k1/5pp1/7p/8/8/8/8/R5K1 w - - 0 1', ['a1a8'])).toBe(false);
  });
});

import { traceLine, buildQuestions, scoreRound } from '../src/lib/calc.js';
describe('calculation trainer', () => {
  const start = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  const line = ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'g8f6', 'f3g5', 'd7d5', 'e4d5', 'f6d5', 'g5f7'];
  it('tracks pieces through the line, including castling and captures', () => {
    const t = traceLine(start, line);
    expect(t.at.get('f7')).toMatchObject({ type: 'n', start: 'g1', moved: 3 });
    expect(t.captures).toBe(3);
    const c = traceLine('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1', ['e1g1']);
    expect(c.at.get('f1')).toMatchObject({ type: 'r', start: 'h1' });
  });
  it('asks where a piece went and other questions with the right answers', () => {
    let seed = 1;
    const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let k = 0; k < 20; k++) {
      const { questions, finalFen } = buildQuestions(start, line, { rng });
      expect(questions.length).toBe(2);
      const where = questions.find((q) => q.kind === 'where');
      expect(where).toBeTruthy();
      const fin = new Chess(finalFen);
      const p = fin.get(where.answer);
      expect(p && p.type).toBe(where.piece.type);
      for (const q of questions) if (q.options) expect(q.options).toContain(q.answer);
    }
  });
  it('goes deeper after two perfect lines and back after two misses', () => {
    let c = { level: 2, best: 2 };
    c = scoreRound(c, true).calc;
    expect(c.level).toBe(2);
    const r = scoreRound(c, true);
    expect([r.calc.level, r.change, r.calc.best]).toEqual([3, 1, 3]);
    c = scoreRound(scoreRound(r.calc, false).calc, false).calc;
    expect([c.level, c.best]).toEqual([2, 3]);
    expect(scoreRound(scoreRound({ level: 1 }, false).calc, false).calc.level).toBe(1);
  });
});
