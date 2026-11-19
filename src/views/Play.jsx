// Play: a game against the computer (or practice from any FEN), with clocks,
// optional coach hints, takebacks and PGN export. The game in progress lives
// in the store, so a reload resumes it.
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { Chess } from 'chess.js';
import { Board } from '../components/Board.jsx';
import { Icon } from '../components/Icon.jsx';
import { MoveList, ReplayBar, useReplayKeys } from '../components/MoveList.jsx';
import { Workspace, Dialog, Seg, Switch, Note, EngineGate, toast } from '../components/ui.jsx';
import { useStore, update, saveGame, newId, logActivity, getState } from '../lib/store.js';
import { START_FEN, validateFen, replay, describeEnd, opp, sideName, cgColor, buildPgn, playUci, PIECE_NAME, VALUE, withTurn, kingSquare } from '../lib/chessx.js';
import { scanTruth, judgeScan, scanFeedback, hungAfter, scanSummary } from '../lib/blundercheck.js';
import { engines, chooseMove, LEVELS, levelById, engineStatus, onEngineStatus } from '../lib/engine.js';
import { evaluateFen, whiteWin } from '../lib/analysis.js';
import { explainMove, materialSwing, describeLoss } from '../lib/explain.js';
import { flipScore } from '../lib/uci.js';
import { nameOpening } from '../data/openings.js';
import { saveTextFile, copyText } from '../lib/files.js';
import { go } from '../lib/router.js';
import { preMoveWarning, verdictFor, adjustWheels, WHEELS, CLEAN_GAMES } from '../lib/coach.js';

