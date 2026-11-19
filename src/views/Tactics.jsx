// Tactics: rated puzzles that adapt to you, practice by theme, a spaced-
// repetition queue for misses, and positions saved from your own games.
// Hints come in stages (what to look for → which piece → the move), and a
// wrong move is answered with the opponent's best reply so you see why it fails.
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { Chess } from 'chess.js';
import { Board } from '../components/Board.jsx';
import { Icon } from '../components/Icon.jsx';
import { ReplayBar } from '../components/MoveList.jsx';
import { Workspace, Note, Line, Dialog } from '../components/ui.jsx';
import { useStore, update } from '../lib/store.js';
import { playUci, sideName, cgColor, PIECE_NAME, VALUE, sanLine, turnOf, opp } from '../lib/chessx.js';
import { judgeAttempt } from '../lib/analysis.js';
import { engines } from '../lib/engine.js';
import { materialSwing, describeLoss } from '../lib/explain.js';
import { hanging } from '../lib/motifs.js';
import { describeDue, dueIds } from '../lib/srs.js';
import { LIBRARY, getPuzzle, buildQueue, pickAdaptive, themeCounts, themeStats, recordPuzzle, logSession, loadLibrary, onLibrary, libraryReady, ratingOf, PROVISIONAL } from '../lib/puzzles.js';
import { THEMES, themeLabel, themeOne } from '../data/themes.js';
import { go } from '../lib/router.js';

const pct = (s) => (s && s.n ? Math.round((s.ok / s.n) * 100) : null);
const SESSION = 10;

function useLibrary() {
  const [, setN] = useState(0);
  useEffect(() => {
    const off = onLibrary(() => setN((n) => n + 1));
    loadLibrary().catch(() => {});
    return off;
  }, []);
  return libraryReady;
}

function RatingCard() {
  const pr = useStore((s) => s.puzzleRating) || { r: 1000, n: 0, hist: [] };
  const hist = (pr.hist || []).slice(-40);
  const w = 160;
  const h = 40;
  let path = null;
  if (hist.length > 1) {
    const lo = Math.min(...hist.map((x) => x.r)) - 10;
    const hi = Math.max(...hist.map((x) => x.r)) + 10;
    path = hist.map((x, i) => `${i ? 'L' : 'M'}${((i / (hist.length - 1)) * w).toFixed(1)} ${(h - ((x.r - lo) / (hi - lo)) * h).toFixed(1)}`).join(' ');
  }
  const prov = pr.n < PROVISIONAL;
  return (
    <div class="stat" style={{ display: 'flex', alignItems: 'center', gap: '18px', flexWrap: 'wrap' }} data-testid="puzzle-rating">
      <div>
        <div class="eyebrow">Your puzzle rating</div>
        <div class="v" style={{ color: 'var(--amber)' }}>{pr.r}{prov ? <span class="small muted" style={{ fontSize: '13px', marginLeft: '6px' }}>provisional</span> : null}</div>
        <div class="s">{pr.n ? `${pr.n} rated puzzle${pr.n === 1 ? '' : 's'}${prov ? ` · settles after ${PROVISIONAL}` : ''}` : 'Starts at 1000 and moves after every rated puzzle'}</div>
      </div>
      {path ? (
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`Puzzle rating over your last ${hist.length} puzzles`} style={{ flex: 'none' }}>
          <path d={path} fill="none" stroke="var(--amber)" stroke-width="2" stroke-linejoin="round" />
        </svg>
      ) : null}
    </div>
  );
}

