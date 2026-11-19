// Live improvement goals: the goal card (Home + Insights) and the trends panel.
import { useMemo, useState } from 'preact/hooks';
import { useStore, update, listGames, gamesVersion } from '../lib/store.js';
import { METRICS, METRIC_KEYS, reviewedSeries, trend, currentGoal, goalStatus, targetFor, fmt, round1 } from '../lib/goals.js';
import { Icon } from './Icon.jsx';

const useGames = () => {
  const order = useStore((s) => s.gameOrder);
  return useMemo(() => listGames(), [order.join(','), gamesVersion()]);
};

/** A small line chart of the rolling 10-game average, with the goal as a dashed line. */
export function Spark({ values, target, lower = true, w = 220, h = 54, label }) {
  const pts = values.filter((v) => v != null);
  if (pts.length < 2) return <div class="spark-empty small muted">Not enough games yet</div>;
  const all = target != null ? [...pts, target] : pts;
  let lo = Math.min(...all);
  let hi = Math.max(...all);
  if (hi - lo < 0.5) {
    hi += 0.25;
    lo -= 0.25;
  }
  const pad = 4;
  const x = (i) => pad + (i * (w - 2 * pad)) / (pts.length - 1);
  const y = (v) => pad + ((hi - v) * (h - 2 * pad)) / (hi - lo);
  const d = pts.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const last = pts[pts.length - 1];
  const good = target == null ? null : lower ? last <= target : last >= target;
  return (
    <svg class="spark" viewBox={`0 0 ${w} ${h}`} width="100%" height={h} role="img" aria-label={label}>
      {target != null ? <line x1={pad} x2={w - pad} y1={y(target)} y2={y(target)} class="spark-goal" /> : null}
      <path d={d} class="spark-line" />
      <circle cx={x(pts.length - 1)} cy={y(last)} r="3.5" class={good == null ? 'spark-dot' : good ? 'spark-dot good' : 'spark-dot bad'} />
    </svg>
  );
}

const STATE_CHIP = { met: ['turq', 'Goal reached'], improving: ['turq', 'Improving'], flat: ['amber', 'Holding'], slipping: ['coral', 'Slipping'], early: ['amber', 'Early days'], none: ['', 'Waiting for games'] };

export function GoalCard({ compact = false }) {
  const state = useStore((s) => s);
  const games = useGames();
  const series = useMemo(() => reviewedSeries(games), [games]);
  const goal = useMemo(() => currentGoal(state, games), [state.goal, games]);
  const tr = useMemo(() => trend(series, goal.metric), [series, goal.metric]);
  const st = goalStatus(goal, tr);
  const meta = METRICS[goal.metric];
  const [edit, setEdit] = useState(false);
  const step = meta.unit === '%' ? 1 : 0.1;
  const setGoal = (g) => update((s) => (s.goal = { metric: g.metric, target: g.target, setAt: Date.now() }));
  const chip = STATE_CHIP[st.state];
  return (
    <section class="panel pad stack goal-card" aria-labelledby="h-goal" data-testid="goal-card">
      <div class="panel-title" style={{ marginBottom: 0 }}>
        <h3 id="h-goal">Your goal</h3>
        <span class={`chip ${chip[0]}`} data-testid="goal-state">{chip[1]}</span>
      </div>
      <div class="goal-head">
        <div>
          <div class="goal-metric">{meta.label}</div>
          <div class="goal-value">
            <strong data-testid="goal-last10">{fmt(goal.metric, tr.last10)}</strong>
            <span class="muted"> last 10 games · {fmt(goal.metric, tr.last50)} last 50</span>
          </div>
          <div class="small">
            Goal: {meta.lower ? 'at most' : 'at least'} <strong>{fmt(goal.metric, goal.target)}</strong> over your last 10
            {goal.auto ? <span class="muted"> · suggested from your biggest weakness</span> : null}
          </div>
        </div>
        {!compact || tr.n >= 2 ? (
          <div class="goal-spark">
            <Spark values={tr.spark} target={goal.target} lower={meta.lower} label={`${meta.label}, rolling 10-game average`} />
            <div class="small muted" style={{ textAlign: 'right' }}>rolling 10-game average · dashed = goal</div>
          </div>
        ) : null}
      </div>
      <p class="small" style={{ margin: 0 }} data-testid="goal-text">{st.text}</p>
      {edit ? (
        <div class="stack tight" data-testid="goal-edit">
          <div class="btn-row">
            {METRIC_KEYS.map((k) => (
              <button
                key={k}
                type="button"
                class={`btn sm${k === goal.metric ? ' primary' : ''}`}
                aria-pressed={k === goal.metric}
                onClick={() => setGoal({ metric: k, target: targetFor(k, trend(series, k)) })}
              >
                {METRICS[k].label}
              </button>
            ))}
          </div>
          <div class="row" style={{ gap: '8px', alignItems: 'center' }}>
            <button type="button" class="btn sm" aria-label="Lower the target" onClick={() => setGoal({ metric: goal.metric, target: Math.max(0, round1(goal.target - step)) })}>
              −
            </button>
            <span class="mono">{fmt(goal.metric, goal.target)}</span>
            <button type="button" class="btn sm" aria-label="Raise the target" onClick={() => setGoal({ metric: goal.metric, target: round1(goal.target + step) })}>
              +
            </button>
            <button type="button" class="btn sm ghost" onClick={() => update((s) => (s.goal = null))}>
              Use the suggestion
            </button>
            <button type="button" class="btn sm ghost" onClick={() => setEdit(false)}>
              Done
            </button>
          </div>
        </div>
      ) : (
        <button type="button" class="btn sm ghost" style={{ alignSelf: 'start' }} onClick={() => setEdit(true)} data-testid="goal-change">
          <Icon name="prefs" /> Change goal
        </button>
      )}
    </section>
  );
}

/** Every metric: last 10 vs last 50 and its trend line. */
export function TrendsPanel() {
  const games = useGames();
  const state = useStore((s) => s);
  const series = useMemo(() => reviewedSeries(games), [games]);
  const goal = useMemo(() => currentGoal(state, games), [state.goal, games]);
  if (!series.length) return null;
  return (
    <section class="panel pad" aria-labelledby="h-trends" data-testid="trends">
      <div class="panel-title">
        <h3 id="h-trends">Trends</h3>
        <span class="small muted">{series.length} reviewed game{series.length === 1 ? "" : "s"} · updates as new games are analysed</span>
      </div>
      <div class="trend-grid">
        {METRIC_KEYS.map((k) => {
          const tr = trend(series, k);
          const meta = METRICS[k];
          const arrow = tr.direction === 'better' ? '↓' : tr.direction === 'worse' ? '↑' : '→';
          const shown = meta.lower ? arrow : tr.direction === 'better' ? '↑' : tr.direction === 'worse' ? '↓' : '→';
          return (
            <div class="trend" key={k}>
              <div class="row between">
                <span class="small" style={{ fontWeight: 600 }}>{meta.label}</span>
                <span class={`small trend-${tr.direction}`}>
                  {shown} {tr.direction === 'better' ? 'better' : tr.direction === 'worse' ? 'worse' : 'steady'}
                </span>
              </div>
              <div class="small muted">
                last 10 <strong class="mono" style={{ color: 'var(--ink)' }}>{fmt(k, tr.last10)}</strong> · last 50 {fmt(k, tr.last50)}
              </div>
              <Spark values={tr.spark} target={k === goal.metric ? goal.target : null} lower={meta.lower} h={44} label={`${meta.label} trend`} />
            </div>
          );
        })}
      </div>
    </section>
  );
}
