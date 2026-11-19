// Theme Academy: every Lichess puzzle theme explained, with real examples
// from the puzzle library to step through, and practice at your level.
import { useEffect, useMemo, useState } from 'preact/hooks';
import { Chess } from 'chess.js';
import { Board } from '../components/Board.jsx';
import { Icon } from '../components/Icon.jsx';
import { Workspace, Note } from '../components/ui.jsx';
import { useStore, update } from '../lib/store.js';
import { playUci, sideName, cgColor, turnOf, sanLine } from '../lib/chessx.js';
import { getPuzzle, examplesFor, tagCount, themeStats, loadLibrary, onLibrary, libraryReady } from '../lib/puzzles.js';
import { MOTIFS } from '../data/academy-motifs.js';
import { ADVANCED } from '../data/academy-advanced.js';
import { MATE_LENGTHS, MATE_PATTERNS } from '../data/academy-mates.js';
import { SPECIAL, PHASES, LABELS } from '../data/academy-other.js';
import { go } from '../lib/router.js';

export const SECTIONS = [
  { id: 'motifs', title: 'Motifs', blurb: 'The core tactical ideas. Start here.', topics: MOTIFS },
  { id: 'advanced', title: 'Advanced', blurb: 'Subtler ideas that make the motifs work.', topics: ADVANCED },
  { id: 'mates', title: 'Mates', blurb: 'Forced checkmates by length.', topics: MATE_LENGTHS },
  { id: 'patterns', title: 'Mate patterns', blurb: 'Named mating pictures worth knowing by sight.', topics: MATE_PATTERNS },
  { id: 'special', title: 'Special moves', blurb: 'Promotion, castling and en passant as tactical weapons.', topics: SPECIAL },
  { id: 'phases', title: 'Phases', blurb: 'What changes in the opening, middlegame and each kind of endgame.', topics: PHASES },
];
export const ALL_TOPICS = SECTIONS.flatMap((s) => s.topics.map((t) => ({ ...t, section: s.id })));
const byId = new Map(ALL_TOPICS.map((t) => [t.id, t]));
export const topicById = (id) => byId.get(id);

function useLibrary() {
  const [, setN] = useState(0);
  useEffect(() => {
    const off = onLibrary(() => setN((n) => n + 1));
    loadLibrary().catch(() => {});
    return off;
  }, []);
  return libraryReady;
}

