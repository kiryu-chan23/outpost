// Learn: short interactive lessons and endgame drills against the engine.
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { Chess } from 'chess.js';
import { Board } from '../components/Board.jsx';
import { Icon } from '../components/Icon.jsx';
import { MoveList } from '../components/MoveList.jsx';
import { Workspace, Note, EngineGate } from '../components/ui.jsx';
import { useStore, update, logActivity } from '../lib/store.js';
import { playUci, sideName, cgColor, turnOf, opp, describeEnd } from '../lib/chessx.js';
import { engines, engineStatus, onEngineStatus } from '../lib/engine.js';
import { LESSONS, lessonById } from '../data/lessons.js';
import { DRILLS, drillById } from '../data/drills.js';
import { THEME_BY_ID } from '../data/themes.js';
import { go } from '../lib/router.js';
import { listGames, gamesVersion } from '../lib/store.js';
import { wonPositions, convertDrill, fmtAdv, LOST_CP, CONVERTED_CP } from '../lib/convert.js';
import { AcademyIndex, AcademyTopic, ALL_TOPICS } from './Academy.jsx';
import { PathSection, OwnPositions } from './LearnPath.jsx';
import { lessonPositions, lessonHasOwn } from '../lib/path.js';
import { CalcCard, CalcTrainer } from './Calc.jsx';

function useEngineStatus() {
  const [, setN] = useState(0);
  useEffect(() => onEngineStatus(() => setN((n) => n + 1)), []);
  return engineStatus;
}

const GOAL_TEXT = { mate: 'Deliver checkmate', promote: 'Promote and keep the queen', hold: 'Hold the draw', convert: 'Convert the win' };

// ---- overview -------------------------------------------------------------------------
function AcademyCard() {
  const academy = useStore((s) => s.academy || {});
  const learned = Object.values(academy).filter((x) => x && x.learned).length;
  return (
    <button type="button" class="card" style={{ marginBottom: '30px', width: '100%' }} onClick={() => go('learn', { academy: 1 })} data-testid="open-academy">
      <span class="chip amber" style={{ alignSelf: 'start' }}>{learned} of {ALL_TOPICS.length} learned</span>
      <h3>Theme academy: every puzzle theme, explained</h3>
      <p>Forks, pins, deflection, zugzwang, Anastasia’s mate and the rest — all {ALL_TOPICS.length} Lichess puzzle themes, each with a detailed lesson, real examples to step through, and practice at your level.</p>
      <div class="foot">
        <span>Motifs · advanced ideas · mates · mate patterns · special moves · phases</span>
        <Icon name="arrow" />
      </div>
    </button>
  );
}

