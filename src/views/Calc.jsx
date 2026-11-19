// Calculation trainer: the board stays still while you read a line, then you
// answer questions about where everything ended up.
import { useEffect, useRef, useState } from 'preact/hooks';
import { Board } from '../components/Board.jsx';
import { Icon } from '../components/Icon.jsx';
import { Workspace, Note } from '../components/ui.jsx';
import { useStore, update, logActivity, listGames } from '../lib/store.js';
import { loadLibrary, onLibrary, libraryReady } from '../lib/puzzles.js';
import { pickLine, buildQuestions, scoreRound, MAX_LEVEL } from '../lib/calc.js';
import { sanLine, turnOf, cgColor, sideName } from '../lib/chessx.js';
import { go } from '../lib/router.js';

const reduced = () => typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

export function CalcCard() {
  const calc = useStore((s) => s.calc || { level: 1, best: 1, rounds: 0 });
  return (
    <button type="button" class="card" onClick={() => go('learn', { calc: 1 })} data-testid="open-calc">
      <span class="chip amber" style={{ alignSelf: 'start' }}>
        {calc.rounds ? `Depth ${calc.level} · best ${calc.best}` : 'New'}
      </span>
      <h3>Calculation trainer</h3>
      <p>Read a line of moves while the board stays still, then say where the pieces ended up. The skill behind every puzzle that’s more than one move deep.</p>
      <div class="foot">
        <span>{calc.rounds ? `${calc.perfect} of ${calc.rounds} lines perfect` : 'Starts at one move, grows as you do'}</span>
        <Icon name="arrow" />
      </div>
    </button>
  );
}

function newRound(level, rating, avoid) {
  const line = pickLine(level, { rating, games: listGames(), avoid });
  if (!line) return null;
  const built = buildQuestions(line.fen, line.ucis);
  return { ...line, ...built, tokens: sanLine(line.fen, line.ucis), answers: [], q: 0, phase: 'read' };
}

