// Learn: the path (roadmap + "do this next") and the "from your games" stage
// that a lesson ends with.
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { Chess } from 'chess.js';
import { Board } from '../components/Board.jsx';
import { Icon } from '../components/Icon.jsx';
import { Workspace, Note } from '../components/ui.jsx';
import { useStore, update, logActivity, listGames, gamesVersion } from '../lib/store.js';
import { playUci, sideName, cgColor, opp, PIECE_NAME } from '../lib/chessx.js';
import { judgeAttempt } from '../lib/analysis.js';
import { pathState, nextStep, stepRoute, lessonPositions, STAGES } from '../lib/path.js';
import { lessonById } from '../data/lessons.js';
import { go } from '../lib/router.js';

const KIND_LABEL = { lesson: 'Lesson', academy: 'Academy topic', drill: 'Endgame drill', convert: 'Your game' };
const stepName = (s) => s.title;

const useGames = () => {
  const order = useStore((s) => s.gameOrder);
  return useMemo(() => listGames(), [order.join(','), gamesVersion()]);
};

// ---- the path ----------------------------------------------------------------------------
export function PathSection() {
  const state = useStore((s) => s);
  const games = useGames();
  const stages = useMemo(() => pathState(state), [state.lessonProgress, state.academy, state.drillStats, state.convertStats, state.pathUnlocked]);
  const next = useMemo(() => nextStep(state, games), [stages, games]);
  const total = stages.reduce((n, s) => n + s.steps.length, 0);
  const done = stages.reduce((n, s) => n + s.done, 0);
  const ownCounts = useMemo(() => {
    const out = {};
    for (const st of stages) for (const s of st.steps) if (s.kind === 'lesson' && s.done) out[s.id] = lessonPositions(games, s.id, 3).filter((p) => !(state.ownPositions || {})[p.id]?.ok).length;
    return out;
  }, [stages, games, state.ownPositions]);
  const ownCount = (s) => ownCounts[s.id] || 0;
  const open = (s) => {
    const [route, params] = stepRoute(s, games);
    go(route, params);
  };
  const skip = (id) =>
    update((s) => {
      s.pathUnlocked = { ...(s.pathUnlocked || {}), [id]: true };
    });

  return (
    <section style={{ marginBottom: '34px' }} aria-labelledby="h-path" data-testid="path">
      <div class="row between wrap" style={{ marginBottom: '12px', gap: '8px' }}>
        <h2 id="h-path">Your path</h2>
        <span class="small muted">
          {done} of {total} steps done
        </span>
      </div>
      {next ? (
        <div class="path-next" data-testid="path-next">
          <div class="stack" style={{ gap: '8px' }}>
            <div class="row wrap" style={{ gap: '8px' }}>
              <span class="chip turq">Do this next</span>
              <span class="chip">{KIND_LABEL[next.kind]}</span>
              {next.weakCount ? <span class="chip coral">From your games</span> : null}
            </div>
            <h3>{stepName(next)}</h3>
            <p>{next.why}</p>
            <div class="small muted">
              Stage {STAGES.findIndex((s) => s.id === next.stage.id) + 1}: {next.stage.title}
            </div>
          </div>
          <button type="button" class="btn primary big" onClick={() => open(next)} data-testid="path-start">
            Start <Icon name="arrow" />
          </button>
        </div>
      ) : (
        <Note kind="good" title="Path complete">
          <p>Every step is done. Keep the habits sharp with rated puzzles and the calculation trainer, and finish the positions from your games below.</p>
        </Note>
      )}
      <ol class="path-stages">
        {stages.map((st, i) => (
          <li key={st.id} class={`path-stage${st.open ? '' : ' locked'}${st.complete ? ' complete' : ''}`} data-testid={`stage-${st.id}`}>
            <div class="path-stage-head">
              <span class="path-num" aria-hidden="true">
                {st.complete ? <Icon name="check" size={16} /> : i + 1}
              </span>
              <div style={{ minWidth: 0 }}>
                <h3>
                  {st.title}
                  <span class="sr-only">
                    {st.open ? '' : ' (locked)'} — {st.done} of {st.steps.length} done
                  </span>
                </h3>
                <p class="small muted">{st.blurb}</p>
              </div>
              <span class="small muted mono" aria-hidden="true">
                {st.done}/{st.steps.length}
              </span>
            </div>
            <div class="path-steps" hidden={!st.open}>
              {st.steps.map((s) => {
                const isNext = next && next.key === s.key;
                const own = st.open ? ownCount(s) : 0;
                return (
                  <button
                    key={s.key}
                    type="button"
                    class={`path-step${s.done ? ' done' : ''}${isNext ? ' next' : ''}`}
                    disabled={!st.open}
                    onClick={() => open(s)}
                    data-testid={`step-${s.id}`}
                  >
                    <span class="path-dot" aria-hidden="true">
                      {s.done ? <Icon name="check" size={13} /> : null}
                    </span>
                    <span class="path-step-text">
                      <span class="t">{stepName(s)}</span>
                      <span class="k">
                        {KIND_LABEL[s.kind]}
                        {s.done ? ' · done' : isNext ? ' · next' : ''}
                      </span>
                    </span>
                    {own ? (
                      <span
                        class="chip amber"
                        role="link"
                        tabIndex={0}
                        title="Positions from your own games for this lesson"
                        onClick={(e) => {
                          e.stopPropagation();
                          go('learn', { lesson: s.id, own: 1 });
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            e.stopPropagation();
                            go('learn', { lesson: s.id, own: 1 });
                          }
                        }}
                      >
                        {own} from your games
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
            {!st.open ? (
              <div class="row between wrap path-lock">
                <span class="small muted">
                  {st.steps.map((s) => s.title).join(' · ')}. Unlocks when you’ve done half of the stage before.
                </span>
                <button type="button" class="btn sm ghost" onClick={() => skip(st.id)} data-testid={`skip-${st.id}`}>
                  Skip ahead
                </button>
              </div>
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
}

// ---- "from your games" ----------------------------------------------------------------------
const THEME_WORD = {
  'loose-pieces': 'free material',
  'knight-forks': 'a fork',
  pins: 'a pin',
  'back-rank': 'a back-rank mate',
  opposition: 'the right king move',
  'rook-mate': 'the mate',
  'opening-principles': 'a better developing move',
};
const LESSON_HINT = {
  'loose-pieces': 'Look at every enemy piece and ask who defends it.',
  'knight-forks': 'Find a square where one of your pieces hits two targets at once.',
  pins: 'Look for an enemy piece standing in front of something more valuable on a line.',
  'back-rank': 'Is their king stuck behind its own pawns with no way out?',
  'rook-mate': 'Push their king to the edge and look for the check it can’t escape.',
};
const fmtDay = (t) => new Date(Math.floor(t)).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

function taskText(p, lessonId) {
  const where = `${p.label}, move ${p.moveNo} (${fmtDay(p.created)}).`;
  if (p.kind === 'missed') return `${where} You played ${p.played}, but ${THEME_WORD[lessonId] || 'something much better'} was there. Find it.`;
  if (p.kind === 'allowed') return `${where} You played ${p.played} and ${(p.tagLabel || 'it cost you').toLowerCase()}. Find a move that doesn’t allow it.`;
  return `${where} You played ${p.played} here and it cost you. Use what this lesson just showed you and find a better move.`;
}

/** The positions from my games a lesson ends with. `positions` comes from lessonPositions. */
export function OwnPositions({ lesson, positions, onDone }) {
  const settings = useStore((s) => s.settings);
  const ownState = useStore((s) => s.ownPositions);
  const [i, setI] = useState(0);
  const [phase, setPhase] = useState('ask'); // ask | checking | right | wrong
  const [hint, setHint] = useState(0);
  const [show, setShow] = useState(false);
  const [tryFen, setTryFen] = useState(null);
  const [tryMove, setTryMove] = useState(null);
  const [verdict, setVerdict] = useState(null);
  const [results, setResults] = useState([]);
  const [flash, setFlash] = useState(null);
  const [rev, setRev] = useState(0);
  const ac = useRef(null);
  const p = positions[i];

  useEffect(() => {
    setPhase('ask');
    setHint(0);
    setShow(false);
    setTryFen(null);
    setTryMove(null);
    setVerdict(null);
    return () => ac.current && ac.current.abort();
  }, [i]);

  if (!p) return null;
  const record = (ok) =>
    update((s) => {
      const o = s.ownPositions[p.id] || { tries: 0 };
      s.ownPositions[p.id] = { ok: o.ok || ok, tries: (o.tries || 0) + 1, at: Date.now() };
    });

  const onMove = async (move) => {
    if (phase !== 'ask' && phase !== 'wrong') return;
    const uci = move.from + move.to + (move.promotion || '');
    const c = new Chess(p.fen);
    const m = playUci(c, uci);
    if (!m) {
      setRev((n) => n + 1);
      return;
    }
    setTryFen(c.fen());
    setTryMove([m.from, m.to]);
    if (uci === p.playedUci) {
      setVerdict({ ok: false, same: true, san: m.san });
      setPhase('wrong');
      setFlash({ kind: 'bad', key: Date.now() });
      record(false);
      return;
    }
    setPhase('checking');
    ac.current = new AbortController();
    const v = await judgeAttempt(p.fen, uci, p.ref, { depth: 12, signal: ac.current.signal }).catch(() => null);
    const ok = v ? v.ok : uci === p.ref.best;
    setVerdict({ ok, san: m.san, unknown: !v && !ok });
    setPhase(ok ? 'right' : 'wrong');
    setFlash({ kind: ok ? 'good' : 'bad', key: Date.now() });
    record(ok);
  };

  const retry = () => {
    setTryFen(null);
    setTryMove(null);
    setPhase('ask');
    setRev((n) => n + 1);
  };
  const advance = () => {
    const res = [...results, phase === 'right'];
    setResults(res);
    if (i + 1 < positions.length) setI(i + 1);
    else {
      const found = res.filter(Boolean).length;
      logActivity('lesson', `Found ${found} of ${positions.length} from your games — “${lesson.title}”`, lesson.id);
      onDone(found, positions.length);
    }
  };

  const best = (() => {
    const c = new Chess(p.fen);
    return playUci(c, p.ref.best);
  })();
  const mover = p.userColor;
  const shapes = [];
  if (hint >= 2 && best && phase !== 'right') shapes.push({ orig: best.from, brush: 'turq' });
  if ((show || phase === 'right') && best) shapes.push({ orig: best.from, dest: best.to, brush: 'turq' });
  const hintText =
    p.kind === 'missed'
      ? `Checks, captures, threats — in that order. ${LESSON_HINT[lesson.id] || ''}`.trim()
      : p.kind === 'allowed'
        ? `Before moving, ask what ${sideName(opp(mover))}’s most forcing reply would be to each candidate. ${p.played} allowed one.`
        : 'Go back to the idea of the lesson: which move follows it here?';

  const panel = (
    <div class="stack" data-testid="own-panel">
      <div class="row" style={{ gap: '6px' }} aria-label={`Position ${i + 1} of ${positions.length} from your games`}>
        {positions.map((_, k) => (
          <span key={k} aria-hidden="true" style={{ flex: 1, height: '6px', borderRadius: '3px', background: k < i ? (results[k] ? 'var(--turq)' : 'var(--coral)') : k === i ? 'var(--amber)' : 'var(--bg-4)' }} />
        ))}
      </div>
      <span class="chip amber" style={{ alignSelf: 'start' }}>
        From your games · {i + 1} of {positions.length}
      </span>
      <p style={{ fontSize: '15.5px', lineHeight: 1.6 }} data-testid="own-task">
        {taskText(p, lesson.id)}
      </p>
      {phase === 'ask' || phase === 'wrong' ? (
        <span class="turn-pill">
          <i />
          Your move · {sideName(mover)}
        </span>
      ) : null}
      {phase === 'checking' ? <p class="small muted">Checking your move with the engine…</p> : null}
      {phase === 'wrong' && verdict ? (
        <Note kind="bad" title={verdict.same ? 'That’s the game move' : 'Not quite'} pop key={verdict.san + rev}>
          <p>{verdict.same ? `${verdict.san} is what you played in the game — the move this position is about. Look again.` : verdict.unknown ? `${verdict.san} isn’t the move the engine wanted, and it couldn’t check how close it is.` : `${verdict.san} doesn’t solve it — it gives back a lot of what was there.`}</p>
        </Note>
      ) : null}
      {hint >= 1 && phase !== 'right' ? (
        <Note kind="warn" title="Hint">
          <p>{hintText}</p>
          {hint >= 2 && best ? <p>The move starts with your {PIECE_NAME[best.piece]} on {best.from}.</p> : null}
        </Note>
      ) : null}
      {phase === 'right' ? (
        <Note kind="good" title={verdict && best && verdict.san === best.san ? 'Found it' : 'That works'} pop>
          <p>
            {verdict && best && verdict.san !== best.san ? `${verdict.san} is as good as the engine’s ${best.san}. ` : ''}
            {p.text}
          </p>
        </Note>
      ) : null}
      {show && phase !== 'right' && best ? (
        <Note kind="info" title={`The move was ${best.san}`}>
          <p>{p.text}</p>
        </Note>
      ) : null}
      <div class="btn-row">
        {phase === 'right' || show ? (
          <button type="button" class="btn primary" onClick={advance} data-testid="own-next" autoFocus>
            {i + 1 < positions.length ? 'Next position' : 'Finish'} <Icon name="arrow" />
          </button>
        ) : (
          <>
            {phase === 'wrong' ? (
              <button type="button" class="btn primary" onClick={retry} data-testid="own-retry">
                <Icon name="retry" /> Try again
              </button>
            ) : null}
            <button type="button" class="btn" onClick={() => setHint(Math.min(2, hint + 1))} disabled={hint >= 2 || phase === 'checking'} data-testid="own-hint">
              <Icon name="hint" /> {hint ? 'Bigger hint' : 'Hint'}
            </button>
            <button type="button" class="btn ghost" onClick={() => { setShow(true); record(false); }} disabled={phase === 'checking'} data-testid="own-show">
              <Icon name="eye" /> Show me
            </button>
          </>
        )}
        <button type="button" class="btn ghost" onClick={() => go('review', { id: p.gameId, ply: p.ply + 1 })}>
          Open the game
        </button>
      </div>
      {ownState[p.id]?.ok && phase === 'ask' ? <p class="small muted">You’ve solved this one before.</p> : null}
    </div>
  );

  return (
    <Workspace
      eyebrow={`${lesson.title} · from your games`}
      title="Now in your own games"
      board={
        <Board
          fen={tryFen || p.fen}
          orientation={cgColor(mover)}
          interactive={phase === 'ask'}
          movableColor={mover}
          lastMove={tryMove}
          shapes={shapes}
          onMove={onMove}
          coords={settings.coords}
          autoQueen={settings.autoQueen}
          rev={rev}
          flash={flash}
          label="Position from your game"
        />
      }
      sections={[{ id: 'own', label: 'Your game', heading: false, content: panel }]}
    />
  );
}

export { lessonById };