function ConvertSection() {
  const drills = useStore((s) => s.drillStats);
  const order = useStore((s) => s.gameOrder);
  const list = useMemo(() => wonPositions(listGames()), [order.join(','), gamesVersion()]);
  const [more, setMore] = useState(false);
  const shown = more ? list : list.slice(0, 6);
  return (
    <section style={{ marginBottom: '30px' }} aria-labelledby="h-convert">
      <div class="row between wrap" style={{ marginBottom: '12px', gap: '8px' }}>
        <h2 id="h-convert">Convert your wins</h2>
        <span class="small muted">{list.length ? `${list.length} position${list.length === 1 ? '' : 's'} from your reviewed games` : ''}</span>
      </div>
      {list.length ? (
        <>
          <div class="cards">
            {shown.map((p) => {
              const st = drills[p.id];
              return (
                <button key={p.id} type="button" class={`card${st?.wins ? ' done' : ''}`} onClick={() => go('learn', { convert: p.id })} data-testid="convert-card">
                  <span class={`chip ${p.outcome === 'lost' ? 'coral' : 'amber'}`} style={{ alignSelf: 'start' }}>
                    You {p.outcome === 'won anyway' ? 'nearly threw it' : p.outcome}
                  </span>
                  <h3>{p.label}</h3>
                  <p>
                    {p.before >= 9000 ? 'You had a forced mate' : `You were ${fmtAdv(p.before)}`} as {p.userColor === 'w' ? 'White' : 'Black'}, then {p.played}. {p.opening ? `${p.opening.split(',')[0]}.` : ''}
                  </p>
                  <div class="foot">
                    <span>{new Date(p.created).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</span>
                    {st?.wins ? <span class="chip turq">Converted {st.wins}/{st.attempts}</span> : st?.attempts ? <span class="chip amber">{st.attempts} tries</span> : <span class="chip">New</span>}
                  </div>
                </button>
              );
            })}
          </div>
          {list.length > 6 ? (
            <button type="button" class="btn sm" style={{ marginTop: '12px' }} onClick={() => setMore(!more)}>
              {more ? 'Show fewer' : `Show all ${list.length}`}
            </button>
          ) : null}
        </>
      ) : (
        <div class="empty">
          <strong>No thrown wins found yet</strong>
          Import and analyse your games (Review). Every game where you were clearly winning but didn’t win becomes a position here to finish properly against the engine.
          <div>
            <button type="button" class="btn primary" onClick={() => go('review')}>Import games</button>
          </div>
        </div>
      )}
    </section>
  );
}

function Overview() {
  const progress = useStore((s) => s.lessonProgress);
  const drills = useStore((s) => s.drillStats);
  return (
    <div class="page">
      <div class="page-head">
        <div>
          <div class="eyebrow">Lessons & drills</div>
          <h1 style={{ marginTop: '10px' }}>
            Learn it once, <em>drill it</em> until it’s automatic
          </h1>
          <p>Each lesson is a few positions you play through on the board. The drills put the technique to work against the engine at full strength.</p>
        </div>
      </div>
      <PathSection />
      <h2 style={{ marginBottom: '12px' }}>Trainers</h2>
      <div class="cards" style={{ marginBottom: '30px' }}>
        <CalcCard />
      </div>
      <AcademyCard />
      <ConvertSection />
      <h2 style={{ marginBottom: '12px' }}>Lessons</h2>
      <div class="cards" style={{ marginBottom: '30px' }}>
        {LESSONS.map((l) => {
          const p = progress[l.id];
          const tasks = l.steps.length;
          return (
            <button key={l.id} type="button" class={`card${p?.done ? ' done' : ''}`} onClick={() => go('learn', { lesson: l.id })} data-testid={`lesson-${l.id}`}>
              <h3>{l.title}</h3>
              <p>{l.summary}</p>
              <div class="foot">
                <span>
                  {tasks} positions · {l.minutes} min
                </span>
                {p?.done ? (
                  <span class="chip turq">
                    <Icon name="check" size={14} /> Done
                  </span>
                ) : p?.step ? (
                  <span class="chip amber">
                    {p.step} of {tasks}
                  </span>
                ) : (
                  <span class="chip">New</span>
                )}
              </div>
            </button>
          );
        })}
      </div>
      <h2 style={{ marginBottom: '12px' }}>Endgame drills</h2>
      <div class="cards">
        {DRILLS.map((d) => {
          const s = drills[d.id];
          return (
            <button key={d.id} type="button" class={`card${s?.wins ? ' done' : ''}`} onClick={() => go('learn', { drill: d.id })} data-testid={`drill-${d.id}`}>
              <span class="chip" style={{ alignSelf: 'start' }}>{d.level}</span>
              <h3>{d.title}</h3>
              <p>{d.blurb}</p>
              <div class="foot">
                <span>{GOAL_TEXT[d.goal]}</span>
                {s?.wins ? (
                  <span class="chip turq">
                    Best {s.best} moves · {s.wins}/{s.attempts}
                  </span>
                ) : s?.attempts ? (
                  <span class="chip amber">{s.attempts} tries</span>
                ) : (
                  <span class="chip">New</span>
                )}
              </div>
            </button>
          );
        })}
      </div>
      <p class="small muted" style={{ marginTop: '22px' }}>
        Want a different position? Play → “Start from a FEN” sets up any position against the engine.
      </p>
    </div>
  );
}

// ---- lesson ------------------------------------------------------------------------------
function LessonPlayer({ lesson, startOwn = false }) {
  const settings = useStore((s) => s.settings);
  const own = useMemo(() => lessonPositions(listGames(), lesson.id, 3), [lesson.id, gamesVersion()]);
  const [ownStage, setOwnStage] = useState(() => (startOwn && own.length ? 'on' : null)); // null | 'on' | { found, total }
  const saved = useStore((s) => s.lessonProgress[lesson.id]);
  const [idx, setIdx] = useState(() => (startOwn && own.length ? lesson.steps.length : saved && !saved.done ? Math.min(saved.step || 0, lesson.steps.length - 1) : 0));
  const step = lesson.steps[idx];
  const [fen, setFen] = useState(() => (step ? step.fen : lesson.steps[0].fen));
  const [lastMove, setLastMove] = useState(null);
  const [state, setState] = useState('task'); // task | right | wrong
  const [tries, setTries] = useState(0);
  const [msg, setMsg] = useState(null);
  const [showMove, setShowMove] = useState(false);
  const [hintOn, setHintOn] = useState(false);
  const [flash, setFlash] = useState(null);
  const [rev, setRev] = useState(0);
  const timer = useRef(null);
  const finished = idx >= lesson.steps.length;

  useEffect(() => {
    clearTimeout(timer.current);
    if (!step) return;
    setFen(step.fen);
    setLastMove(null);
    setState(step.accept ? 'task' : 'info');
    setTries(0);
    setMsg(null);
    setShowMove(false);
    setHintOn(false);
  }, [idx]);
  useEffect(() => () => clearTimeout(timer.current), []);

  const mark = (n, done = false) =>
    update((s) => {
      const p = s.lessonProgress[lesson.id] || {};
      s.lessonProgress[lesson.id] = { step: Math.max(done ? lesson.steps.length : 0, n), done: done || !!p.done, at: Date.now() };
    });

  const next = () => {
    const n = idx + 1;
    if (n >= lesson.steps.length) {
      mark(n, true);
      if (!saved?.done) logActivity('lesson', `Finished the lesson “${lesson.title}”`, lesson.id);
      if (own.length && ownStage === null) setOwnStage('on');
    } else mark(n);
    setIdx(n);
  };

  const onMove = (move) => {
    if (state !== 'task' && state !== 'wrong') return;
    const c = new Chess(fen);
    const m = playUci(c, move.from + move.to + (move.promotion || ''));
    if (!m) {
      setRev((n) => n + 1);
      return;
    }
    if (step.accept.includes(m.san)) {
      setFen(c.fen());
      setLastMove([m.from, m.to]);
      setState('right');
      setFlash({ kind: 'good', key: Date.now() });
      setMsg(null);
      if (step.reply) {
        timer.current = setTimeout(() => {
          const r = c.move(step.reply);
          setFen(c.fen());
          setLastMove([r.from, r.to]);
        }, 650);
      }
      return;
    }
    setTries((t) => t + 1);
    setState('wrong');
    setFlash({ kind: 'bad', key: Date.now() });
    setMsg(step.strict ? `${m.san} is playable, but it isn’t the idea of this position. ${step.hint}` : `${m.san} doesn’t do it. ${step.hint}`);
    setRev((n) => n + 1);
  };

  if (ownStage === 'on') return <OwnPositions lesson={lesson} positions={own} onDone={(found, total) => setOwnStage({ found, total })} />;

  if (finished) {
    const theme = THEME_BY_ID[lesson.theme] ? lesson.theme : null;
    const drillId = lesson.steps.map((s) => s.drill).find(Boolean);
    const nextLesson = LESSONS[LESSONS.indexOf(lesson) + 1];
    return (
      <div class="page" data-testid="lesson-done">
        <div class="page-head">
          <div>
            <div class="eyebrow">Lesson complete</div>
            <h1 style={{ marginTop: '10px' }}>{lesson.title}</h1>
            <p>{lesson.summary} Now make it stick with practice.</p>
          </div>
        </div>
        {ownStage && ownStage.total ? (
          <Note kind={ownStage.found === ownStage.total ? 'good' : 'warn'} title={`You found ${ownStage.found} of ${ownStage.total} from your own games`}>
            <p>{ownStage.found === ownStage.total ? 'That’s the pattern showing up in your real games — and you saw it this time.' : 'The ones you missed are the ones to watch for in your next games. Open them in Review to see the whole line.'}</p>
          </Note>
        ) : own.length ? (
          <Note kind="info" title={`${own.length} position${own.length === 1 ? '' : 's'} from your games`}>
            <p>Moments from your reviewed games where this lesson’s idea mattered.</p>
            <button type="button" class="btn sm primary" style={{ marginTop: '8px' }} onClick={() => setOwnStage('on')} data-testid="lesson-own">
              Try them now
            </button>
          </Note>
        ) : lessonHasOwn(lesson.id) ? (
          <p class="small muted" style={{ marginBottom: '14px' }}>No moments from your games match this lesson yet. As you import and review more games, the ones that do will show up here.</p>
        ) : null}
        <div class="btn-row" style={{ marginTop: '16px' }}>
          {theme ? (
            <button type="button" class="btn primary big" onClick={() => go('tactics', { mode: 'theme', theme, label: THEME_BY_ID[theme].label })}>
              Practise {THEME_BY_ID[theme].label.toLowerCase()} puzzles <Icon name="arrow" />
            </button>
          ) : null}
          {drillId ? (
            <button type="button" class={`btn big${theme ? '' : ' primary'}`} onClick={() => go('learn', { drill: drillId })}>
              Try the drill: {drillById(drillId).title}
            </button>
          ) : null}
          {nextLesson ? (
            <button type="button" class="btn big" onClick={() => go('learn', { lesson: nextLesson.id })}>
              Next lesson: {nextLesson.title}
            </button>
          ) : null}
          <button type="button" class="btn big ghost" onClick={() => { setOwnStage(null); setIdx(0); }}>
            Go through it again
          </button>
          <button type="button" class="btn big ghost" onClick={() => go('learn')}>
            All lessons
          </button>
        </div>
      </div>
    );
  }

  const mover = turnOf(step.fen);
  const orientation = step.orientation || cgColor(mover);
  const shapes = showMove && step.accept ? (() => {
    const c = new Chess(step.fen);
    const m = c.move(step.accept[0]);
    return [{ orig: m.from, dest: m.to, brush: 'turq' }];
  })() : [];

  const panel = (
    <div class="stack" data-testid="lesson-panel">
      <div class="row" style={{ gap: '6px' }} aria-label={`Step ${idx + 1} of ${lesson.steps.length}`}>
        {lesson.steps.map((_, i) => (
          <span key={i} aria-hidden="true" style={{ flex: 1, height: '6px', borderRadius: '3px', background: i < idx ? 'var(--amber)' : i === idx ? 'var(--turq)' : 'var(--bg-4)' }} />
        ))}
      </div>
      <p style={{ fontSize: '15.5px', lineHeight: 1.6 }}>{step.text}</p>
      {step.accept && state !== 'right' ? (
        <div class="row between">
          <span class="turn-pill">
            <i />
            Your move · {sideName(mover)}
          </span>
        </div>
      ) : null}
      {state === 'wrong' && msg ? (
        <Note kind="bad" title="Not quite" pop key={tries}>
          <p>{msg}</p>
        </Note>
      ) : null}
      {hintOn && state !== 'right' && !(state === 'wrong' && msg && msg.includes(step.hint)) ? (
        <Note kind="warn" title="Hint">
          <p>{step.hint}</p>
        </Note>
      ) : null}
      {state === 'right' ? (
        <Note kind="good" title="Exactly" pop>
          <p>{step.success}</p>
        </Note>
      ) : null}
      <div class="btn-row">
        {state === 'right' || state === 'info' ? (
          <button type="button" class="btn primary" onClick={next} data-testid="lesson-next" autoFocus>
            {idx + 1 < lesson.steps.length ? 'Continue' : 'Finish lesson'} <Icon name="arrow" />
          </button>
        ) : (
          <>
            <button type="button" class="btn" onClick={() => setHintOn(true)} disabled={hintOn}>
              <Icon name="hint" /> Hint
            </button>
            {tries >= 1 ? (
              <button type="button" class="btn" onClick={() => setShowMove(true)} disabled={showMove}>
                <Icon name="eye" /> Show me
              </button>
            ) : null}
          </>
        )}
        {idx > 0 ? (
          <button type="button" class="btn ghost" onClick={() => setIdx(idx - 1)}>
            Back
          </button>
        ) : null}
        <button type="button" class="btn ghost" onClick={() => go('learn')}>
          All lessons
        </button>
      </div>
    </div>
  );

  return (
    <Workspace
      eyebrow={`Lesson · ${idx + 1} of ${lesson.steps.length}`}
      title={lesson.title}
      strips={0}
      board={
        <Board
          fen={fen}
          orientation={orientation}
          interactive={!!step.accept && (state === 'task' || state === 'wrong')}
          movableColor={mover}
          lastMove={lastMove}
          shapes={shapes}
          onMove={onMove}
          viewOnly={!step.accept}
          coords={settings.coords}
          autoQueen={settings.autoQueen}
          rev={rev}
          flash={flash}
          label="Lesson board"
        />
      }
      sections={[{ id: 'lesson', label: 'Lesson', heading: false, content: panel }]}
    />
  );
}

// ---- drill -------------------------------------------------------------------------------
function DrillRunner({ drill }) {
  const settings = useStore((s) => s.settings);
  const status = useEngineStatus();
  const user = turnOf(drill.fen);
  const [moves, setMoves] = useState([]); // SAN
  const [result, setResult] = useState(null); // { ok, text }
  const [thinking, setThinking] = useState(false);
  const [hint, setHint] = useState(null);
  const [orientation, setOrientation] = useState(drill.orientation || cgColor(user));
  const [rev, setRev] = useState(0);
  const [round, setRound] = useState(0);
  const [promotedAt, setPromotedAt] = useState(null);
  const [takebacks, setTakebacks] = useState(0);
  const [adv, setAdv] = useState(null); // convert drills: my advantage after my last move, from the engine

  const game = useMemo(() => {
    const c = new Chess(drill.fen);
    const plies = [];
    for (const san of moves) {
      const m = c.move(san);
      plies.push({ san: m.san, from: m.from, to: m.to, color: m.color });
    }
    return { chess: c, plies };
  }, [moves.length, round]);
  const c = game.chess;
  const fen = c.fen();
  const userMoves = Math.ceil(moves.length / 2);
  const myTurn = !result && c.turn() === user;
  const last = game.plies[game.plies.length - 1];

  const queensFor = (ch, color) => ch.findPiece({ type: 'q', color }).length;

  const settled = useRef(false);
  const settle = (ok, text) => {
    if (settled.current) return;
    settled.current = true;
    setResult({ ok, text });
    update((s) => {
      const d = s.drillStats[drill.id] || { attempts: 0, wins: 0, best: null };
      d.attempts += 1;
      if (ok) {
        d.wins += 1;
        d.best = d.best == null ? userMoves : Math.min(d.best, userMoves);
      }
      d.last = Date.now();
      s.drillStats[drill.id] = d;
    });
    logActivity('drill', `${ok ? 'Completed' : 'Missed'} the drill “${drill.title}”`, drill.id);
  };

  // Judge the position after every move.
  useEffect(() => {
    if (result || !moves.length) return;
    const end = describeEnd(c);
    const n = Math.ceil(moves.length / 2);
    if (drill.goal === 'mate') {
      if (c.isCheckmate()) return settle(c.turn() !== user, c.turn() !== user ? `Checkmate in ${n} moves.` : 'You were mated.');
      if (end.over) return settle(false, `The game ended in a draw by ${end.reason}. ${end.reason === 'stalemate' ? 'Before each move, make sure the king still has a square.' : ''}`);
      if (c.turn() === user && n >= drill.limit) return settle(false, `${drill.limit} moves without mate. Try to shrink the box faster.`);
    } else if (drill.goal === 'promote') {
      if (c.isCheckmate() && c.turn() !== user) return settle(true, `Checkmate in ${n} moves.`);
      if (end.over) return settle(false, `Draw by ${end.reason}.`);
      if (promotedAt != null && c.turn() === user) {
        // Black has replied to the promotion: is the new queen still on the board?
        if (queensFor(c, user)) return settle(true, `Promoted and kept the queen — ${promotedAt} moves.`);
        return settle(false, 'The new queen was captured straight away.');
      }
      if (c.turn() === user && n >= drill.limit) return settle(false, `${drill.limit} moves without promoting.`);
    } else if (drill.goal === 'convert') {
      if (c.isCheckmate()) return settle(c.turn() !== user, c.turn() !== user ? `Checkmate — converted in ${n} moves.` : 'You were mated.');
      if (end.over) return settle(false, `The game ended in a draw by ${end.reason}. A win slipped through your fingers again — try once more.`);
      if (c.turn() === user && n >= drill.limit) return settle(false, `${drill.limit} moves without finishing it off.`);
    } else if (drill.goal === 'hold') {
      if (end.over) return settle(!c.isCheckmate(), c.isCheckmate() ? 'You were mated.' : `Draw by ${end.reason} — held.`);
      if (queensFor(c, opp(user))) return settle(false, 'White made a queen. Keep your king in front of the pawn next time.');
      if (c.turn() === user && n >= drill.limit) return settle(true, `You held for ${drill.limit} moves.`);
    }
  }, [moves.length, round]);

  // Engine reply.
  useEffect(() => {
    if (result || c.turn() === user || c.isGameOver()) return undefined;
    const ac = new AbortController();
    setThinking(true);
    const t0 = performance.now();
    engines.opponent
      .analyse(fen, { depth: 16, movetime: 900, signal: ac.signal })
      .then(async (r) => {
        if (ac.signal.aborted || !r.best) return;
        if (drill.goal === 'convert' && r.lines[0]) {
          const l = r.lines[0]; // engine's point of view
          const mine = l.mate != null ? (l.mate > 0 ? -10000 : 10000) : -(l.cp || 0);
          setAdv(mine);
          const n = Math.ceil(moves.length / 2);
          if (mine >= CONVERTED_CP) {
            settle(true, `Converted in ${n} move${n === 1 ? '' : 's'}: you now have ${fmtAdv(mine)}. That’s a win.`);
            return;
          }
          if (mine < LOST_CP) {
            const last = moves[moves.length - 1];
            settle(false, `After ${last} the advantage is gone (${mine >= 0 ? '+' : ''}${(mine / 100).toFixed(1)}). Take it back or restart and find a safer way.`);
            return;
          }
        }
        const wait = 350 - (performance.now() - t0);
        if (wait > 0) await new Promise((res) => setTimeout(res, wait));
        if (ac.signal.aborted) return;
        const d = new Chess(fen);
        const m = playUci(d, r.best);
        if (m) setMoves((ms) => [...ms, m.san]);
      })
      .catch(() => {})
      .finally(() => !ac.signal.aborted && setThinking(false));
    return () => {
      ac.abort();
      setThinking(false);
    };
  }, [moves.length, round, !!result]);

  const onMove = (move) => {
    if (!myTurn) {
      setRev((n) => n + 1);
      return;
    }
    const d = new Chess(fen);
    const m = playUci(d, move.from + move.to + (move.promotion || ''));
    if (!m) {
      setRev((n) => n + 1);
      return;
    }
    setHint(null);
    if (m.promotion === 'q' && drill.goal === 'promote' && promotedAt == null) setPromotedAt(Math.ceil((moves.length + 1) / 2));
    setMoves((ms) => [...ms, m.san]);
  };

  const askHint = async () => {
    const r = await engines.analyst.analyse(fen, { depth: 14 }).catch(() => null);
    if (r && r.best) setHint(r.best);
  };
  const restart = () => {
    settled.current = false;
    setAdv(null);
    setMoves([]);
    setResult(null);
    setHint(null);
    setPromotedAt(null);
    setTakebacks(0);
    setRound((n) => n + 1);
  };
  const takeBack = () => {
    const n = c.turn() === user ? 2 : 1;
    setMoves((ms) => ms.slice(0, Math.max(0, ms.length - n)));
    setTakebacks((t) => t + 1);
    setPromotedAt(null);
    setHint(null);
  };

  const stats = useStore((s) => s.drillStats[drill.id]);
  const panel = (
    <div class="stack" data-testid="drill-panel">
      <EngineGate status={status} />
      <div class="row between">
        <span class={`turn-pill${thinking ? ' thinking' : ''}`} aria-live="polite">
          <i />
          {result ? (result.ok ? 'Drill complete' : 'Drill over') : thinking ? 'Engine is thinking…' : `Your move · ${sideName(user)}`}
        </span>
        <span class="small muted mono">
          {drill.goal === 'convert' && adv != null ? `${adv >= 9000 ? 'mate' : `${adv >= 0 ? '+' : ''}${(adv / 100).toFixed(1)}`} · ` : ''}move {userMoves} / {drill.limit}
        </span>
      </div>
      <p class="muted" style={{ margin: 0 }}>
        <strong style={{ color: 'var(--ink)' }}>{GOAL_TEXT[drill.goal]}.</strong> {drill.blurb}
      </p>
      {result ? (
        <Note kind={result.ok ? 'good' : 'bad'} title={result.ok ? 'Done' : 'Not this time'} pop>
          <p>
            {result.text}
            {result.ok && takebacks ? ` (${takebacks} takeback${takebacks === 1 ? '' : 's'})` : ''}
          </p>
        </Note>
      ) : null}
      {hint && !result ? (
        <Note kind="warn" title="Engine suggestion">
          <p>{(() => { const m = playUci(new Chess(fen), hint); return m ? `Try ${m.san}.` : ''; })()}</p>
        </Note>
      ) : null}
      <div class="btn-row">
        {result ? (
          <>
            <button type="button" class="btn primary" onClick={restart} data-testid="drill-restart" autoFocus>
              <Icon name="retry" /> Go again
            </button>
            {!result.ok && moves.length ? (
              <button type="button" class="btn" onClick={() => { settled.current = false; setResult(null); setAdv(null); takeBack(); }}>
                <Icon name="undo" /> Take back and continue
              </button>
            ) : null}
          </>
        ) : (
          <>
            <button type="button" class="btn" onClick={askHint} disabled={!myTurn}>
              <Icon name="hint" /> Hint
            </button>
            <button type="button" class="btn" onClick={takeBack} disabled={moves.length < 1 || thinking}>
              <Icon name="undo" /> Take back
            </button>
            <button type="button" class="btn" onClick={restart}>
              <Icon name="retry" /> Restart
            </button>
          </>
        )}
        <button type="button" class="btn" onClick={() => setOrientation((o) => (o === 'white' ? 'black' : 'white'))} aria-label="Flip board">
          <Icon name="flip" /> Flip
        </button>
      </div>
      <div class="stack tight">
        <div class="eyebrow">Technique</div>
        <ul style={{ margin: 0, paddingLeft: '18px', color: 'var(--ink-2)' }}>
          {drill.tips.map((t) => (
            <li key={t} class="small" style={{ marginBottom: '4px' }}>{t}</li>
          ))}
        </ul>
      </div>
      {stats?.attempts ? (
        <p class="small muted">
          Your record: {stats.wins} of {stats.attempts}
          {stats.best != null ? ` · best ${stats.best} moves` : ''}
        </p>
      ) : null}
      {drill.source?.gameId ? (
        <button type="button" class="btn ghost" onClick={() => go('review', { id: drill.source.gameId, ply: drill.source.ply })}>
          See this moment in the game
        </button>
      ) : null}
      <button type="button" class="btn ghost" onClick={() => go('learn')}>
        All drills
      </button>
    </div>
  );

  return (
    <Workspace
      eyebrow={`Drill · ${drill.level}`}
      title={drill.title}
      strips={0}
      board={
        <Board
          fen={fen}
          orientation={orientation}
          interactive={myTurn}
          movableColor={user}
          lastMove={last ? [last.from, last.to] : null}
          shapes={hint ? [{ orig: hint.slice(0, 2), dest: hint.slice(2, 4), brush: 'turq' }] : []}
          onMove={onMove}
          coords={settings.coords}
          autoQueen={settings.autoQueen}
          rev={rev}
          label="Drill board"
        />
      }
      sections={[
        { id: 'drill', label: 'Drill', heading: false, content: panel },
        {
          id: 'moves',
          label: 'Moves',
          content: (
            <div style={{ maxHeight: '30dvh', overflow: 'hidden', display: 'flex' }}>
              <MoveList plies={game.plies} current={game.plies.length} startFen={drill.fen} />
            </div>
          ),
        },
      ]}
    />
  );
}

export function Learn({ params }) {
  if (params?.academy) return <AcademyIndex />;
  if (params?.topic) return <AcademyTopic id={params.topic} />;
  if (params?.lesson && lessonById(params.lesson)) return <LessonPlayer key={`${params.lesson}:${params.own ? 1 : 0}`} lesson={lessonById(params.lesson)} startOwn={!!params.own} />;
  if (params?.calc) return <CalcTrainer />;
  if (params?.drill && drillById(params.drill)) return <DrillRunner drill={drillById(params.drill)} />;
  if (params?.convert) {
    const p = wonPositions(listGames()).find((x) => x.id === params.convert);
    if (p) return <DrillRunner drill={convertDrill(p)} />;
  }
  return <Overview />;
}
