// Live improvement goals: per-game numbers from reviewed games, how the last
// 10 compare with the last 50, and one goal tied to what you're working on.
import { isMine } from './guide.js';
import { weaknesses } from './path.js';

const BAD = (m) => m && (m.cls === 'mistake' || m.cls === 'blunder');

export const METRICS = {
  hung: { label: 'Pieces left hanging', short: 'hung pieces', unit: 'per game', lower: true },
  blunders: { label: 'Blunders', short: 'blunders', unit: 'per game', lower: true },
  mistakes: { label: 'Mistakes and blunders', short: 'mistakes', unit: 'per game', lower: true },
  missed: { label: 'Missed tactics', short: 'missed tactics', unit: 'per game', lower: true },
  accuracy: { label: 'Accuracy', short: 'accuracy', unit: '%', lower: false },
};
export const METRIC_KEYS = Object.keys(METRICS);

/** The numbers for one reviewed game of mine, or null. */
export function gameMetrics(game) {
  const an = game && game.analysis;
  if (!an || !game.userColor) return null;
  const out = { hung: 0, blunders: 0, mistakes: 0, missed: 0, accuracy: an.accuracy ? Math.round(an.accuracy[game.userColor] ?? 0) : null };
  an.moves.forEach((m, ply) => {
    if (!isMine(game, ply) || !m) return;
    if (m.cls === 'blunder') out.blunders++;
    if (!BAD(m)) return;
    out.mistakes++;
    const tags = m.tags || [];
    if (tags.includes('hung-piece')) out.hung++;
    if (tags.some((t) => t.startsWith('missed-'))) out.missed++;
  });
  return out;
}

const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
export const round1 = (x) => (x == null ? null : Math.round(x * 10) / 10);

/** Reviewed games of mine, oldest first, with their numbers. */
export function reviewedSeries(games) {
  return games
    .filter((g) => g.analysis && g.userColor && g.moves.length >= 10)
    .map((g) => ({ id: g.id, t: g.created, m: gameMetrics(g) }))
    .filter((x) => x.m)
    .sort((a, b) => a.t - b.t);
}

/** Last 10 vs last 50 for one metric, plus a rolling 10-game line for a sparkline. */
export function trend(series, key, { window = 10, points = 60 } = {}) {
  const vals = series.map((x) => x.m[key]).filter((v) => v != null);
  const n = vals.length;
  const last10 = avg(vals.slice(-10));
  const last50 = avg(vals.slice(-50));
  const spark = [];
  for (let i = Math.max(window, n - points + 1); i <= n; i++) spark.push(avg(vals.slice(i - window, i)));
  if (n && n < window) spark.push(avg(vals));
  const lower = METRICS[key].lower;
  const delta = last10 != null && last50 != null ? last10 - last50 : 0;
  const better = lower ? delta < -0.05 * Math.max(1, last50) : delta > 0.5;
  const worse = lower ? delta > 0.05 * Math.max(1, last50) : delta < -0.5;
  return { n, last10: round1(last10), last50: round1(last50), latest: n ? vals[n - 1] : null, spark, direction: better ? 'better' : worse ? 'worse' : 'flat' };
}

const FOCUS_METRIC = { hangingPiece: 'hung', fork: 'missed', pin: 'missed', skewer: 'missed', discoveredAttack: 'missed', mate: 'blunders', backRank: 'blunders' };

/** A suggested goal: the metric behind your biggest weakness, about 40% better than your last 50 games. */
export function suggestedGoal(games) {
  const series = reviewedSeries(games);
  const { count } = weaknesses(games);
  const top = Object.entries(count)
    .filter(([k]) => FOCUS_METRIC[k])
    .sort((a, b) => b[1] - a[1])[0];
  const metric = top ? FOCUS_METRIC[top[0]] : 'blunders';
  return { metric, target: targetFor(metric, trend(series, metric)), auto: true };
}

export function targetFor(metric, tr) {
  const base = tr.last50 ?? tr.last10;
  if (base == null) return METRICS[metric].lower ? 1 : 75;
  if (METRICS[metric].lower) return Math.max(0.1, round1(base * 0.6));
  return Math.min(98, Math.round(base + 5));
}

/** The goal in force: the one you set, or the suggestion. */
export function currentGoal(state, games) {
  const g = state.goal;
  if (g && METRICS[g.metric] && typeof g.target === 'number') return { ...g, auto: false };
  return suggestedGoal(games);
}

/** Where you stand against a goal. */
export function goalStatus(goal, tr) {
  const m = METRICS[goal.metric];
  if (!tr.n) return { state: 'none', text: 'No reviewed games yet. Once your games are analysed, this fills in by itself.' };
  if (tr.n < 5) return { state: 'early', text: `Only ${tr.n} reviewed game${tr.n === 1 ? '' : 's'} so far — a few more and the trend means something.` };
  const met = m.lower ? tr.last10 <= goal.target : tr.last10 >= goal.target;
  if (met) return { state: 'met', text: `Your last 10 games are at ${fmt(goal.metric, tr.last10)} — goal reached. Keep it there for another 10 and set a harder one.` };
  if (tr.direction === 'better') return { state: 'improving', text: `Heading the right way: ${fmt(goal.metric, tr.last10)} over your last 10 against ${fmt(goal.metric, tr.last50)} over 50.` };
  if (tr.direction === 'worse') return { state: 'slipping', text: `Slipping: ${fmt(goal.metric, tr.last10)} over your last 10 against ${fmt(goal.metric, tr.last50)} over 50.` };
  return { state: 'flat', text: `Holding steady at ${fmt(goal.metric, tr.last10)} — not moving yet. The training targets it; give it time and games.` };
}

export const fmt = (metric, v) => (v == null ? '–' : METRICS[metric].unit === '%' ? `${Math.round(v)}%` : `${round1(v)} ${METRICS[metric].unit}`);