export function CalcTrainer() {
  const settings = useStore((s) => s.settings);
  const calc = useStore((s) => s.calc || { level: 1, best: 1, rounds: 0, perfect: 0 });
  const rating = useStore((s) => (s.puzzleRating ? s.puzzleRating.r : 1000));
  const [ready, setReady] = useState(libraryReady);
  const [round, setRound] = useState(null);
  const [session, setSession] = useState({ rounds: 0, perfect: 0 });
  const [change, setChange] = useState(0);
  const [showPly, setShowPly] = useState(null); // index into tokens while replaying / peeking
  const [peeked, setPeeked] = useState(false);
  const [flash, setFlash] = useState(null);
  const seen = useRef(new Set());
  const timer = useRef(null);

  useEffect(() => {
    if (libraryReady) return;
    const off = onLibrary(() => setReady(true));
    loadLibrary().catch(() => setReady(true));
    return off;
  }, []);
  useEffect(() => () => clearInterval(timer.current), []);

  const start = (level = calc.level) => {
    clearInterval(timer.current);
    const r = newRound(level, rating, seen.current);
    if (r) seen.current.add(r.id);
    setRound(r);
    setShowPly(null);
    setPeeked(false);
    setChange(0);
  };
  useEffect(() => {
    if (ready && !round) start();
  }, [ready]);

  // Play the line on the board, one move at a time.
  const play = (then) => {
    clearInterval(timer.current);
    const n = round.tokens.length;
    if (reduced()) {
      setShowPly(n - 1);
      if (then) then();
      return;
    }
    let i = 0;
    setShowPly(0);
    timer.current = setInterval(() => {
      i++;
      if (i >= n) {
        clearInterval(timer.current);
        if (then) then();
        return;
      }
      setShowPly(i);
    }, 650);
  };

  const peek = () => {
    setPeeked(true);
    play(() => {
      timer.current = setTimeout(() => setShowPly(null), 1400);
    });
  };

  const answer = (value) => {
    const q = round.questions[round.q];
    const ok = value === q.answer;
    const answers = [...round.answers, { value, ok }];
    setFlash({ kind: ok ? 'good' : 'bad', key: Date.now() });
    if (round.q + 1 < round.questions.length) {
      setRound({ ...round, answers, q: round.q + 1 });
      return;
    }
    const perfect = answers.every((a) => a.ok) && !peeked;
    let ch = 0;
    update((s) => {
      const res = scoreRound(s.calc, perfect);
      s.calc = res.calc;
      ch = res.change;
    });
    setChange(ch);
    setSession((x) => ({ rounds: x.rounds + 1, perfect: x.perfect + (perfect ? 1 : 0) }));
    if (session.rounds === 0) logActivity('calc', 'Calculation trainer', 'calc');
    setRound({ ...round, answers, phase: 'done', perfect });
    play();
  };

  if (!ready || !round) {
    return (
      <div class="page">
        <div class="page-head">
          <div>
            <div class="eyebrow">Calculation trainer</div>
            <h1 style={{ marginTop: '10px' }}>{ready ? 'No lines to read yet' : 'Loading lines…'}</h1>
            {ready ? <p>The puzzle set didn’t load and there are no imported games to take lines from. Reload the page, or import a few games in Review.</p> : <p>Fetching puzzle lines.</p>}
          </div>
        </div>
      </div>
    );
  }

  const q = round.questions[round.q];
  const done = round.phase === 'done';
  const asking = round.phase === 'ask';
  const mover = turnOf(round.fen);
  const boardFen = showPly !== null ? round.tokens[showPly].fen : round.fen;
  const lastMove = showPly !== null ? [round.tokens[showPly].uci.slice(0, 2), round.tokens[showPly].uci.slice(2, 4)] : round.lead;
  const shapes = [];
  if (done && showPly === round.tokens.length - 1) {
    round.questions.forEach((qq, k) => {
      if (qq.kind !== 'where') return;
      shapes.push({ orig: qq.answer, brush: 'turq' });
      const a = round.answers[k];
      if (a && !a.ok && a.value) shapes.push({ orig: a.value, brush: 'coral' });
    });
  }

  const lineView = (
    <div class="calc-line" aria-label="The line to read" data-testid="calc-line">
      {round.tokens.map((t, k) => (
        <span key={k} class={`calc-move${showPly === k ? ' on' : ''}`}>
          {t.label ? <span class="n">{t.label}</span> : null}
          {t.san.replace(/[+#]/g, '')}
        </span>
      ))}
    </div>
  );

  const panel = (
    <div class="stack" data-testid="calc-panel">
      <div class="row between wrap" style={{ gap: '8px' }}>
        <span class="chip turq" data-testid="calc-level">
          Depth {calc.level} of {MAX_LEVEL}
        </span>
        <span class="small muted">
          {round.label} · best depth {calc.best}
        </span>
      </div>
      {round.phase === 'read' ? (
        <>
          <p style={{ fontSize: '15.5px', lineHeight: 1.6 }}>
            {sideName(mover)} to move. {round.tokens.length === 1 ? 'Read this move and picture the board after it.' : `Read these ${round.tokens.length} moves — both sides’ — and picture the board after each one.`} The pieces on the board won’t move, and check signs are left out: you have to see those yourself.
          </p>
          {lineView}
          <div class="btn-row">
            <button type="button" class="btn primary" onClick={() => setRound({ ...round, phase: 'ask' })} data-testid="calc-ready" autoFocus>
              I can see it — ask me <Icon name="arrow" />
            </button>
          </div>
        </>
      ) : null}
      {asking ? (
        <>
          {lineView}
          <div class="calc-q" data-testid="calc-question">
            <div class="small muted">
              Question {round.q + 1} of {round.questions.length}
            </div>
            <p style={{ fontSize: '16px', fontWeight: 600 }}>{q.text}</p>
            {q.kind === 'where' ? (
              <p class="small muted">Tap the square on the board{settings.coords ? '' : ' (turning on board coordinates in Settings helps)'}.</p>
            ) : (
              <div class="calc-options">
                {q.options.map((o) => (
                  <button key={o} type="button" class="btn" onClick={() => answer(o)} data-testid="calc-option">
                    {o}
                  </button>
                ))}
              </div>
            )}
            {round.answers.length ? (
              <p class="small" style={{ color: round.answers[round.answers.length - 1].ok ? 'var(--turq)' : 'var(--coral)' }}>
                Previous answer: {round.answers[round.answers.length - 1].ok ? 'right' : 'wrong'} — the full answers come at the end.
              </p>
            ) : null}
          </div>
          <div class="btn-row">
            <button type="button" class="btn ghost" onClick={peek} disabled={showPly !== null} data-testid="calc-peek">
              <Icon name="eye" /> Peek {peeked ? '' : '(counts as a miss)'}
            </button>
          </div>
        </>
      ) : null}
      {done ? (
        <>
          {lineView}
          <Note kind={round.perfect ? 'good' : 'bad'} title={round.perfect ? 'All right' : peeked ? 'You peeked' : 'Not quite'} pop>
            <ul class="calc-results">
              {round.questions.map((qq, k) => {
                const a = round.answers[k];
                return (
                  <li key={k}>
                    <strong>{a.ok ? '✓' : '✗'}</strong> {qq.text.replace(/ Tap its square\.$/, '')} <span class="muted">Answer: {qq.answer}{a.ok ? '' : ` · you said ${a.value}`}</span>
                  </li>
                );
              })}
            </ul>
          </Note>
          {change > 0 ? <p class="small" style={{ color: 'var(--turq)' }} data-testid="calc-up">Two perfect lines in a row — up to depth {calc.level}.</p> : null}
          {change < 0 ? <p class="small" style={{ color: 'var(--amber)' }}>Back to depth {calc.level} to rebuild. That’s normal — depth comes from repetition.</p> : null}
          <div class="btn-row">
            <button type="button" class="btn primary" onClick={() => start()} data-testid="calc-next" autoFocus>
              Next line <Icon name="arrow" />
            </button>
            <button type="button" class="btn" onClick={() => play()}>
              <Icon name="retry" /> Replay the line
            </button>
          </div>
        </>
      ) : null}
      <p class="small muted">
        This session: {session.perfect} of {plural(session.rounds, 'line')} perfect. Two perfect lines in a row go one move deeper; two misses in a row go one back.
      </p>
      <div class="btn-row">
        <button type="button" class="btn ghost sm" onClick={() => go('learn')}>
          Back to Learn
        </button>
      </div>
    </div>
  );

  return (
    <Workspace
      eyebrow="Calculation trainer"
      title="See it without moving it"
      board={
        <Board
          fen={boardFen}
          orientation={cgColor(mover)}
          lastMove={lastMove}
          shapes={shapes}
          onSquare={asking && q && q.kind === 'where' && showPly === null ? (sq) => answer(sq) : undefined}
          viewOnly={false}
          coords={settings.coords}
          flash={flash}
          label="Calculation board"
        />
      }
      sections={[{ id: 'calc', label: 'Trainer', heading: false, content: panel }]}
    />
  );
}
