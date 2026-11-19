// Insights: recurring mistakes, puzzle accuracy by theme, performance by
// opening and training activity — all from saved activity, each with a next step.
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { Icon } from '../components/Icon.jsx';
import { useStore, listGames, gamesVersion } from '../lib/store.js';
import { puzzleThemes, recurringMistakes, openingPerformance, accuracyTrend, dailyActivity, streak, MIN_THEME_ATTEMPTS, MIN_OPENING_GAMES, wonPositions, timeTrouble, blunderCheckStats, ACADEMY_ID } from '../lib/insights.js';
import { fmtAdv } from '../lib/convert.js';
import { fmtSecs } from '../lib/clock.js';
import { punishStats } from '../lib/guide.js';
import { update } from '../lib/store.js';
import { sideName } from '../lib/chessx.js';
import { fmtDate } from '../components/ui.jsx';
import { themeLabel } from '../data/themes.js';
import { go } from '../lib/router.js';

function useWidth() {
  const ref = useRef(null);
  const [w, setW] = useState(600);
  useEffect(() => {
    if (!ref.current || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(([e]) => setW(Math.max(260, Math.round(e.contentRect.width))));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

function Empty({ title, children, action }) {
  return (
    <div class="empty" style={{ padding: '22px 12px' }}>
      <strong>{title}</strong>
      {children}
      {action ? <div>{action}</div> : null}
    </div>
  );
}

function ActivityChart({ days }) {
  const [ref, w] = useWidth();
  const [tip, setTip] = useState(null);
  const H = 150;
  const pad = { l: 30, r: 6, t: 10, b: 24 };
  const max = Math.max(4, ...days.map((d) => d.puzzles));
  const step = (w - pad.l - pad.r) / days.length;
  const y = (v) => pad.t + (1 - v / max) * (H - pad.t - pad.b);
  const ticks = [0, Math.round(max / 2), max];
  const narrow = w < 520;
  return (
    <div class="chart" ref={ref} onMouseLeave={() => setTip(null)}>
      <svg viewBox={`0 0 ${w} ${H}`} width={w} height={H} role="img" aria-label="Puzzles attempted per day over the last four weeks, with first-try solves highlighted">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={w - pad.r} y1={y(t)} y2={y(t)} stroke="var(--line)" stroke-dasharray={t ? '3 4' : ''} />
            <text x={pad.l - 6} y={y(t) + 4} text-anchor="end" font-size="11" fill="var(--ink-3)">{t}</text>
          </g>
        ))}
        {days.map((d, i) => {
          const x = pad.l + i * step + step * 0.18;
          const bw = Math.max(2, step * 0.64);
          return (
            <g key={d.key} onMouseEnter={() => setTip({ i, x: x + bw / 2 })} onFocus={() => setTip({ i, x: x + bw / 2 })} tabIndex={0} aria-label={`${fmtDate(d.t)}: ${d.puzzles} puzzles, ${d.ok} first try${d.other ? `, ${d.other} other sessions` : ''}`}>
              <rect x={pad.l + i * step} y={pad.t} width={step} height={H - pad.t - pad.b} fill="transparent" />
              {d.puzzles ? <rect x={x} y={y(d.puzzles)} width={bw} height={y(0) - y(d.puzzles)} rx="2" fill="var(--turq-dim)" /> : null}
              {d.ok ? <rect x={x} y={y(d.ok)} width={bw} height={y(0) - y(d.ok)} rx="2" fill="var(--amber)" /> : null}
              {d.other ? <circle cx={x + bw / 2} cy={H - pad.b + 8} r="3" fill="var(--turq)" /> : null}
            </g>
          );
        })}
        {!narrow
          ? days.map((d, i) =>
              i % 7 === 0 || i === days.length - 1 ? (
                <text key={d.key} x={pad.l + i * step + step / 2} y={H - 2} text-anchor="middle" font-size="11" fill="var(--ink-3)">
                  {i === days.length - 1 ? 'Today' : fmtDate(d.t)}
                </text>
              ) : null
            )
          : null}
      </svg>
      {tip ? (
        <div class="chart-tip" style={{ left: `${tip.x}px`, top: '10px' }}>
          <b>{fmtDate(days[tip.i].t)}</b> · {days[tip.i].puzzles} puzzles, {days[tip.i].ok} first try{days[tip.i].other ? ` · ${days[tip.i].other} other` : ''}
        </div>
      ) : null}
      <div class="legend" style={{ marginTop: '6px' }}>
        <span><i style={{ background: 'var(--amber)' }} />Solved first try</span>
        <span><i style={{ background: 'var(--turq-dim)' }} />Other puzzle attempts</span>
        <span><i style={{ background: 'var(--turq)', borderRadius: '50%' }} />Games, reviews, lessons, drills</span>
      </div>
    </div>
  );
}

function TrendChart({ points }) {
  const [ref, w] = useWidth();
  const H = 170;
  const pad = { l: 34, r: 12, t: 12, b: 22 };
  const lo = Math.max(0, Math.floor(Math.min(...points.map((p) => p.acc)) / 10) * 10 - 10);
  const x = (i) => pad.l + (points.length === 1 ? 0.5 : i / (points.length - 1)) * (w - pad.l - pad.r);
  const y = (v) => pad.t + (1 - (v - lo) / (100 - lo)) * (H - pad.t - pad.b);
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.acc).toFixed(1)}`).join(' ');
  const mean = points.reduce((a, p) => a + p.acc, 0) / points.length;
  return (
    <div class="chart" ref={ref}>
      <svg viewBox={`0 0 ${w} ${H}`} width={w} height={H} role="img" aria-label={`Your accuracy in your last ${points.length} reviewed games`}>
        {[lo, (lo + 100) / 2, 100].map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={w - pad.r} y1={y(t)} y2={y(t)} stroke="var(--line)" stroke-dasharray="3 4" />
            <text x={pad.l - 6} y={y(t) + 4} text-anchor="end" font-size="11" fill="var(--ink-3)">{Math.round(t)}%</text>
          </g>
        ))}
        <line x1={pad.l} x2={w - pad.r} y1={y(mean)} y2={y(mean)} stroke="var(--amber)" stroke-width="1.5" stroke-dasharray="6 4" />
        <text x={w - pad.r} y={y(mean) - 6} text-anchor="end" font-size="11" fill="var(--amber)">average {Math.round(mean)}%</text>
        <path d={path} fill="none" stroke="var(--turq)" stroke-width="2.5" stroke-linejoin="round" />
        {points.map((p, i) => (
          <circle key={p.id} cx={x(i)} cy={y(p.acc)} r="5" fill="var(--bg)" stroke="var(--turq)" stroke-width="2.5" style={{ cursor: 'pointer' }} onClick={() => go('review', { id: p.id })}>
            <title>{`${p.label}, ${fmtDate(p.t)}: ${Math.round(p.acc)}% — click to open`}</title>
          </circle>
        ))}
        <text x={pad.l} y={H - 4} font-size="11" fill="var(--ink-3)">older</text>
        <text x={w - pad.r} y={H - 4} text-anchor="end" font-size="11" fill="var(--ink-3)">most recent</text>
      </svg>
    </div>
  );
}

export function Insights() {
  const attempts = useStore((s) => s.attempts);
  const activity = useStore((s) => s.activity);
  const order = useStore((s) => s.gameOrder);
  const games = useMemo(() => listGames(), [order.join(','), activity.length, gamesVersion()]);
  const themes = useMemo(() => puzzleThemes(attempts), [attempts.length]);
  const mistakes = useMemo(() => recurringMistakes(games), [games]);
  const openings = useMemo(() => openingPerformance(games), [games]);
  const trend = useMemo(() => accuracyTrend(games), [games]);
  const days = useMemo(() => dailyActivity(attempts, activity), [attempts.length, activity.length]);
  const streakDays = streak(attempts, activity);
  const thrown = useMemo(() => wonPositions(games), [games]);
  const tt = useMemo(() => timeTrouble(games), [games]);
  const bc = useMemo(() => blunderCheckStats(games), [games]);
  const ps = useMemo(() => punishStats(games), [games]);
  const pr = useStore((s) => s.puzzleRating);
  const [allOpenings, setAllOpenings] = useState(false);
  const solvedFirst = attempts.filter((a) => a.ok && !a.hint).length;
  const enoughThemes = themes.filter((t) => t.n >= MIN_THEME_ATTEMPTS);
  const openRows = openings.rows.filter((r) => r.n >= MIN_OPENING_GAMES);
  const fewRows = openings.rows.filter((r) => r.n < MIN_OPENING_GAMES);

  return (
    <div class="page">
      <div class="page-head">
        <div>
          <div class="eyebrow">Insights</div>
          <h1 style={{ marginTop: '10px' }}>
            What keeps <em>costing you</em>
          </h1>
          <p>Built only from what you’ve done here: reviewed games, puzzle attempts and training sessions. Each finding has a button that starts the matching practice.</p>
        </div>
      </div>

      <div class="stat-row" style={{ marginBottom: '22px' }}>
        <div class="stat">
          <div class="eyebrow">Training streak</div>
          <div class="v">{streakDays} day{streakDays === 1 ? '' : 's'}</div>
          <div class="s">days in a row with any training</div>
        </div>
        <div class="stat">
          <div class="eyebrow">Puzzles</div>
          <div class="v">{attempts.length}</div>
          <div class="s">{attempts.length ? `${Math.round((solvedFirst / attempts.length) * 100)}% first try · rating ${pr ? pr.r : 1000}` : 'none attempted yet'}</div>
        </div>
        <div class="stat">
          <div class="eyebrow">Games reviewed</div>
          <div class="v">{mistakes.reviewed}</div>
          <div class="s">of {games.length} saved game{games.length === 1 ? '' : 's'} (with your side set)</div>
        </div>
        <div class="stat">
          <div class="eyebrow">Average accuracy</div>
          <div class="v">{trend.length ? `${Math.round(trend.reduce((a, p) => a + p.acc, 0) / trend.length)}%` : '–'}</div>
          <div class="s">{trend.length ? `over ${trend.length} reviewed game${trend.length === 1 ? '' : 's'}` : 'review a game to see this'}</div>
        </div>
      </div>

      <div class="grid-2" style={{ alignItems: 'start' }}>
        <section class="panel pad" aria-labelledby="h-mistakes">
          <div class="panel-title">
            <h3 id="h-mistakes">Recurring mistakes</h3>
            <span class="small muted">mistakes & blunders on your moves</span>
          </div>
          {mistakes.list.length ? (
            <div class="stack tight">
              {mistakes.list.slice(0, 6).map((m) => (
                <div key={m.tag} class="insight" data-testid="insight-mistake">
                  <div>
                    <h4>{m.label}</h4>
                    <p>
                      {m.count} time{m.count === 1 ? '' : 's'} in {m.games} game{m.games === 1 ? '' : 's'}
                      {m.count < 2 ? ' — one instance isn’t a pattern yet' : ''}.
                    </p>
                  </div>
                  <div class="btn-row" style={{ justifyContent: 'flex-end' }}>
                    {m.example ? (
                      <button type="button" class="btn sm" onClick={() => go('review', { id: m.example.gameId, ply: m.example.ply, retry: true })}>
                        Retry worst one
                      </button>
                    ) : null}
                    {m.theme ? (
                      <button type="button" class="btn sm" onClick={() => go('learn', { topic: ACADEMY_ID[m.theme] || m.theme })}>
                        Lesson
                      </button>
                    ) : null}
                    {m.theme ? (
                      <button type="button" class="btn sm primary" onClick={() => go('tactics', { mode: 'theme', theme: m.theme, label: themeLabel(m.theme) })} data-testid="insight-practice">
                        Practise {themeLabel(m.theme).toLowerCase()}
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <Empty title={mistakes.reviewed ? 'No mistakes found in your reviewed games' : 'Not enough data yet'} action={!mistakes.reviewed ? <button type="button" class="btn primary" onClick={() => go('review')}>Review a game</button> : null}>
              {mistakes.reviewed ? `Across ${mistakes.reviewed} reviewed game${mistakes.reviewed === 1 ? '' : 's'} the engine found no mistakes or blunders on your side.` : 'Patterns appear once you’ve reviewed games where your side is known — a game played here, or an import where you picked your colour.'}
            </Empty>
          )}
        </section>

        <section class="panel pad" aria-labelledby="h-themes">
          <div class="panel-title">
            <h3 id="h-themes">Puzzle accuracy by theme</h3>
            <span class="small muted">first try, no hint · weakest first</span>
          </div>
          {themes.length ? (
            <div class="meter-list">
              {themes.map((t) => {
                const enough = t.n >= MIN_THEME_ATTEMPTS;
                return (
                  <div key={t.id} class="meter-row">
                    <span style={{ fontWeight: 600 }}>{t.label}</span>
                    {enough ? (
                      <span class={`meter ${t.pct < 50 ? 'coral' : t.pct < 75 ? 'amber' : ''}`} role="img" aria-label={`${t.pct} percent`}>
                        <i style={{ width: `${t.pct}%` }} />
                      </span>
                    ) : (
                      <span class="small muted">needs {MIN_THEME_ATTEMPTS - t.n} more</span>
                    )}
                    <span class="fig">{enough ? `${t.pct}% · ${t.n}` : `${t.ok}/${t.n}`}</span>
                    <button type="button" class="btn sm" onClick={() => go('tactics', { mode: 'theme', theme: t.id, label: t.label })}>
                      Practise
                    </button>
                  </div>
                );
              })}
              {!enoughThemes.length ? <p class="small muted" style={{ marginTop: '8px' }}>Percentages appear after {MIN_THEME_ATTEMPTS} attempts in a theme.</p> : null}
            </div>
          ) : (
            <Empty title="No puzzle attempts yet" action={<button type="button" class="btn primary" onClick={() => go('tactics', { mode: 'rated', label: 'Rated training' })}>Start rated training</button>}>
              Solve a few puzzles and your strongest and weakest themes show up here.
            </Empty>
          )}
        </section>

        <section class="panel pad" aria-labelledby="h-openings">
          <div class="panel-title">
            <h3 id="h-openings">Performance by opening</h3>
            <span class="small muted">your finished games</span>
          </div>
          {openRows.length ? (
            <div class="scroll">
              <table class="data">
                <thead>
                  <tr>
                    <th>Opening</th>
                    <th class="num">Games</th>
                    <th>Results</th>
                    <th class="num">Score</th>
                    <th class="num">Accuracy</th>
                  </tr>
                </thead>
                <tbody>
                  {(allOpenings ? openRows : openRows.slice(0, 10)).map((r) => (
                    <tr key={r.key}>
                      <td>
                        <button type="button" class="btn ghost sm" style={{ padding: '0 6px', minHeight: '32px', textAlign: 'left' }} onClick={() => go('review', { id: r.lastId })} title="Open your most recent game in this opening">
                          {r.name}
                        </button>
                        <span class="small muted"> as {sideName(r.color)}</span>
                      </td>
                      <td class="num">{r.n}</td>
                      <td>
                        <span class="segbar" role="img" aria-label={`${r.w} wins, ${r.d} draws, ${r.l} losses`}>
                          {r.w ? <i style={{ flex: r.w, background: 'var(--turq)' }} /> : null}
                          {r.d ? <i style={{ flex: r.d, background: 'var(--slate)' }} /> : null}
                          {r.l ? <i style={{ flex: r.l, background: 'var(--coral)' }} /> : null}
                        </span>
                        <span class="small muted mono">{r.w}W {r.d}D {r.l}L</span>
                      </td>
                      <td class="num">{r.score}%</td>
                      <td class="num">{r.accuracy != null ? `${r.accuracy}%` : '–'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {fewRows.length ? <p class="small muted" style={{ marginTop: '8px' }}>{fewRows.length} more opening{fewRows.length === 1 ? '' : 's'} with a single game each aren’t shown.</p> : null}
              <div class="btn-row" style={{ marginTop: '12px' }}>
                {openRows.length > 10 ? (
                  <button type="button" class="btn sm" onClick={() => setAllOpenings(!allOpenings)}>
                    {allOpenings ? 'Show top 10' : `Show all ${openRows.length}`}
                  </button>
                ) : null}
                <button type="button" class="btn sm" onClick={() => go('repertoire')}>
                  Work on your repertoire
                </button>
              </div>
            </div>
          ) : (
            <Empty title="Not enough games yet" action={<button type="button" class="btn primary" onClick={() => go('play')}>Play a game</button>}>
              {openings.games ? `You have ${openings.games} finished game${openings.games === 1 ? '' : 's'}; an opening needs at least ${MIN_OPENING_GAMES} before a score means anything.` : `Results by opening show up once you have at least ${MIN_OPENING_GAMES} finished games in the same opening.`}
            </Empty>
          )}
        </section>

        <section class="panel pad" aria-labelledby="h-trend">
          <div class="panel-title">
            <h3 id="h-trend">Accuracy in reviewed games</h3>
            <span class="small muted">0–100, from engine evaluations</span>
          </div>
          {trend.length >= 3 ? (
            <TrendChart points={trend} />
          ) : (
            <Empty title="Needs three reviewed games" action={<button type="button" class="btn primary" onClick={() => go('review')}>Review a game</button>}>
              {trend.length ? `${trend.length} so far. ` : ''}A trend from fewer than three games would be noise.
            </Empty>
          )}
        </section>
      </div>

      <div class="grid-2" style={{ alignItems: 'start', marginTop: '18px' }}>
        <section class="panel pad" aria-labelledby="h-thrown">
          <div class="panel-title">
            <h3 id="h-thrown">Thrown wins</h3>
            <span class="small muted">clearly winning (+3 or more), didn’t win</span>
          </div>
          {thrown.length ? (
            <div class="stack tight">
              <p class="small" style={{ margin: 0 }}>
                <strong>{thrown.filter((p) => p.outcome !== 'won anyway').length}</strong> of your reviewed games were winning and ended as a draw or a loss{thrown.some((p) => p.outcome === 'won anyway') ? `, and ${thrown.filter((p) => p.outcome === 'won anyway').length} more nearly slipped` : ''}.
              </p>
              {thrown.slice(0, 3).map((p) => (
                <div key={p.id} class="insight">
                  <div>
                    <h4>{p.label}</h4>
                    <p>{p.before >= 9000 ? 'Forced mate on the board' : `${fmtAdv(p.before)}`}, then {p.played} — you {p.outcome}.</p>
                  </div>
                  <button type="button" class="btn sm primary" onClick={() => go('learn', { convert: p.id })}>Win it now</button>
                </div>
              ))}
              {thrown.length > 3 ? (
                <button type="button" class="btn sm" onClick={() => go('learn')}>All {thrown.length} in Learn</button>
              ) : null}
            </div>
          ) : (
            <Empty title={mistakes.reviewed ? 'No thrown wins in your reviewed games' : 'Not enough data yet'} action={!mistakes.reviewed ? <button type="button" class="btn primary" onClick={() => go('review')}>Import and analyse games</button> : null}>
              {mistakes.reviewed ? 'When you were clearly winning, you finished the job. Nice.' : 'This needs reviewed games where your side is known.'}
            </Empty>
          )}
        </section>

        <section class="panel pad" aria-labelledby="h-punish" data-testid="insight-punish">
          <div class="panel-title">
            <h3 id="h-punish">Punishing mistakes</h3>
            <span class="small muted">your reply to their mistakes and blunders</span>
          </div>
          {ps.chances ? (
            <div class="stack tight">
              <p class="small" style={{ margin: 0 }}>
                Your opponents made <strong>{ps.chances}</strong> serious mistakes in {ps.games} reviewed game{ps.games === 1 ? '' : 's'}. You punished <strong>{ps.punished}</strong> ({Math.round((ps.punished / ps.chances) * 100)}%) and let <strong>{ps.chances - ps.punished}</strong> go.
              </p>
              <span class={`meter ${ps.punished / ps.chances < 0.5 ? 'coral' : ps.punished / ps.chances < 0.75 ? 'amber' : ''}`} role="img" aria-label={`${Math.round((ps.punished / ps.chances) * 100)} percent punished`}>
                <i style={{ width: `${Math.round((ps.punished / ps.chances) * 100)}%` }} />
              </span>
              {ps.examples.map((e) => (
                <div key={`${e.gameId}${e.ply}`} class="insight">
                  <div>
                    <h4>{e.label}, move {Math.floor(e.ply / 2) + 1}</h4>
                    <p>{e.text || 'Your opponent had just blundered and your reply let it go.'}</p>
                  </div>
                  <button type="button" class="btn sm" onClick={() => go('review', { id: e.gameId, ply: e.ply, retry: true })}>Try it now</button>
                </div>
              ))}
              <div>
                <button type="button" class="btn sm primary" onClick={() => go('tactics', { mode: 'theme', theme: 'hangingPiece', label: 'Hanging pieces' })}>
                  Practise spotting free material
                </button>
              </div>
            </div>
          ) : (
            <Empty title={mistakes.reviewed ? 'Your opponents gave you no big chances' : 'Not enough data yet'}>
              {mistakes.reviewed ? 'No serious opponent mistakes in your reviewed games.' : 'Review games with your side set to see how often you punish your opponents’ mistakes.'}
            </Empty>
          )}
        </section>

        <section class="panel pad" aria-labelledby="h-clock">
          <div class="panel-title">
            <h3 id="h-clock">Clock & blunder check</h3>
            <span class="small muted">games with clock data</span>
          </div>
          <div class="stack tight">
            {tt.withClocks ? (
              <>
                <p class="small" style={{ margin: 0 }}>
                  {tt.bad ? (
                    <>
                      <strong>{tt.lowBad}</strong> of your {tt.bad} mistakes and blunders came with the clock low (under 10% of your time).{' '}
                    </>
                  ) : null}
                  {tt.flagged ? <><strong>{tt.flagged}</strong> game{tt.flagged === 1 ? '' : 's'} lost on time. </> : null}
                  {tt.sinks ? <>{tt.sinks} long thinks on routine moves across {tt.withClocks} games.</> : `${tt.withClocks} games with clock data, no big time sinks.`}
                </p>
                {tt.examples.map((e) => (
                  <div key={`${e.gameId}${e.ply}`} class="insight">
                    <div>
                      <h4>{fmtSecs(e.spent)} on move {Math.floor(e.ply / 2) + 1}</h4>
                      <p>{e.label} — a routine move.</p>
                    </div>
                    <button type="button" class="btn sm" onClick={() => go('review', { id: e.gameId, ply: e.ply })}>See it</button>
                  </div>
                ))}
              </>
            ) : (
              <p class="small muted" style={{ margin: 0 }}>No clock data yet. chess.com and Lichess downloads include it, and games played here with a clock record it.</p>
            )}
            <hr style={{ border: 0, borderTop: '1px solid var(--line)', margin: '6px 0' }} />
            {bc.games ? (
              <p class="small" style={{ margin: 0 }}>
                Blunder check: <strong>{Math.round((bc.right / Math.max(1, bc.scans)) * 100)}%</strong> of {bc.scans} scans right over {bc.games} game{bc.games === 1 ? '' : 's'}; {bc.hung ? `${bc.hung} move${bc.hung === 1 ? '' : 's'} still left something hanging${bc.hungAfterWrong ? ` (${bc.hungAfterWrong} after a wrong scan)` : ''}` : 'no piece left hanging'}.
              </p>
            ) : (
              <p class="small muted" style={{ margin: 0 }}>Blunder check isn’t used yet. It makes you mark what’s in danger before every move — the habit that stops one-move blunders.</p>
            )}
            <div>
              <button type="button" class="btn sm primary" onClick={() => { update((s) => (s.settings.blunderCheck = true)); go('play'); }}>
                Play a blunder-check game
              </button>
            </div>
          </div>
        </section>
      </div>

      <section class="panel pad" style={{ marginTop: '18px' }} aria-labelledby="h-activity">
        <div class="panel-title">
          <h3 id="h-activity">Training activity — last 4 weeks</h3>
          <span class="small muted">puzzles per day</span>
        </div>
        {days.some((d) => d.puzzles || d.other) ? <ActivityChart days={days} /> : <Empty title="No training logged in the last four weeks">Every puzzle, game, review, lesson and drill is logged here.</Empty>}
      </section>
      <p class="small muted" style={{ marginTop: '14px' }}>
        <Icon name="eye" size={14} /> Puzzle accuracy counts a puzzle as correct only when solved on the first try without a hint. Mistake types come from the review explanations, so they only cover reviewed games.
      </p>
    </div>
  );
}