export const TIME_CONTROLS = [
  { value: 'none', label: 'No clock' },
  { value: '3+2', label: '3 | 2' },
  { value: '5+0', label: '5 min' },
  { value: '10+0', label: '10 min' },
  { value: '15+10', label: '15 | 10' },
  { value: '30+0', label: '30 min' },
];
const parseTc = (tc) => {
  if (!tc || tc === 'none') return null;
  const [m, inc] = tc.split('+').map(Number);
  return { base: m * 60000, inc: (inc || 0) * 1000 };
};
const fmtClock = (ms) => {
  const t = Math.max(0, ms);
  const s = Math.floor(t / 1000);
  if (t < 20000) return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}.${Math.floor((t % 1000) / 100)}`;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** Check a FEN the way a player would: valid syntax, both kings, side not to move not in check, game not already over. */
export function checkFen(fen) {
  const f = String(fen || '').trim().replace(/\s+/g, ' ');
  if (!f) return { ok: false, error: 'Paste a FEN to set up a position.' };
  const parts = f.split(' ');
  const full = parts.length === 1 ? `${f} w - - 0 1` : parts.length === 2 ? `${f} - - 0 1` : parts.length === 4 ? `${f} 0 1` : f;
  const v = validateFen(full);
  if (!v.ok) return { ok: false, error: v.error.replace(/^Invalid FEN: /, 'That FEN isn’t valid: ') + '.' };
  let c;
  try {
    c = new Chess(full);
  } catch (e) {
    return { ok: false, error: 'That FEN isn’t valid: ' + String(e.message || e) };
  }
  const waiting = opp(c.turn());
  const k = kingSquare(c, waiting);
  if (k && c.isAttacked(k, c.turn())) return { ok: false, error: `That position isn’t legal: ${sideName(waiting)} is in check but it is ${sideName(c.turn())}’s move.` };
  if (c.isGameOver()) return { ok: false, error: 'That position is already finished (checkmate, stalemate or a dead draw), so there is nothing to play.' };
  return { ok: true, fen: c.fen() };
}

export function startGame({ level, side, timeControl, coach, blunderCheck = false, startFen = null, drill = null }) {
  const userColor = side === 'r' ? (Math.random() < 0.5 ? 'w' : 'b') : side;
  const tc = parseTc(timeControl);
  update((s) => {
    s.current = {
      id: newId('g'),
      created: Date.now(),
      startFen,
      moves: [],
      userColor,
      level,
      timeControl: timeControl || 'none',
      coach: !!coach,
      blunderCheck: !!blunderCheck,
      checks: [],
      clocks: [],
      clock: tc ? { w: tc.base, b: tc.base, inc: tc.inc, last: Date.now() } : null,
      status: 'playing',
      result: '*',
      termination: null,
      hints: 0,
      takebacks: 0,
    };
    s.settings.level = level;
    s.settings.side = side;
    s.settings.timeControl = timeControl || 'none';
    s.settings.coach = !!coach;
    s.settings.blunderCheck = !!blunderCheck;
  }, { immediate: true });
  engines.opponent.newGame().catch(() => {});
}

function finishGame(cur, result, termination) {
  const lvl = levelById(cur.level);
  const bot = `Outpost L${lvl.id} (${lvl.name})`;
  const game = {
    id: cur.id,
    created: cur.created,
    finished: Date.now(),
    source: 'play',
    white: cur.userColor === 'w' ? 'You' : bot,
    black: cur.userColor === 'b' ? 'You' : bot,
    result,
    termination,
    userColor: cur.userColor,
    startFen: cur.startFen,
    moves: cur.moves.slice(),
    level: cur.level,
    timeControl: parseTc(cur.timeControl) ? { base: parseTc(cur.timeControl).base / 1000, inc: parseTc(cur.timeControl).inc / 1000 } : null,
    clocks: cur.clocks && cur.clocks.length === cur.moves.length ? cur.clocks.slice() : null,
    checks: cur.blunderCheck ? (cur.checks || []).slice() : null,
    coach: cur.coach ? { ...(cur.coachLog || { warned: 0, ignored: 0, heeded: 0 }), tally: cur.coachTally || {} } : null,
    opening: nameOpening(cur.moves, cur.startFen).name,
    analysis: null,
  };
  if (cur.coach && game.moves.length >= 2 && (getState().settings.wheels?.level ?? 3) > 0) {
    const myMoves = cur.moves.filter((_, i) => (i % 2 === 0) === (new Chess(cur.startFen || START_FEN).turn() === cur.userColor)).length;
    let change = 0;
    update((s) => {
      const res = adjustWheels(s.settings.wheels, { at: Date.now(), moves: myMoves, warned: (cur.coachLog || {}).warned || 0, ignored: (cur.coachLog || {}).ignored || 0 });
      s.settings.wheels = res.wheels;
      change = res.change;
    });
    const lv = WHEELS[getState().settings.wheels.level];
    if (change < 0) toast(lv.level ? `${CLEAN_GAMES} clean games in a row — training wheels down to “${lv.label}”` : `${CLEAN_GAMES} clean games in a row — training wheels off. The coach now only reviews after you move.`);
    if (change > 0) toast(`A lot of warnings that game — training wheels back up to “${lv.label}”`);
  }
  if (game.moves.length >= 2) {
    saveGame(game);
    logActivity('game', `${result === '1/2-1/2' ? 'Drew' : (result === '1-0') === (cur.userColor === 'w') ? 'Won' : 'Lost'} vs level ${lvl.id}`, game.id);
  }
  update((s) => {
    if (s.current && s.current.id === cur.id) {
      s.current.status = 'over';
      s.current.result = result;
      s.current.termination = termination;
      s.current.saved = game.moves.length >= 2;
    }
  }, { immediate: true });
}

/** Training wheels: how much the live coach warns before you move. */
function WheelsControl() {
  const wheels = useStore((s) => s.settings.wheels || { level: 3, games: [] });
  const lv = WHEELS[wheels.level] || WHEELS[3];
  const clean = (() => {
    let n = 0;
    for (const g of (wheels.games || []).slice().reverse()) {
      if (g.warned <= 1 && g.moves >= 15) n++;
      else break;
    }
    return n;
  })();
  return (
    <div class="stack tight" data-testid="wheels">
      <Seg
        label="Warnings before you move"
        value={String(wheels.level)}
        onChange={(v) => update((s) => (s.settings.wheels = { level: +v, games: [] }))}
        options={WHEELS.map((w) => ({ value: String(w.level), label: w.label }))}
      />
      <p class="small muted">
        {lv.hint}
        {wheels.level > 0 ? ` Clean coached games in a row: ${clean} of ${CLEAN_GAMES} — then it steps down a level.` : ''}
      </p>
    </div>
  );
}

function useEngineStatus() {
  const [, setN] = useState(0);
  useEffect(() => onEngineStatus(() => setN((n) => n + 1)), []);
  return engineStatus;
}

// ---- setup ----------------------------------------------------------------------
function Setup({ initialFen }) {
  const settings = useStore((s) => s.settings);
  const [level, setLevel] = useState(settings.level);
  const [side, setSide] = useState(settings.side);
  const [tc, setTc] = useState(settings.timeControl);
  const [coach, setCoach] = useState(settings.coach);
  const [blunderCheck, setBlunderCheck] = useState(!!settings.blunderCheck);
  const [useFen, setUseFen] = useState(!!initialFen);
  const [fenText, setFenText] = useState(initialFen || '');
  const fenCheck = useMemo(() => (useFen ? checkFen(fenText) : { ok: true, fen: null }), [useFen, fenText]);
  const previewFen = useFen && fenCheck.ok ? fenCheck.fen : START_FEN;
  const lvl = levelById(level);
  const orient = side === 'b' ? 'black' : 'white';

  const begin = () => {
    if (useFen && !fenCheck.ok) return;
    startGame({ level, side, timeControl: tc, coach, blunderCheck, startFen: useFen ? fenCheck.fen : null });
  };

  const form = (
    <div class="stack">
      <div class="field">
        <span class="label" id="lvl-label">Opponent strength</span>
        <div class="row" style={{ gap: '12px' }}>
          <input type="range" min="1" max={LEVELS.length} step="1" value={level} aria-labelledby="lvl-label" aria-valuetext={`Level ${lvl.id}, ${lvl.name}, rating ${lvl.elo}`} onInput={(e) => setLevel(+e.currentTarget.value)} style={{ flex: 1, accentColor: 'var(--turq)', minHeight: '44px' }} />
          <span class="chip turq mono">L{lvl.id}</span>
        </div>
        <div class="row between small">
          <strong>{lvl.name}</strong>
          <span class="muted">plays around {lvl.elo} (rough guide)</span>
        </div>
      </div>
      <div class="field">
        <span class="label">Play as</span>
        <Seg label="Play as" value={side} onChange={setSide} options={[{ value: 'w', label: 'White' }, { value: 'b', label: 'Black' }, { value: 'r', label: 'Random' }]} />
      </div>
      <div class="field">
        <span class="label">Clock</span>
        <Seg label="Clock" value={tc} onChange={setTc} options={TIME_CONTROLS} />
      </div>
      <Switch checked={coach} onChange={setCoach} hint="A verdict on every move, hints on request, and a warning before you drop a piece or allow mate. The warnings fade as your games get cleaner.">
        Live coach
      </Switch>
      {coach ? <WheelsControl /> : null}
      <Switch checked={blunderCheck} onChange={setBlunderCheck} hint="Before each move, tap your pieces that are in danger (or press All safe). Builds the habit that stops one-move blunders.">
        Blunder check
      </Switch>
      <Switch checked={useFen} onChange={setUseFen} hint="Practise any position against the engine.">
        Start from a FEN
      </Switch>
      {useFen ? (
        <div class="field">
          <label for="fen-input">Position (FEN)</label>
          <input id="fen-input" class="input mono" style={{ fontSize: '13px' }} value={fenText} placeholder="e.g. 8/8/8/4k3/8/8/1Q6/4K3 w - - 0 1" spellcheck={false} autocapitalize="off" aria-invalid={!fenCheck.ok} aria-describedby="fen-msg" onInput={(e) => setFenText(e.currentTarget.value)} />
          <span id="fen-msg" class="small" style={{ color: fenCheck.ok ? 'var(--ink-2)' : '#ffb3ab' }}>
            {fenCheck.ok ? `Looks good — ${sideName(fenCheck.fen.split(' ')[1])} to move.` : fenText.trim() ? `✕ ${fenCheck.error}` : 'Paste a FEN; the board previews it.'}
          </span>
        </div>
      ) : null}
      <button type="button" class="btn primary big block" disabled={useFen && !fenCheck.ok} onClick={begin} data-testid="start-game">
        Start game <Icon name="arrow" />
      </button>
    </div>
  );

  return (
    <Workspace
      eyebrow="Play"
      title="New game"
      strips={0}
      board={<Board fen={previewFen} orientation={orient} viewOnly label="Starting position preview" />}
      sections={[{ id: 'setup', label: 'Setup', heading: false, content: form }]}
    />
  );
}

// ---- game ------------------------------------------------------------------------
export function Play({ params }) {
  const cur = useStore((s) => s.current);
  if (!cur) return <Setup initialFen={params?.fen} />;
  return <Game key={cur.id} cur={cur} />;
}

function Game({ cur }) {
  const settings = useStore((s) => s.settings);
  const status = useEngineStatus();
  const [orientation, setOrientation] = useState(cgColor(cur.userColor));
  const [viewPly, setViewPly] = useState(null); // null = live position
  const [thinking, setThinking] = useState(false);
  const [coachNote, setCoachNote] = useState(null);
  const [warn, setWarn] = useState(null); // pre-move warning: { text, move, key, san }
  const [verdict, setVerdict] = useState(null); // { san, label, kind, key }
  const confirmRef = useRef(null);
  const [hint, setHint] = useState(null); // { level, uci }
  const [confirm, setConfirm] = useState(null);
  const [tab, setTab] = useState('game');
  const [, tick] = useState(0);
  const [rev, setRev] = useState(0);
  const [retry, setRetry] = useState(0);
  const coachRef = useRef({ fen: null, ev: null, pending: null });
  const abortRef = useRef(null);

  const data = useMemo(() => replay(cur.startFen, cur.moves), [cur.startFen, cur.moves.length, cur.id]);
  const liveFen = data.fens[data.fens.length - 1];
  const live = data.final;
  const total = cur.moves.length;
  const shownPly = viewPly == null ? total : viewPly;
  const fen = data.fens[shownPly];
  const turn = live.turn();
  const playing = cur.status === 'playing';
  const usersTurn = playing && turn === cur.userColor;
  const lvl = levelById(cur.level);
  const lastMove = shownPly > 0 ? [data.plies[shownPly - 1].from, data.plies[shownPly - 1].to] : null;

  // -- clocks: remaining time is derived from the stored clock and "last" timestamp
  const remaining = (color) => {
    if (!cur.clock) return null;
    const running = playing && turn === color && cur.moves.length >= 0;
    return cur.clock[color] - (running ? Date.now() - cur.clock.last : 0);
  };
  useEffect(() => {
    // Do not charge time that passed while the app was closed.
    if (cur.clock && playing) update((s) => s.current && s.current.clock && (s.current.clock.last = Date.now()));
  }, []);
  useEffect(() => {
    if (!cur.clock || !playing) return undefined;
    const id = setInterval(() => {
      tick((n) => n + 1);
      const s = getState().current;
      if (!s || s.id !== cur.id || s.status !== 'playing') return;
      const c = new Chess(liveFen);
      if (engineStatus.state === 'failed' && c.turn() !== s.userColor) {
        // No engine, no clock: don't let the computer lose (or you wait) on time.
        update((st) => (st.current.clock.last = Date.now()));
        return;
      }
      const left = s.clock[c.turn()] - (Date.now() - s.clock.last);
      if (left <= 0) {
        const loser = c.turn();
        update((st) => (st.current.clock[loser] = 0));
        finishGame(getState().current, loser === 'w' ? '0-1' : '1-0', `${sideName(loser)} ran out of time`);
      }
    }, 200);
    return () => clearInterval(id);
  }, [cur.id, playing, liveFen, !!cur.clock]);

  const applyMove = (move) => {
    const s0 = getState().current;
    if (!s0 || s0.id !== cur.id || s0.status !== 'playing') return false;
    const chess = new Chess(liveFen);
    let m;
    try {
      m = chess.move(move);
    } catch {
      return false;
    }
    update((s) => {
      const g = s.current;
      g.moves = [...g.moves, m.san];
      if (g.clock) {
        const now = Date.now();
        g.clock[m.color] = Math.max(0, g.clock[m.color] - (now - g.clock.last)) + g.clock.inc;
        g.clock.last = now;
        g.clocks = [...(g.clocks || []), Math.round(g.clock[m.color] / 100) / 10];
      }
    }, { immediate: true });
    const end = describeEnd(chess);
    if (end.over) finishGame(getState().current, end.result, end.reason);
    return m;
  };

  // -- blunder check: before each of my moves, mark what is in danger
  const [marks, setMarks] = useState([]);
  const [mateMark, setMateMark] = useState(false);
  const [scanNote, setScanNote] = useState(null);
  const needScan = playing && usersTurn && cur.blunderCheck && viewPly == null && !(cur.checks || []).some((c) => c.ply === total);
  useEffect(() => {
    setMarks([]);
    setMateMark(false);
  }, [total]);
  const toggleMark = (sq) => {
    const p = live.get(sq);
    if (!p || p.color !== cur.userColor || p.type === 'k') return;
    setMarks((ms) => (ms.includes(sq) ? ms.filter((x) => x !== sq) : [...ms, sq]));
  };
  const submitScan = (allSafe) => {
    const marked = allSafe ? [] : marks;
    const mate = allSafe ? false : mateMark;
    const truth = scanTruth(liveFen, cur.userColor);
    const verdict = judgeScan(truth, marked, mate);
    update((s) => {
      const g = s.current;
      g.checks = [...(g.checks || []).filter((c) => c.ply !== total), { ply: total, marked, mate, truth: truth.squares, truthMate: truth.mate, ok: verdict.ok, hung: null }];
    }, { immediate: true });
    setScanNote({ kind: verdict.ok ? 'good' : 'bad', text: scanFeedback(truth, verdict, live), key: Date.now(), squares: truth.squares });
  };

  // -- the user moves
  const bumpCoach = (field) =>
    update((s) => {
      if (!s.current) return;
      const c = s.current.coachLog || { warned: 0, ignored: 0, heeded: 0 };
      s.current.coachLog = { ...c, [field]: (c[field] || 0) + 1 };
    });
  const onUserMove = (move) => {
    if (!usersTurn || viewPly != null) {
      setRev((n) => n + 1);
      return;
    }
    const fenBefore = liveFen;
    // Training wheels: stop and ask before a move that drops material or allows mate.
    const wheel = cur.coach ? settings.wheels?.level ?? 3 : 0;
    const key = `${total}:${move.from}${move.to}${move.promotion || ''}`;
    if (wheel > 0 && confirmRef.current !== key) {
      const w = preMoveWarning(fenBefore, move, cur.userColor, wheel);
      if (w) {
        setWarn({ ...w, move, key, at: Date.now() });
        setCoachNote(null);
        setRev((n) => n + 1);
        bumpCoach('warned');
        return;
      }
    }
    confirmRef.current = null;
    setWarn(null);
    if (cur.blunderCheck) {
      // Record whether this move leaves something hanging before the game can end and be saved.
      const t = new Chess(fenBefore);
      let tm = null;
      try {
        tm = t.move(move);
      } catch {
        tm = null;
      }
      if (tm) {
        const hung = hungAfter(t.fen(), cur.userColor, tm.captured ? VALUE[tm.captured] : 0);
        if (hung) update((s) => { const e = (s.current.checks || []).find((c) => c.ply === total); if (e) e.hung = hung; }, { immediate: true });
      }
    }
    const m = applyMove(move);
    if (!m) {
      setRev((n) => n + 1);
      return;
    }
    setHint(null);
    setCoachNote(null);
    setScanNote(null);
    if (cur.coach) coachCheck(fenBefore, m);
  };

  // -- the computer moves
  useEffect(() => {
    if (!playing || turn === cur.userColor || live.isGameOver()) return undefined;
    const ac = new AbortController();
    abortRef.current = ac;
    let cancelled = false;
    setThinking(true);
    const started = performance.now();
    chooseMove(liveFen, lvl, { signal: ac.signal, ply: total })
      .then(async (uci) => {
        if (cancelled || !uci) return;
        const minThink = 380 + Math.random() * 420;
        const waited = performance.now() - started;
        if (waited < minThink) await new Promise((r) => setTimeout(r, minThink - waited));
        if (cancelled) return;
        applyMove({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
      })
      .catch(() => {})
      .finally(() => !cancelled && setThinking(false));
    return () => {
      cancelled = true;
      ac.abort();
      setThinking(false);
    };
  }, [cur.id, total, playing, turn === cur.userColor, retry]);

  // -- coach: evaluate the position I am about to move in, then judge my move
  useEffect(() => {
    if (!cur.coach || !usersTurn) return undefined;
    const ac = new AbortController();
    const ref = coachRef.current;
    if (ref.fen !== liveFen) {
      ref.fen = liveFen;
      ref.ev = null;
      ref.pending = evaluateFen(liveFen, { depth: 11, signal: ac.signal })
        .then((ev) => {
          if (ev && coachRef.current.fen === liveFen) coachRef.current.ev = ev;
          return ev;
        })
        .catch(() => null);
    }
    return () => ac.abort();
  }, [cur.coach, usersTurn, liveFen]);

  const coachCheck = async (fenBefore, m) => {
    try {
      const ref = coachRef.current;
      let before = ref.fen === fenBefore ? ref.ev || (await ref.pending) : null;
      if (!before) before = await evaluateFen(fenBefore, { depth: 11 });
      if (!before) return;
      const chess = new Chess(fenBefore);
      chess.move(m.san);
      const fenAfter = chess.fen();
      const after = await evaluateFen(fenAfter, { depth: 11 });
      if (!after) return;
      const s = getState().current;
      if (!s || s.id !== cur.id || s.status !== 'playing') return;
      const color = m.color;
      const loss = Math.max(0, color === 'w' ? whiteWin(before) - whiteWin(after) : whiteWin(after) - whiteWin(before));
      const pov = (ev) => (color === 'w' ? { cp: ev.cp, mate: ev.mate, pv: ev.pv } : { ...flipScore(ev), pv: ev.pv });
      const uci = m.from + m.to + (m.promotion || '');
      const vd = verdictFor(loss, before.best === uci);
      setVerdict({ ...vd, san: m.san, at: Date.now() });
      update((st) => {
        if (!st.current || st.current.id !== cur.id) return;
        const t = st.current.coachTally || {};
        st.current.coachTally = { ...t, [vd.key]: (t[vd.key] || 0) + 1 };
      });
      if (loss >= 18) {
        const ex = explainMove({ fenBefore, fenAfter, played: { ...m, uci }, before: pov(before), after: pov(after), voice: 'you' });
        setCoachNote({ kind: loss >= 30 ? 'bad' : 'warn', title: loss >= 30 ? `${m.san} is a blunder` : `${m.san} is a mistake`, text: ex.text || 'This gives away a lot of your winning chances.', takeback: true, key: Date.now() });
        setTab('game');
      } else if (before.best === uci && before.pv && before.pv.length) {
        const swing = materialSwing(fenBefore, before.pv, color);
        if (after.winner === color || (pov(before).mate > 0 && pov(before).mate <= 4)) setCoachNote({ kind: 'good', title: 'Well spotted', text: `${m.san} is the strongest move — a forced mate is on.`, key: Date.now() });
        else if (swing.net >= 2 && loss < 4) setCoachNote({ kind: 'good', title: 'Well spotted', text: `${m.san} was the best move and wins ${describeLoss(swing.won, swing.lost, swing.net)}.`, key: Date.now() });
      }
    } catch {
      /* coach is best-effort */
    }
  };

  const takeBack = () => {
    if (!playing || !cur.moves.length) return;
    if (abortRef.current) abortRef.current.abort();
    update((s) => {
      const g = s.current;
      const chess = new Chess(liveFen);
      // Undo back to my previous turn: one ply if the computer is thinking, two if it has replied.
      let n = chess.turn() === g.userColor ? 2 : 1;
      n = Math.min(n, g.moves.length);
      g.moves = g.moves.slice(0, g.moves.length - n);
      if (g.clocks) g.clocks = g.clocks.slice(0, g.moves.length);
      if (g.checks) g.checks = g.checks.filter((c) => c.ply < g.moves.length);
      g.takebacks = (g.takebacks || 0) + 1;
      if (g.clock) g.clock.last = Date.now();
    }, { immediate: true });
    setCoachNote(null);
    setHint(null);
    setViewPly(null);
  };

  const askHint = async () => {
    if (!usersTurn) return;
    const ref = coachRef.current;
    let ev = ref.fen === liveFen ? ref.ev || (await ref.pending) : null;
    if (!ev) ev = await evaluateFen(liveFen, { depth: 11 });
    if (!ev || !ev.best) return;
    const next = hint && hint.uci === ev.best ? Math.min(2, hint.level + 1) : 1;
    setHint({ level: next, uci: ev.best });
    if (next === 1) update((s) => s.current && (s.current.hints = (s.current.hints || 0) + 1));
  };

  const resign = () => {
    setConfirm(null);
    if (abortRef.current) abortRef.current.abort();
    finishGame(getState().current, cur.userColor === 'w' ? '0-1' : '1-0', `${sideName(cur.userColor)} resigned`);
  };
  const abandon = () => {
    setConfirm(null);
    if (abortRef.current) abortRef.current.abort();
    if (playing && cur.moves.length >= 2) finishGame(getState().current, '*', 'Game abandoned');
    update((s) => (s.current = null), { immediate: true });
  };

  const pgnGame = () => ({ ...cur, source: 'play', white: cur.userColor === 'w' ? 'You' : `Outpost L${lvl.id}`, black: cur.userColor === 'b' ? 'You' : `Outpost L${lvl.id}` });
  const copyPgn = async () => toast((await copyText(buildPgn(pgnGame()))) ? 'PGN copied to the clipboard' : 'Copy was blocked — select the PGN text instead');
  const savePgn = async () => {
    const r = await saveTextFile(`outpost-${new Date(cur.created).toISOString().slice(0, 10)}.pgn`, buildPgn(pgnGame()), 'application/x-chess-pgn');
    if (r === 'saved') toast('PGN saved');
    else if (r === 'unavailable') copyPgn();
  };

  useReplayKeys(shownPly, total, (n) => setViewPly(n >= total ? null : n), true);

  // -- board decorations
  const shapes = [];
  if (needScan) for (const sq of marks) shapes.push({ orig: sq, brush: 'coral' });
  if (!needScan && scanNote && usersTurn && viewPly == null) for (const sq of scanNote.squares) shapes.push({ orig: sq, brush: 'amber' });
  if (hint && usersTurn && viewPly == null) {
    if (hint.level === 1) shapes.push({ orig: hint.uci.slice(0, 2), brush: 'turq' });
    else shapes.push({ orig: hint.uci.slice(0, 2), dest: hint.uci.slice(2, 4), brush: 'turq' });
  }
  const hintText = (() => {
    if (!hint || !usersTurn) return null;
    const p = live.get(hint.uci.slice(0, 2));
    if (!p) return null;
    if (hint.level === 1) return `Look at your ${PIECE_NAME[p.type]} on ${hint.uci.slice(0, 2)}. Ask again to see the move.`;
    const c = new Chess(liveFen);
    const m = playUci(c, hint.uci);
    return `The engine likes ${m ? m.san : hint.uci}.`;
  })();

  const top = opp(orientation === 'white' ? 'w' : 'b');
  const bottom = opp(top);
  const strip = (color) => {
    const isUser = color === cur.userColor;
    const left = remaining(color);
    const active = playing && turn === color;
    return (
      <div class="strip">
        <div class="player">
          <span class={`swatch piece-img king ${cgColor(color)}`} aria-hidden="true" />
          <span class="name">{isUser ? 'You' : `Level ${lvl.id} · ${lvl.name}`}</span>
          <span class="sub">{sideName(color)}</span>
          {active && !isUser && thinking && status.state !== 'failed' ? <span class="turn-pill thinking"><i />thinking</span> : null}
        </div>
        {left != null ? (
          <div class={`clock${active ? ' active' : ''}${active && left < 20000 ? ' low' : ''}`} role="timer" aria-label={`${isUser ? 'Your' : 'Opponent'} clock ${fmtClock(left)}`}>
            {fmtClock(left)}
          </div>
        ) : null}
      </div>
    );
  };

  const won = (cur.result === '1-0' && cur.userColor === 'w') || (cur.result === '0-1' && cur.userColor === 'b');
  const resultTitle = cur.result === '1/2-1/2' ? 'Draw' : cur.result === '*' ? 'Game stopped' : won ? 'You won' : 'You lost';

  const gameSection = (
    <div class="stack">
      <EngineGate status={status} onRetry={playing ? () => setRetry((n) => n + 1) : null} />
      {playing ? (
        <div class="row between">
          <span class={`turn-pill${thinking && status.state !== 'failed' ? ' thinking' : ''}`} aria-live="polite">
            <i />
            {status.state === 'loading' && !usersTurn ? 'Starting the engine…' : needScan ? 'Scan first: what’s in danger?' : usersTurn ? `Your move (${sideName(cur.userColor)})` : status.state === 'failed' ? 'Paused — the engine isn’t running' : 'Computer is thinking…'}
          </span>
          <span class="small muted">Move {Math.floor(total / 2) + 1}</span>
        </div>
      ) : (
        <Note kind={cur.result === '1/2-1/2' || cur.result === '*' ? 'info' : won ? 'good' : 'bad'} title={`${resultTitle}${cur.termination ? ` — ${cur.termination}` : ''}`} pop>
          <p>{cur.saved ? 'The game is saved. Reviewing it now is the fastest way to learn from it.' : 'Too short to save.'}</p>
          {cur.blunderCheck && (cur.checks || []).length ? (() => {
            const sm = scanSummary(cur.checks);
            return (
              <p class="small" style={{ marginTop: '6px' }} data-testid="scan-summary">
                Blunder check: {sm.right} of {sm.scans} scans right · {sm.hung ? `${sm.hung} move${sm.hung === 1 ? '' : 's'} left something hanging${sm.hungAfterWrong ? ` (${sm.hungAfterWrong} after a wrong scan)` : ''}` : 'no move left a piece hanging'}.
              </p>
            );
          })() : null}
        </Note>
      )}
      {needScan ? (
        <Note kind="info" title="Blunder check — what’s in danger?" key={`scan${total}`} pop>
          <p>Tap each of your pieces that the opponent could win right now (attacked and not safely defended). Then press Done. Nothing in danger? Press All safe.</p>
          <div class="btn-row" style={{ marginTop: '10px' }}>
            <button type="button" class="btn sm primary" onClick={() => submitScan(false)} disabled={!marks.length && !mateMark} data-testid="scan-done">
              Done ({marks.length + (mateMark ? 1 : 0)} marked)
            </button>
            <button type="button" class="btn sm" onClick={() => submitScan(true)} data-testid="scan-safe">
              All safe
            </button>
            <button type="button" class={`btn sm${mateMark ? ' primary' : ''}`} aria-pressed={mateMark} onClick={() => setMateMark((v) => !v)} data-testid="scan-mate">
              They threaten mate
            </button>
          </div>
        </Note>
      ) : null}
      {scanNote && !needScan && playing ? (
        <Note kind={scanNote.kind} title={scanNote.kind === 'good' ? 'Scan correct' : 'Scan missed something'} pop key={scanNote.key}>
          <p>{scanNote.text}</p>
        </Note>
      ) : null}
      {viewPly != null ? (
        <Note kind="info" title={`Looking back at move ${Math.ceil(viewPly / 2) || 'start'}`}>
          <button type="button" class="btn sm" style={{ marginTop: '6px' }} onClick={() => setViewPly(null)}>
            Back to the current position
          </button>
        </Note>
      ) : null}
      {warn && playing && usersTurn ? (
        <div data-testid="coach-warn">
          <Note kind="warn" title={`Wait — before you play ${warn.san}`} pop key={warn.at}>
            <p>{warn.text}</p>
            <div class="btn-row" style={{ marginTop: '10px' }}>
              <button type="button" class="btn sm primary" onClick={() => { setWarn(null); bumpCoach('heeded'); }} data-testid="warn-other" autoFocus>
                Choose another move
              </button>
              <button type="button" class="btn sm ghost" onClick={() => { const mv = warn.move; confirmRef.current = warn.key; bumpCoach('ignored'); setWarn(null); onUserMove(mv); }} data-testid="warn-play">
                Play {warn.san} anyway
              </button>
            </div>
          </Note>
        </div>
      ) : null}
      {cur.coach && verdict && playing ? (
        <p class="coach-verdict" data-testid="coach-verdict">
          <span class={`dot ${verdict.kind}`} aria-hidden="true" />
          Your last move <strong>{verdict.san}</strong>: {verdict.label}
          {(() => {
            const t = cur.coachTally || {};
            const good = (t.best || 0) + (t.good || 0);
            const parts = [`${good} good`, t.inaccuracy ? `${t.inaccuracy} inaccurac${t.inaccuracy === 1 ? 'y' : 'ies'}` : null, t.mistake ? `${t.mistake} mistake${t.mistake === 1 ? '' : 's'}` : null, t.blunder ? `${t.blunder} blunder${t.blunder === 1 ? '' : 's'}` : null].filter(Boolean);
            return <span class="muted"> · this game: {parts.join(', ')}</span>;
          })()}
        </p>
      ) : null}
      {coachNote ? (
        <Note kind={coachNote.kind} title={coachNote.title} pop key={coachNote.key}>
          <p>{coachNote.text}</p>
          {coachNote.takeback && playing ? (
            <div class="btn-row" style={{ marginTop: '10px' }}>
              <button type="button" class="btn sm" onClick={takeBack}>
                <Icon name="undo" /> Take it back
              </button>
              <button type="button" class="btn sm ghost" onClick={() => setCoachNote(null)}>
                Play on
              </button>
            </div>
          ) : null}
        </Note>
      ) : null}
      {hintText ? (
        <Note kind="warn" title="Hint">
          <p>{hintText}</p>
        </Note>
      ) : null}
      {playing ? (
        <div class="btn-row">
          {cur.coach ? (
            <button type="button" class="btn" onClick={askHint} disabled={!usersTurn}>
              <Icon name="hint" /> Hint
            </button>
          ) : null}
          <button type="button" class="btn" onClick={takeBack} disabled={!cur.moves.length || (total < 2 && turn === cur.userColor)}>
            <Icon name="undo" /> Take back
          </button>
          <button type="button" class="btn" onClick={() => setOrientation((o) => (o === 'white' ? 'black' : 'white'))} aria-label="Flip board">
            <Icon name="flip" /> Flip
          </button>
          <button type="button" class="btn danger" onClick={() => setConfirm('resign')}>
            <Icon name="flag" /> Resign
          </button>
        </div>
      ) : (
        <div class="stack tight">
          {cur.saved ? (
            <button type="button" class="btn primary big block" data-testid="review-game" onClick={() => { update((s) => (s.ui.reviewId = cur.id)); go('review', { id: cur.id }); }}>
              Review this game <Icon name="arrow" />
            </button>
          ) : null}
          <div class="btn-row">
            <button type="button" class="btn" onClick={() => startGame({ level: cur.level, side: opp(cur.userColor), timeControl: cur.timeControl, coach: cur.coach, startFen: cur.startFen })}>
              <Icon name="swap" /> Rematch, switch sides
            </button>
            <button type="button" class="btn" onClick={() => update((s) => (s.current = null), { immediate: true })}>
              <Icon name="plus" /> New game
            </button>
            <button type="button" class="btn" onClick={() => setOrientation((o) => (o === 'white' ? 'black' : 'white'))}>
              <Icon name="flip" /> Flip
            </button>
          </div>
        </div>
      )}
    </div>
  );

  const movesSection = (
    <div class="stack tight">
      <div style={{ maxHeight: '38dvh', overflow: 'hidden', display: 'flex' }}>
        <MoveList plies={data.plies} current={shownPly} onSelect={(n) => setViewPly(n >= total ? null : n)} startFen={cur.startFen} />
      </div>
      <ReplayBar current={shownPly} total={total} onSelect={(n) => setViewPly(n >= total ? null : n)} />
    </div>
  );

  const optionsSection = (
    <div class="stack">
      <div class="btn-row">
        <button type="button" class="btn" onClick={copyPgn} disabled={!total}>
          <Icon name="copy" /> Copy PGN
        </button>
        <button type="button" class="btn" onClick={savePgn} disabled={!total}>
          <Icon name="download" /> Save .pgn
        </button>
      </div>
      {playing ? (
        <>
        <Switch checked={cur.coach} onChange={(v) => update((s) => { s.current.coach = v; s.settings.coach = v; })} hint="A verdict on every move, hints on request, and warnings before blunders.">
          Live coach
        </Switch>
        {cur.coach ? <WheelsControl /> : null}
        <Switch checked={!!cur.blunderCheck} onChange={(v) => update((s) => { s.current.blunderCheck = v; s.current.checks = s.current.checks || []; s.settings.blunderCheck = v; })} hint="Mark what’s in danger before each move.">
          Blunder check
        </Switch>
        </>
      ) : null}
      <Switch checked={settings.autoQueen} onChange={(v) => update((s) => (s.settings.autoQueen = v))} hint="Skip the promotion picker.">
        Always promote to a queen
      </Switch>
      <p class="small muted">
        Level {lvl.id} ({lvl.name}, {lvl.elo}) · {cur.timeControl === 'none' ? 'no clock' : cur.timeControl.replace('+', ' min + ') + ' s'}
        {cur.startFen ? ' · custom start position' : ''}
      </p>
      {playing ? (
        <button type="button" class="btn ghost" onClick={() => setConfirm('abandon')}>
          Stop and set up a new game
        </button>
      ) : null}
    </div>
  );

  return (
    <>
      <Workspace
        eyebrow={cur.startFen ? 'Position practice' : 'Play'}
        title={playing ? 'Game on' : resultTitle}
        strips={96}
        tab={tab}
        onTab={setTab}
        above={strip(top)}
        below={strip(bottom)}
        board={
          <Board
            fen={fen}
            orientation={orientation}
            interactive={usersTurn && viewPly == null}
            movableColor={cur.userColor}
            lastMove={lastMove}
            shapes={shapes}
            onMove={onUserMove}
            onSquare={needScan ? toggleMark : undefined}
            coords={settings.coords}
            autoQueen={settings.autoQueen}
            rev={rev}
            label="Game board"
          />
        }
        sections={[
          { id: 'game', label: 'Game', heading: false, content: gameSection },
          { id: 'moves', label: 'Moves', content: movesSection },
          { id: 'options', label: 'Options', content: optionsSection },
        ]}
      />
      {confirm === 'resign' ? (
        <Dialog title="Resign this game?" onClose={() => setConfirm(null)} actions={<><button type="button" class="btn" onClick={() => setConfirm(null)}>Keep playing</button><button type="button" class="btn danger" onClick={resign}>Resign</button></>}>
          <p class="muted">The game is saved as a loss so you can review it.</p>
        </Dialog>
      ) : null}
      {confirm === 'abandon' ? (
        <Dialog title="Stop this game?" onClose={() => setConfirm(null)} actions={<><button type="button" class="btn" onClick={() => setConfirm(null)}>Keep playing</button><button type="button" class="btn danger" onClick={abandon}>Stop game</button></>}>
          <p class="muted">{cur.moves.length >= 2 ? 'The moves so far are saved as an unfinished game.' : 'Nothing has been played yet, so nothing is saved.'}</p>
        </Dialog>
      ) : null}
    </>
  );
}