// ---- index ------------------------------------------------------------------------------
export function AcademyIndex() {
  useLibrary();
  const learned = useStore((s) => s.academy || {});
  const attempts = useStore((s) => s.attempts);
  const stats = useMemo(() => themeStats(attempts), [attempts.length]);
  const done = Object.values(learned).filter((x) => x && x.learned).length;
  return (
    <div class="page" data-testid="academy-index">
      <div class="page-head">
        <div>
          <div class="eyebrow">Learn · Theme academy</div>
          <h1 style={{ marginTop: '10px' }}>
            Every puzzle theme, <em>explained</em>
          </h1>
          <p>
            All {ALL_TOPICS.length} themes Lichess uses to tag puzzles: what each one is, how to spot it, the patterns it comes in and how to defend against it. Every lesson has real examples to step through and practice at your puzzle rating.
          </p>
        </div>
      </div>
      <div class="stat-row" style={{ marginBottom: '22px' }}>
        <div class="stat">
          <div class="eyebrow">Learned</div>
          <div class="v">{done} / {ALL_TOPICS.length}</div>
          <div class="s">themes marked as learned</div>
        </div>
      </div>
      {SECTIONS.map((sec) => (
        <section key={sec.id} style={{ marginBottom: '26px' }} aria-labelledby={`acad-${sec.id}`}>
          <div class="row between wrap" style={{ gap: '8px', marginBottom: '10px' }}>
            <h2 id={`acad-${sec.id}`}>{sec.title}</h2>
            <span class="small muted">{sec.blurb}</span>
          </div>
          <div class="theme-grid">
            {sec.topics.map((t) => {
              const s = stats[t.id];
              const n = tagCount(t.id);
              const l = learned[t.id];
              return (
                <button key={t.id} type="button" class="theme-btn" onClick={() => go('learn', { topic: t.id })} data-testid={`topic-${t.id}`}>
                  <b>
                    {t.name}
                    {l && l.learned ? <span class="sr-only"> (learned)</span> : null}
                  </b>
                  <span>{t.short}</span>
                  <span class="small" style={{ color: 'var(--ink-3)' }}>
                    {n} puzzle{n === 1 ? '' : 's'}
                    {s && s.n ? ` · you: ${Math.round((s.ok / s.n) * 100)}% of ${s.n}` : ''}
                    {l && l.learned ? ' · ✓ learned' : ''}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      ))}
      <section class="panel pad" aria-labelledby="acad-labels">
        <h3 id="acad-labels" style={{ marginBottom: '10px' }}>How puzzles are labelled</h3>
        <div class="stack tight">
          {LABELS.map((l) => (
            <p key={l.title} class="small" style={{ margin: 0 }}>
              <strong>{l.title}.</strong> {l.text}
            </p>
          ))}
        </div>
      </section>
      <p class="small muted" style={{ marginTop: '14px' }}>
        Lesson text is written for Outpost. Example positions are real puzzles from the Lichess puzzle database (public domain), tagged with each theme by Lichess.
      </p>
    </div>
  );
}

// ---- one topic ----------------------------------------------------------------------------
export function AcademyTopic({ id }) {
  const ready = useLibrary();
  const topic = topicById(id);
  const settings = useStore((s) => s.settings);
  const learned = useStore((s) => (s.academy || {})[id]);
  const attempts = useStore((s) => s.attempts);
  const stat = useMemo(() => themeStats(attempts)[id], [attempts.length, id]);
  const examples = useMemo(() => (ready ? examplesFor(id, 4) : []), [ready, id]);
  const [ex, setEx] = useState(0);
  const [step, setStep] = useState(0);
  const [tab, setTab] = useState('lesson');
  const count = ready ? tagCount(id) : 0;

  useEffect(() => {
    update((s) => {
      s.academy = s.academy || {};
      s.academy[id] = { ...(s.academy[id] || {}), seen: Date.now() };
    });
  }, [id]);
  useEffect(() => setStep(0), [ex]);

  const puzzle = examples[ex] ? getPuzzle(examples[ex]) : null;
  const toks = useMemo(() => (puzzle ? sanLine(puzzle.fen, puzzle.solution, 30) : []), [puzzle && puzzle.id]);
  let fen = puzzle ? puzzle.fen : '8/8/8/4k3/8/8/8/4K3 w - - 0 1';
  let lastMove = null;
  if (puzzle) {
    if (step === 0 && puzzle.lead) {
      const c = new Chess(puzzle.lead.fen);
      const m = playUci(c, puzzle.lead.uci);
      lastMove = m ? [m.from, m.to] : null;
    } else if (step > 0) {
      const t = toks[step - 1];
      fen = t.fen;
      lastMove = [t.uci.slice(0, 2), t.uci.slice(2, 4)];
    }
  }
  const solver = puzzle ? turnOf(puzzle.fen) : 'w';

  if (!topic)
    return (
      <div class="page">
        <div class="empty">
          <strong>That theme doesn’t exist</strong>
          <div>
            <button type="button" class="btn primary" onClick={() => go('learn', { academy: 1 })}>All themes</button>
          </div>
        </div>
      </div>
    );

  const related = (topic.related || []).map(topicById).filter(Boolean);
  const markLearned = () =>
    update((s) => {
      s.academy = s.academy || {};
      s.academy[id] = { ...(s.academy[id] || {}), learned: !(s.academy[id] && s.academy[id].learned), at: Date.now() };
    });

  const lesson = (
    <div class="stack" data-testid="academy-lesson">
      <p style={{ fontSize: '16px', fontWeight: 600, margin: 0 }}>{topic.short}</p>
      {topic.what.map((p, i) => (
        <p key={i} style={{ margin: 0, lineHeight: 1.6 }}>{p}</p>
      ))}
      <div>
        <h3 style={{ fontSize: '17px', marginBottom: '6px' }}>How to spot it</h3>
        <ul class="acad-list">
          {topic.spot.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      </div>
      {topic.patterns && topic.patterns.length ? (
        <div>
          <h3 style={{ fontSize: '17px', marginBottom: '6px' }}>Common patterns</h3>
          <ul class="acad-list">
            {topic.patterns.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {topic.defend && topic.defend.length ? (
        <div>
          <h3 style={{ fontSize: '17px', marginBottom: '6px' }}>When it’s used against you</h3>
          <ul class="acad-list">
            {topic.defend.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {topic.tip ? (
        <Note kind="info" title="Coach’s note">
          <p>{topic.tip}</p>
        </Note>
      ) : null}
      {related.length ? (
        <div class="row wrap" style={{ gap: '6px' }}>
          <span class="small muted" style={{ marginRight: '4px' }}>Related:</span>
          {related.map((r) => (
            <button key={r.id} type="button" class="chip" style={{ cursor: 'pointer', minHeight: '32px' }} onClick={() => go('learn', { topic: r.id })}>
              {r.name}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );

  const examplePanel = (
    <div class="stack" data-testid="academy-examples">
      {!ready ? <p class="muted">Loading examples…</p> : null}
      {ready && !examples.length ? <p class="muted">No examples of this theme in the library yet.</p> : null}
      {puzzle ? (
        <>
          <div class="row wrap" style={{ gap: '6px' }}>
            {examples.map((pid, i) => (
              <button key={pid} type="button" class={`btn sm${i === ex ? ' primary' : ''}`} onClick={() => setEx(i)} aria-pressed={i === ex}>
                Example {i + 1} · {getPuzzle(pid).rating}
              </button>
            ))}
          </div>
          <button type="button" class="btn" onClick={() => go('tactics', { mode: 'ids', ids: examples, label: `${topic.name} examples` })} data-testid="academy-solve">
            <Icon name="tactics" /> Solve these examples yourself
          </button>
        </>
      ) : null}
    </div>
  );

  const head = (
    <div class="stack tight">
      <div class="btn-row">
        <button type="button" class="btn primary" onClick={() => go('tactics', { mode: 'theme', theme: id, label: topic.name })} disabled={!count} data-testid="academy-practise">
          Practise this theme at your level <Icon name="arrow" />
        </button>
        <button type="button" class={`btn${learned && learned.learned ? ' primary' : ''}`} aria-pressed={!!(learned && learned.learned)} onClick={markLearned} data-testid="academy-learned">
          <Icon name="check" /> {learned && learned.learned ? 'Learned' : 'Mark as learned'}
        </button>
      </div>
      <p class="small muted" style={{ margin: 0 }}>
        {count} puzzle{count === 1 ? '' : 's'} with this theme in your library{stat && stat.n ? ` · your accuracy: ${Math.round((stat.ok / stat.n) * 100)}% of ${stat.n}` : ''}.
      </p>
    </div>
  );

  return (
    <Workspace
      eyebrow={`Theme academy · ${SECTIONS.find((s) => s.id === topic.section).title}`}
      title={topic.name}
      strips={0}
      board={<Board fen={fen} orientation={cgColor(solver)} lastMove={lastMove} viewOnly coords={settings.coords} label={`${topic.name} example`} />}
      below={puzzle ? <div class="panel pad stack tight acad-stepper" style={{ marginTop: '12px' }}>          <p class="muted" style={{ margin: 0 }}>
              {step === 0 ? `${sideName(solver)} to move. Find the idea yourself first, then step through the answer.` : step >= toks.length ? 'That’s the whole line.' : `Move ${step} of ${toks.length}${toks[step - 1] ? `: ${toks[step - 1].san}` : ''}${step % 2 === 0 ? ' (the opponent’s best reply)' : ''}.`}
            </p>
            <div class="btn-row">
              <button type="button" class="btn" onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0} aria-label="Previous move">
                <Icon name="prev" /> Back
              </button>
              <button type="button" class="btn primary" onClick={() => setStep(Math.min(toks.length, step + 1))} disabled={step >= toks.length} data-testid="academy-step">
                {step === 0 ? 'Show the first move' : 'Next move'} <Icon name="next" />
              </button>
            </div>
            {step >= toks.length ? (
              <p class="small mono" style={{ margin: 0 }}>{toks.map((t, i) => `${i % 2 === 0 ? `${i / 2 + 1}. ` : ''}${t.san}`).join(' ')}</p>
            ) : null}
  </div> : null}
      sections={[
        { id: 'lesson', label: 'Lesson', heading: false, content: <div class="stack">{head}{lesson}<button type="button" class="btn ghost" onClick={() => go('learn', { academy: 1 })}>All themes</button></div> },
        { id: 'examples', label: 'Examples', content: examplePanel },
      ]}
    />
  );
}
