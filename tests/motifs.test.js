import { describe, it, expect } from 'vitest';
import { Chess } from 'chess.js';
import { see, seeMove, hanging, forkTargets, isFork, pinsFrom, skewersFrom, discoveredAttacks, matePattern, classifyLine, threatsAgainst } from '../src/lib/motifs.js';
import { parsePgn, buildPgn, replay, withTurn, sanLineText } from '../src/lib/chessx.js';

const after = (fen, san) => { const c = new Chess(fen); const m = c.move(san); return { c, m }; };

describe('motifs', () => {
  it('finds a knight fork of king and rook', () => {
    const { c, m } = after('r3k3/8/8/1N6/8/8/8/4K3 w - - 0 1', 'Nc7+');
    const t = isFork(c, m.to);
    expect(t.map((x) => x.piece).sort()).toEqual(['k', 'r']);
  });
  it('does not call it a fork when the forking piece just hangs', () => {
    const { c, m } = after('r3k3/8/2b5/1N6/8/8/8/4K3 w - - 0 1', 'Nd6+'); // bishop c6 does not guard d6; king fork vs nothing
    expect(forkTargets(c, m.to).length).toBe(1);
    const x = after('r2qk3/8/8/1N6/8/8/8/4K3 w - - 0 1', 'Nc7+'); // queen takes c7
    expect(isFork(x.c, x.m.to)).toBe(null);
  });
  it('finds an absolute pin', () => {
    const { c, m } = after('4k3/8/2n5/8/8/8/8/4KB2 w - - 0 1', 'Bb5');
    const pins = pinsFrom(c, m.to);
    expect(pins).toHaveLength(1);
    expect(pins[0].front.square).toBe('c6');
    expect(pins[0].back.piece).toBe('k');
  });
  it('finds a skewer through the king', () => {
    const { c, m } = after('4q3/8/8/4k3/8/8/8/R5K1 w - - 0 1', 'Re1+');
    const sk = skewersFrom(c, m.to);
    expect(sk).toHaveLength(1);
    expect(sk[0].back.piece).toBe('q');
  });
  it('finds a discovered attack', () => {
    const { c, m } = after('3q3k/8/8/3N4/8/8/8/3R2K1 w - - 0 1', 'Nf6');
    const d = discoveredAttacks(c, m);
    expect(d).toHaveLength(1);
    expect(d[0].slider.square).toBe('d1');
    expect(d[0].target.square).toBe('d8');
  });
  it('evaluates exchanges', () => {
    // Knight on e5 defended by a pawn; white pawn can take it (wins 3-1=2), white queen cannot profitably.
    const c = new Chess('4k3/8/3p4/4n3/3P4/8/8/3QK3 w - - 0 1');
    expect(see(c, 'e5')).toBe(2);
    const c2 = new Chess('4k3/8/3p4/4n3/8/8/8/4QK2 w - - 0 1');
    expect(see(c2, 'e5')).toBe(0);
    expect(seeMove(c2, { from: 'e1', to: 'e5' })).toBe(3 - 9);
    expect(hanging(c).map((h) => h.square)).toEqual(['e5']);
  });
  it('sees threats against the side that is not to move', () => {
    // White to move, but white's rook on a1 is attacked by a bishop on the long diagonal.
    const t = threatsAgainst('4k3/6b1/8/8/8/8/8/R3K3 w - - 0 1', 'w');
    expect(t.map((h) => h.square)).toEqual(['a1']);
  });
  it('recognises back-rank and smothered mates', () => {
    expect(matePattern(after('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1', 'Ra8#').c)).toBe('backRank');
    expect(matePattern(after('6rk/6pp/8/6N1/8/8/8/6K1 w - - 0 1', 'Nf7#').c)).toBe('smothered');
  });
  it('classifies a fork line', () => {
    const r = classifyLine('r3k3/8/8/1N6/8/8/8/4K3 w - - 0 1', ['b5c7', 'e8d7', 'c7a8']);
    expect(r.ok).toBe(true);
    expect(r.themes).toContain('fork');
    expect(r.gained).toBe(5);
  });
});

describe('pgn + helpers', () => {
  const pgn = `[Event "Test"]\n[White "Ann"]\n[Black "Bob"]\n[Result "1-0"]\n\n1. e4 e5 2. Qh5 {eyeing f7} Nc6 3. Bc4 Nf6?? (3... g6 4. Qf3) 4. Qxf7# 1-0`;
  it('parses comments, variations and headers', () => {
    const { games, errors } = parsePgn(pgn);
    expect(errors).toEqual([]);
    expect(games[0].moves).toEqual(['e4', 'e5', 'Qh5', 'Nc6', 'Bc4', 'Nf6', 'Qxf7#']);
    expect(games[0].white).toBe('Ann');
    expect(games[0].result).toBe('1-0');
  });
  it('parses several games and bare movetext', () => {
    const two = pgn + '\n\n[Event "Two"]\n[White "C"]\n[Black "D"]\n[Result "*"]\n\n1. d4 d5 *';
    expect(parsePgn(two).games).toHaveLength(2);
    expect(parsePgn('1. e4 e5 2. Nf3 Nc6').games[0].moves).toHaveLength(4);
  });
  it('rejects invalid PGN with a readable error', () => {
    const bad = parsePgn('1. e4 e5 2. Ke3 Nc6');
    expect(bad.games).toHaveLength(0);
    expect(bad.errors[0]).toMatch(/Ke3/);
    expect(parsePgn('hello world').games).toHaveLength(0);
    expect(parsePgn('').errors[0]).toMatch(/Nothing to import/);
  });
  it('round-trips a game through buildPgn', () => {
    const g = parsePgn(pgn).games[0];
    const out = buildPgn({ ...g, source: 'import', created: 0 });
    expect(out).toMatch(/Qxf7# 1-0/);
    expect(parsePgn(out).games[0].moves).toEqual(g.moves);
  });
  it('replays, flips the turn safely and writes SAN lines', () => {
    const { fens, plies } = replay(null, ['e4', 'e5', 'Nf3']);
    expect(fens).toHaveLength(4);
    expect(plies[2].uci).toBe('g1f3');
    expect(() => replay(null, ['e4', 'e4'])).toThrow(/not legal/);
    expect(withTurn(fens[3], 'w')).toMatch(/ w /);
    expect(withTurn('4k3/8/8/8/8/8/8/4KR2 b - - 0 1', 'w')).toMatch(/ w /);
    expect(withTurn('4k3/8/8/8/8/8/4R3/4K3 b - - 0 1', 'w')).toBe(null); // black is in check
    expect(sanLineText(fens[1], ['e7e5', 'g1f3'])).toBe('1… e5 2. Nf3');
  });
});