// ---- library ------------------------------------------------------------------------
function Library({ onStart }) {
  const ready = useLibrary();
  const stats = useStore((s) => s.puzzleStats);
  const attempts = useStore((s) => s.attempts);
  const customs = useStore((s) => s.customPuzzles);
  const due = dueIds(stats).filter((id) => getPuzzle(id));
  const tStats = useMemo(() => themeStats(attempts), [attempts.length]);
  const counts = themeCounts();
  const mine = Object.keys(customs).length;
  const [manage, setManage] = useState(false);

  return (
    <div class="page">
      <div class="page-head">
        <div>
          <div class="eyebrow">Tactics</div>
          <h1 style={{ marginTop: '10px' }}>
            Train the patterns that <em>win games</em>
          </h1>
          <p>
            {LIBRARY.length.toLocaleString()} puzzles{ready ? '' : ' (loading the rest…)'}. Rated training picks puzzles just below your level and adjusts after every one, so you get roughly two out of three. Stuck? Hints come in steps, and a wrong move shows you the reply that refutes it.
          </p>
        </div>
      </div>

      <div style={{ marginBottom: '18px' }}>
        <RatingCard />
      </div>

      <div class="grid-3" style={{ marginBottom: '22px' }}>
        <button type="button" class="card" onClick={() => onStart({ mode: 'rated' }, 'Rated training')} data-testid="start-mixed">
          <span class="chip amber" style={{ alignSelf: 'start' }}>
            Adapts to you
          </span>
          <h3>Rated training</h3>
          <p>Ten puzzles across themes at your level. Your rating goes up when you solve, down when you miss.</p>
          <div class="foot">
            <span>About 5–10 minutes</span>
            <Icon name="arrow" />
          </div>
        </button>
        <button type="button" class="card" onClick={() => onStart({ mode: 'review' }, 'Missed puzzles')} disabled={!due.length} data-testid="start-review">
          <span class={`chip ${due.length ? 'coral' : ''}`} style={{ alignSelf: 'start' }}>
            {due.length ? `${due.length} due now` : 'Nothing due'}
          </span>
          <h3>Retry my misses</h3>
          <p>{due.length ? 'Puzzles you missed or needed a hint for, back on schedule.' : 'Miss a puzzle and it comes back here: after ten minutes, then a day, then longer.'}</p>
          <div class="foot">
            <span>Spaced repetition</span>
            <Icon name="arrow" />
          </div>
        </button>
        <button type="button" class="card" onClick={() => onStart({ mode: 'mine' }, 'From my games')} disabled={!mine} data-testid="start-mine">
          <span class={`chip ${mine ? 'turq' : ''}`} style={{ alignSelf: 'start' }}>
            {mine} saved
          </span>
          <h3>Mistakes from my games</h3>
          <p>{mine ? 'Critical positions you saved while reviewing. Find the move you missed.' : 'In a game review, press “Save for practice” on a mistake and it shows up here.'}</p>
          <div class="foot">
            <span>{mine ? 'Engine-checked answers' : 'Empty for now'}</span>
            <Icon name="arrow" />
          </div>
        </button>
      </div>
      {mine ? (
        <div class="row" style={{ margin: '-8px 0 18px', justifyContent: 'flex-end' }}>
          <button type="button" class="btn sm ghost" onClick={() => setManage(true)}>
            Manage saved positions
          </button>
        </div>
      ) : null}
      <div class="panel pad">
        <div class="panel-title">
          <h3>Practise by theme</h3>
          <span class="small muted">at your level · accuracy counts first tries without a hint</span>
        </div>
        <div class="theme-grid">
          {THEMES.filter((t) => counts[t.id]).map((t) => {
            const s = tStats[t.id];
            const p = pct(s);
            return (
              <button key={t.id} type="button" class="theme-btn" onClick={() => onStart({ mode: 'theme', theme: t.id }, t.label)} data-testid={`theme-${t.id}`}>
                <b>{t.label}</b>
                <span>
                  {counts[t.id]} puzzles · {s && s.n >= 3 ? `${p}% of ${s.n}` : s ? `${s.n} tried` : 'not tried yet'}
                </span>
                {s && s.n >= 3 ? (
                  <span class={`meter ${p < 50 ? 'coral' : p < 75 ? 'amber' : ''}`} aria-hidden="true" style={{ marginTop: '4px' }}>
                    <i style={{ width: `${p}%` }} />
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>
      <p class="small muted" style={{ marginTop: '14px' }}>
        Rated puzzles come from the Lichess puzzle database (public domain). The {LIBRARY.filter((p) => p.source === 'outpost').length} starter puzzles were made for Outpost from engine games; their ratings are estimates.
      </p>
      {manage ? <ManageSaved onClose={() => setManage(false)} /> : null}
    </div>
  );
}

function ManageSaved({ onClose }) {
  const customs = useStore((s) => s.customPuzzles);
  const stats = useStore((s) => s.puzzleStats);
  const list = Object.values(customs).sort((a, b) => b.created - a.created);
  const remove = (id) =>
    update((s) => {
      delete s.customPuzzles[id];
      delete s.puzzleStats[id];
    });
  return (
    <Dialog title="Saved positions" onClose={onClose} wide>
      {list.length ? (
        <ul class="list">
          {list.map((p) => (
            <li key={p.id}>
              <div class="row">
                <span class="grow">
                  <span class="title" style={{ display: 'block', fontWeight: 600 }}>
                    {p.source?.label || 'Saved position'} · you played {p.played}
                  </span>
                  <span class="meta small muted">
                    {sideName(turnOf(p.fen))} to move · {p.themes?.length ? themeOne(p.themes[0]) : 'no theme'} · {describeDue(stats[p.id]) || 'not scheduled'}
                  </span>
                </span>
                <button type="button" class="btn sm" onClick={() => { onClose(); go('tactics', { mode: 'ids', ids: [p.id], label: 'Saved position' }); }}>
                  Practise
                </button>
                <button type="button" class="btn ghost icon" aria-label="Remove from practice" onClick={() => remove(p.id)}>
                  <Icon name="trash" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p class="muted">Nothing saved.</p>
      )}
    </Dialog>
  );
}

// ---- why a wrong move fails ----------------------------------------------------------
async function refute(fenAfter, solver) {
  const c = new Chess(fenAfter);
  const oppName = sideName(opp(solver));
  if (c.isCheckmate()) return null;
  if (c.isStalemate()) return { text: 'That’s stalemate — the win is thrown away.', reply: null };
  const r = await engines.analyst.analyse(fenAfter, { depth: 12, movetime: 900 }).catch(() => null);
  if (!r || !r.best) return null;
  const line = r.lines[0];
  const d = new Chess(fenAfter);
  const m = playUci(d, r.best);
  if (!m) return null;
  const reply = { uci: r.best, san: m.san, fen: d.fen(), from: m.from, to: m.to };
  if (line.mate != null && line.mate > 0) return { reply, text: line.mate === 1 ? `${oppName} answers ${m.san} — checkmate.` : `${oppName} answers ${m.san} and has mate in ${line.mate}.` };
  const swing = materialSwing(fenAfter, line.pv || [r.best], solver);
  if (m.captured && swing.net <= -1 && -swing.net >= VALUE[m.captured] - 0.5) {
    const extra = -swing.net - VALUE[m.captured];
    return { reply, text: `${oppName} answers ${m.san}, winning your ${PIECE_NAME[m.captured]}${extra >= 1 ? ' — and more follows' : ''}.` };
  }
  if (swing.net <= -1) return { reply, text: `${oppName} answers ${m.san}, and you end up losing ${describeLoss(swing.lost, swing.won, swing.net)}.` };
  const cp = line.cp ?? 0; // from the opponent's side
  if (cp > 150) return { reply, text: `${oppName} answers ${m.san} and is better now.` };
  if (cp > -150) return { reply, text: `After ${m.san} the position is roughly level — the win is gone.` };
  return { reply, text: `${oppName} answers ${m.san}. You keep an edge, but there was something much stronger.` };
}

// What the "look for" hint says: counts, never the answer.
function scanHint(fen) {
  const c = new Chess(fen);
  const moves = c.moves({ verbose: true });
  const checks = moves.filter((m) => m.san.includes('+') || m.san.includes('#')).length;
  const caps = moves.filter((m) => m.captured).length;
  const loose = hanging(c).length;
  const bits = [];
  bits.push(checks ? `${checks} check${checks === 1 ? '' : 's'}` : 'no checks');
  bits.push(caps ? `${caps} capture${caps === 1 ? '' : 's'}` : 'no captures');
  return `Scan before you move: you have ${bits.join(' and ')}${loose ? `, and ${loose === 1 ? 'one enemy piece is' : `${loose} enemy pieces are`} loose` : ''}. Try each forcing move in your head — what does the opponent have to do next?`;
}

// ---- one puzzle --------------------------------------------------------------------
function Solver({ puzzle, index, total, label, onDone, onNext, onQuit, sessionScore }) {
  const settings = useStore((s) => s.settings);
  const start = puzzle.lead ? puzzle.lead.fen : puzzle.fen;
  const solver = turnOf(puzzle.fen);
  const [fen, setFen] = useState(start);
  const [k, setK] = useState(0); // index into solution of the next move to play
  const [lastMove, setLastMove] = useState(null);
  const [phase, setPhase] = useState(puzzle.lead ? 'lead' : 'solve'); // lead | solve | opp | checking | refuting | done
  const [outcome, setOutcome] = useState(null); // 'solved' | 'shown'
  const [missed, setMissed] = useState(false);
  const [hint, setHint] = useState(0); // 0 none · 1 what to look for · 2 which piece · 3 the move
  const [usedHint, setUsedHint] = useState(false);
  const [msg, setMsg] = useState(null);
  const [flash, setFlash] = useState(null);
  const [rev, setRev] = useState(0);
  const [view, setView] = useState(null); // replay index after the puzzle
  const [delta, setDelta] = useState(null);
  const [refShape, setRefShape] = useState(null);
  const recorded = useRef(false);
  const t0 = useRef(Date.now());
  const timers = useRef([]);
  const alive = useRef(true);
  const later = (fn, ms) => timers.current.push(setTimeout(fn, ms));
  useEffect(() => () => {
    alive.current = false;
    timers.current.forEach(clearTimeout);
  }, []);

  useEffect(() => {
    if (!puzzle.lead) return;
    later(() => {
      const c = new Chess(puzzle.lead.fen);
      const m = playUci(c, puzzle.lead.uci);
      setFen(puzzle.fen);
      setLastMove(m ? [m.from, m.to] : null);
      setPhase('solve');
      t0.current = Date.now();
    }, 650);
  }, []);

  const record = (ok, hinted) => {
    if (recorded.current) return;
    recorded.current = true;
    const d = recordPuzzle(puzzle, { ok, hint: hinted, ms: Date.now() - t0.current });
    setDelta(d);
    onDone(ok && !hinted);
  };

  const finish = (how) => {
    setPhase('done');
    setOutcome(how);
    setRefShape(null);
    if (how === 'solved') {
      setFlash({ kind: 'good', key: Date.now() });
      record(!missed, usedHint);
    } else record(false, usedHint);
  };

  const playOpponent = (fenNow, kNow) => {
    setPhase('opp');
    later(() => {
      const c = new Chess(fenNow);
      const m = playUci(c, puzzle.solution[kNow]);
      if (!m) {
        finish('solved');
        return;
      }
      setFen(c.fen());
      setLastMove([m.from, m.to]);
      setK(kNow + 1);
      setPhase('solve');
    }, 420);
  };

  const onMove = async (move) => {
    if (phase !== 'solve') {
      setRev((n) => n + 1);
      return;
    }
    const uci = move.from + move.to + (move.promotion || '');
    const before = fen;
    const c = new Chess(before);
    const m = playUci(c, uci);
    if (!m) {
      setRev((n) => n + 1);
      return;
    }
    const expected = puzzle.solution[k];
    const mates = c.isCheckmate();
    if (uci === expected || mates) {
      setMsg(k + 1 < puzzle.solution.length && !mates ? { kind: 'good', text: 'Good — keep going. What’s the follow-up?' } : null);
      setHint(0);
      setRefShape(null);
      setFen(c.fen());
      setLastMove([m.from, m.to]);
      const nk = k + 1;
      setK(nk);
      if (mates || nk >= puzzle.solution.length) finish('solved');
      else playOpponent(c.fen(), nk);
      return;
    }
    // Saved positions from my games: any move the engine rates as good as its own counts.
    if (puzzle.custom && k === 0) {
      setPhase('checking');
      setFen(c.fen());
      setLastMove([m.from, m.to]);
      const v = await judgeAttempt(before, uci, puzzle.ref ? { ...puzzle.ref } : null, { depth: 12 }).catch(() => null);
      if (!alive.current) return;
      if (v && v.ok) {
        setMsg({ kind: 'good', text: `${m.san} works as well as the engine’s move.` });
        finish('solved');
        return;
      }
    }
    // Wrong: show the refutation on the board, then put the position back.
    setMissed(true);
    if (!recorded.current) record(false, usedHint);
    setFlash({ kind: 'bad', key: Date.now() });
    setPhase('refuting');
    setFen(c.fen());
    setLastMove([m.from, m.to]);
    setMsg({ kind: 'bad', text: puzzle.custom && m.san === puzzle.played ? `${m.san} is the move you played in the game. Let’s see why it fails…` : `${m.san} isn’t it. Let’s see why…` });
    const why = await refute(c.fen(), solver);
    if (!alive.current) return;
    if (why && why.reply) {
      setFen(why.reply.fen);
      setLastMove([why.reply.from, why.reply.to]);
      setRefShape({ orig: why.reply.from, dest: why.reply.to, brush: 'coral' });
    }
    setMsg({ kind: 'bad', text: `${m.san} isn’t it. ${why ? why.text : 'It lets the opponent off the hook.'} Back to the puzzle — try again.` });
    later(() => {
      setFen(before);
      setLastMove(null);
      setRefShape(null);
      setPhase('solve');
      setRev((n) => n + 1);
    }, why && why.reply ? 1700 : 300);
  };

  const showSolution = () => {
    setHint(3);
    setUsedHint(true);
    setMissed(true);
    if (!recorded.current) record(false, true);
    let f = fen;
    let i = k;
    setPhase('opp');
    const step = () => {
      if (i >= puzzle.solution.length) {
        finish('shown');
        return;
      }
      const c = new Chess(f);
      const m = playUci(c, puzzle.solution[i]);
      if (!m) {
        finish('shown');
        return;
      }
      f = c.fen();
      i++;
      setFen(f);
      setLastMove([m.from, m.to]);
      setK(i);
      later(step, 600);
    };
    later(step, 250);
  };

  const askHint = () => {
    setHint((h) => Math.min(3, h + 1));
    setUsedHint(true);
  };

  // board decorations
  const expected = phase === 'solve' ? puzzle.solution[k] : null;
  const shapes = [];
  if (expected && hint === 2) shapes.push({ orig: expected.slice(0, 2), brush: 'turq' });
  if (expected && hint === 3) shapes.push({ orig: expected.slice(0, 2), dest: expected.slice(2, 4), brush: 'turq' });
  if (refShape) shapes.push(refShape);
  let hintText = null;
  if (expected && hint) {
    const p = new Chess(fen).get(expected.slice(0, 2));
    const m = playUci(new Chess(fen), expected);
    hintText = hint === 1 ? scanHint(fen) : hint === 2 ? `Use your ${PIECE_NAME[p?.type] || 'piece'} on ${expected.slice(0, 2)}. Where can it go that hurts?` : `Play ${m ? m.san : expected}.`;
  }

  // replay after the puzzle
  const toks = useMemo(() => sanLine(puzzle.fen, puzzle.solution, 20), [puzzle.id]);
  const replayFens = [puzzle.fen, ...toks.map((t) => t.fen)];
  const done = phase === 'done';
  const shownFen = done && view != null ? replayFens[view] : fen;
  const shownLast = done && view != null ? (view > 0 ? [toks[view - 1].uci.slice(0, 2), toks[view - 1].uci.slice(2, 4)] : null) : lastMove;

  const themeChips = puzzle.themes.filter((t) => t !== 'mate' || puzzle.themes.length === 1);
  const yourMoves = Math.ceil(puzzle.solution.length / 2);
  const movesLeft = Math.ceil((puzzle.solution.length - k) / 2);
  const hintLabel = hint === 0 ? 'Hint' : hint === 1 ? 'Which piece?' : 'Show the move';

  const panel = (
    <div class="stack" data-testid="puzzle-panel">
      <div class="row between">
        <span class={`turn-pill${phase === 'opp' || phase === 'checking' || phase === 'refuting' ? ' thinking' : ''}`} aria-live="polite">
          <i />
          {phase === 'lead' ? 'Watch the last move…' : phase === 'opp' ? 'Opponent replies…' : phase === 'checking' ? 'Checking with the engine…' : phase === 'refuting' ? 'Showing the refutation…' : done ? (outcome === 'solved' ? 'Solved' : 'Solution shown') : `${sideName(solver)} to move`}
        </span>
        <span class="small muted">
          {index + 1} / {total} · {sessionScore} first-try
        </span>
      </div>
      {!done ? (
        <p class="muted" style={{ margin: 0 }}>
          {puzzle.custom
            ? `From your game ${puzzle.source?.label || ''}. You played ${puzzle.played} here — find the stronger move.`
            : `Find the best move for ${sideName(solver)}.${yourMoves > 1 ? ` ${movesLeft === yourMoves ? `It takes ${yourMoves} moves` : `${movesLeft} more move${movesLeft === 1 ? '' : 's'}`}; the opponent’s replies are played for you.` : ''}`}
        </p>
      ) : null}
      {msg ? (
        <Note kind={msg.kind} title={msg.kind === 'bad' ? 'Not quite' : 'Nice'} pop key={msg.text}>
          <p>{msg.text}</p>
        </Note>
      ) : null}
      {hintText && !done ? (
        <Note kind="warn" title={hint === 1 ? 'What to look for' : hint === 2 ? 'Which piece' : 'The move'}>
          <p>{hintText}</p>
        </Note>
      ) : null}
      {done ? (
        <Note kind={outcome === 'solved' && !missed && !usedHint ? 'good' : outcome === 'solved' ? 'info' : 'warn'} title={outcome === 'solved' ? (missed || usedHint ? 'Solved — it will come back for review' : 'Solved on the first try') : 'Here is the solution'} pop>
          <div class="row wrap" style={{ gap: '6px', margin: '4px 0 8px' }}>
            {themeChips.map((t) => (
              <span key={t} class="chip turq">{themeLabel(t)}</span>
            ))}
            {puzzle.rating && !puzzle.custom ? <span class="chip">Puzzle rated {puzzle.rating}</span> : null}
          </div>
          {delta != null ? (
            <p class="small" data-testid="rating-change">
              Your puzzle rating: <strong>{ratingOf().r}</strong> <span style={{ color: delta >= 0 ? 'var(--turq)' : 'var(--coral)' }}>({delta >= 0 ? '+' : '−'}{Math.abs(delta)})</span>
            </p>
          ) : null}
          {puzzle.note ? <p class="small">{puzzle.note}</p> : null}
          <div style={{ marginTop: '6px' }}>
            <Line fen={puzzle.fen} pv={puzzle.solution} max={20} onPick={(t, i) => setView(i + 1)} label="Solution line" />
          </div>
        </Note>
      ) : null}
      {done ? <ReplayBar current={view ?? replayFens.length - 1} total={replayFens.length - 1} onSelect={(n) => setView(Math.max(0, Math.min(replayFens.length - 1, n)))} /> : null}
      <div class="btn-row">
        {!done ? (
          <>
            <button type="button" class="btn" onClick={askHint} disabled={phase !== 'solve' || hint >= 3} data-testid="puzzle-hint">
              <Icon name="hint" /> {hintLabel}
            </button>
            <button type="button" class="btn" onClick={showSolution} disabled={phase !== 'solve'} data-testid="puzzle-solution">
              <Icon name="eye" /> Solution
            </button>
          </>
        ) : (
          <>
            <button type="button" class="btn primary" onClick={() => onNext()} data-testid="puzzle-next" autoFocus>
              {index + 1 < total ? 'Next puzzle' : 'Finish'} <Icon name="arrow" />
            </button>
            <button type="button" class="btn" onClick={() => onNext({ retry: true })} data-testid="puzzle-retry">
              <Icon name="retry" /> Try it again
            </button>
          </>
        )}
        <button type="button" class="btn ghost" onClick={onQuit}>
          End session
        </button>
      </div>
      {done && puzzle.source === 'lichess' && puzzle.lichessId ? (
        <a class="small muted" href={`https://lichess.org/training/${puzzle.lichessId}`} target="_blank" rel="noopener noreferrer">
          Open on Lichess ({puzzle.lichessId})
        </a>
      ) : null}
      {done && puzzle.custom && puzzle.source?.gameId ? (
        <button type="button" class="btn sm ghost" onClick={() => go('review', { id: puzzle.source.gameId, ply: puzzle.source.ply })}>
          Open this moment in the game review
        </button>
      ) : null}
    </div>
  );

  return (
    <Workspace
      eyebrow={`Tactics · ${label}`}
      title={puzzle.custom ? 'Your position' : `Puzzle ${index + 1}`}
      strips={0}
      board={
        <Board
          fen={shownFen}
          orientation={cgColor(solver)}
          interactive={phase === 'solve'}
          movableColor={solver}
          lastMove={shownLast}
          shapes={shapes}
          onMove={onMove}
          coords={settings.coords}
          autoQueen={settings.autoQueen}
          rev={rev}
          flash={flash}
          label="Puzzle board"
        />
      }
      sections={[{ id: 'puzzle', label: 'Puzzle', heading: false, content: panel }]}
    />
  );
}

// ---- session -----------------------------------------------------------------------
function Session({ spec, label, onExit }) {
  const adaptive = spec.mode === 'rated' || spec.mode === 'theme';
  const ready = useLibrary();
  const [fixed] = useState(() => buildQueue(spec));
  const [picked, setPicked] = useState([]); // adaptive: ids chosen so far
  const [i, setI] = useState(0);
  const [round, setRound] = useState(0);
  const [results, setResults] = useState({}); // id -> first-try ok
  const queue = adaptive ? picked : fixed;
  const total = adaptive ? SESSION : fixed.length;
  const firstTry = Object.values(results).filter(Boolean).length;
  const done = i >= total;

  // Adaptive sessions choose the next puzzle only when it's needed, using the latest rating.
  useEffect(() => {
    if (!adaptive || done || picked.length > i || !ready) return;
    const id = pickAdaptive({ theme: spec.mode === 'theme' ? spec.theme : null, exclude: new Set(picked) });
    setPicked((p) => (id ? [...p, id] : p));
    if (!id) setI(total); // ran out
  }, [i, ready, picked.length]);

  useEffect(() => {
    if (done && Object.keys(results).length) logSession(label, firstTry, Object.keys(results).length);
  }, [done]);

  if (!adaptive && !fixed.length)
    return (
      <div class="page">
        <div class="empty">
          <strong>Nothing to practise here yet</strong>
          {spec.mode === 'review' ? 'No missed puzzles are due. Come back later, or start a theme.' : 'There are no puzzles for this selection.'}
          <div>
            <button type="button" class="btn primary" onClick={onExit}>Back to tactics</button>
          </div>
        </div>
      </div>
    );

  if (done) {
    const missed = queue.filter((id) => results[id] === false);
    return (
      <div class="page" data-testid="session-summary">
        <div class="page-head">
          <div>
            <div class="eyebrow">Tactics · {label}</div>
            <h1 style={{ marginTop: '10px' }}>
              {firstTry} of {Object.keys(results).length} on the first try
            </h1>
            <p>{missed.length ? `${missed.length} miss${missed.length === 1 ? '' : 'es'} went into your review queue. Retry them now while the pattern is fresh, or let spaced repetition bring them back.` : 'Clean session. These patterns are sticking.'} Your puzzle rating is now {ratingOf().r}.</p>
          </div>
        </div>
        <div class="btn-row">
          {missed.length ? (
            <button type="button" class="btn primary big" onClick={() => go('tactics', { mode: 'ids', ids: missed, label: 'Retry misses' })}>
              <Icon name="retry" /> Retry the {missed.length} missed
            </button>
          ) : null}
          {adaptive ? (
            <button type="button" class={`btn big${missed.length ? '' : ' primary'}`} onClick={() => go('tactics', { ...spec, label })}>
              Ten more
            </button>
          ) : null}
          <button type="button" class="btn big" onClick={onExit}>
            Back to tactics
          </button>
        </div>
      </div>
    );
  }

  const puzzle = queue[i] ? getPuzzle(queue[i]) : null;
  if (!puzzle)
    return (
      <div class="page">
        <p class="muted">Loading puzzles…</p>
      </div>
    );
  return (
    <Solver
      key={`${puzzle.id}:${round}`}
      puzzle={puzzle}
      index={i}
      total={total}
      label={label}
      sessionScore={firstTry}
      onDone={(ok) => setResults((r) => (puzzle.id in r ? r : { ...r, [puzzle.id]: ok }))}
      onNext={(opts) => {
        if (opts && opts.retry) setRound((n) => n + 1);
        else setI(i + 1);
      }}
      onQuit={onExit}
    />
  );
}

export function Tactics({ params }) {
  const spec = params && params.mode ? params : null;
  const exit = () => go('tactics');
  if (!spec) return <Library onStart={(s, label) => go('tactics', { ...s, label })} />;
  const label = spec.label || (spec.mode === 'theme' ? themeLabel(spec.theme) : spec.mode === 'review' ? 'Missed puzzles' : spec.mode === 'mine' ? 'From my games' : 'Rated training');
  return <Session spec={spec} label={label} onExit={exit} />;
}
