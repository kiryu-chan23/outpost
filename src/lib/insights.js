// Personal insights computed from saved activity only (games, reviews, puzzle
// attempts). Every finding states how much data it rests on; nothing is shown
// until there is enough to say something honest.
import { TAG_THEME, TAG_LABEL } from './explain.js';
import { themeStats, getPuzzle } from './puzzles.js';
import { dueIds, DAY } from './srs.js';
import { THEMES } from '../data/themes.js';
import { LESSONS } from '../data/lessons.js';
import { nextStep, stepRoute } from './path.js';
import { wonPositions, fmtAdv } from './convert.js';
import { scanSummary } from './blundercheck.js';
export { timeTrouble } from './clock.js';
export { wonPositions };

/** Blunder-check results across games played with it on. */
export function blunderCheckStats(games) {
  const gs = games.filter((g) => g.checks && g.checks.length);
  const sum = { games: gs.length, scans: 0, right: 0, hung: 0, hungAfterWrong: 0 };
  for (const g of gs) {
    const s = scanSummary(g.checks);
    sum.scans += s.scans;
    sum.right += s.right;
    sum.hung += s.hung;
    sum.hungAfterWrong += s.hungAfterWrong;
  }
  return sum;
}

export const MIN_THEME_ATTEMPTS = 3;
export const MIN_OPENING_GAMES = 2;

const won = (g) => (g.result === '1-0' && g.userColor === 'w') || (g.result === '0-1' && g.userColor === 'b');
const drew = (g) => g.result === '1/2-1/2';

// App theme ids → Theme academy lesson ids (the academy uses Lichess tag names).
export const ACADEMY_ID = { backRank: 'backRankMate', smothered: 'smotheredMate' };

export function puzzleThemes(attempts) {
  const s = themeStats(attempts);
  return THEMES.map((t) => ({ ...t, n: s[t.id]?.n || 0, ok: s[t.id]?.ok || 0, pct: s[t.id]?.n ? Math.round((s[t.id].ok / s[t.id].n) * 100) : null }))
    .filter((t) => t.n > 0)
    .sort((a, b) => (a.n >= MIN_THEME_ATTEMPTS ? a.pct : 101) - (b.n >= MIN_THEME_ATTEMPTS ? b.pct : 101) || b.n - a.n);
}

/** Mistake tags on my own moves across reviewed games. */
export function recurringMistakes(games) {
  const reviewed = games.filter((g) => g.analysis && g.userColor);
  const tags = {};
  for (const g of reviewed) {
    g.analysis.moves.forEach((m, ply) => {
      const mine = (ply % 2 === 0) === (g.startFen ? g.startFen.split(' ')[1] === g.userColor : g.userColor === 'w');
      if (!mine || !(m.cls === 'mistake' || m.cls === 'blunder')) return;
      for (const t of m.tags) {
        if (!TAG_LABEL[t] || t === 'positional') continue;
        const r = (tags[t] = tags[t] || { tag: t, label: TAG_LABEL[t], theme: TAG_THEME[t] || null, count: 0, games: new Set(), example: null });
        r.count++;
        r.games.add(g.id);
        if (!r.example || m.loss > r.example.loss) r.example = { gameId: g.id, ply, loss: m.loss, label: `${g.white} – ${g.black}` };
      }
    });
  }
  const list = Object.values(tags)
    .map((r) => ({ ...r, games: r.games.size }))
    .sort((a, b) => b.count - a.count || b.games - a.games);
  // Merge into practice themes so "missed fork" and "walked into a fork" point at the same drill.
  const byTheme = {};
  for (const r of list) {
    if (!r.theme) continue;
    const t = (byTheme[r.theme] = byTheme[r.theme] || { theme: r.theme, count: 0, tags: [] });
    t.count += r.count;
    t.tags.push(r);
  }
  return { reviewed: reviewed.length, list, byTheme: Object.values(byTheme).sort((a, b) => b.count - a.count) };
}

const family = (name) => (name || 'Unknown').split(',')[0].replace(/\s*\(.*\)$/, '');
export function openingPerformance(games) {
  const mine = games.filter((g) => g.userColor && g.result !== '*' && !g.startFen);
  const rows = {};
  for (const g of mine) {
    const key = `${g.userColor}:${family(g.opening)}`;
    const r = (rows[key] = rows[key] || { key, color: g.userColor, name: family(g.opening), n: 0, w: 0, d: 0, l: 0, acc: [], lastId: g.id });
    r.n++;
    if (won(g)) r.w++;
    else if (drew(g)) r.d++;
    else r.l++;
    if (g.analysis && g.analysis.accuracy[g.userColor] != null) r.acc.push(g.analysis.accuracy[g.userColor]);
  }
  return {
    games: mine.length,
    rows: Object.values(rows)
      .map((r) => ({ ...r, score: Math.round(((r.w + r.d / 2) / r.n) * 100), accuracy: r.acc.length ? Math.round(r.acc.reduce((a, b) => a + b, 0) / r.acc.length) : null }))
      .sort((a, b) => b.n - a.n),
  };
}

export function accuracyTrend(games) {
  return games
    .filter((g) => g.analysis && g.userColor && g.analysis.accuracy[g.userColor] != null)
    .map((g) => ({ id: g.id, t: g.created, acc: g.analysis.accuracy[g.userColor], label: `${g.white} – ${g.black}` }))
    .sort((a, b) => a.t - b.t)
    .slice(-20);
}

const dayKey = (t) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};

/** Puzzles per day for the last `days` days (oldest first). */
export function dailyActivity(attempts, activity, days = 28, now = Date.now()) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const t = start.getTime() - i * DAY;
    out.push({ t, key: dayKey(t), puzzles: 0, ok: 0, other: 0 });
  }
  const idx = new Map(out.map((d, i) => [d.key, i]));
  for (const a of attempts) {
    const i = idx.get(dayKey(a.t));
    if (i == null) continue;
    out[i].puzzles++;
    if (a.ok && !a.hint) out[i].ok++;
  }
  for (const a of activity) {
    if (a.type === 'puzzles') continue;
    const i = idx.get(dayKey(a.t));
    if (i != null) out[i].other++;
  }
  return out;
}

export function streak(attempts, activity, now = Date.now()) {
  const days = new Set([...attempts.map((a) => dayKey(a.t)), ...activity.map((a) => dayKey(a.t))]);
  let n = 0;
  const d = new Date(now);
  d.setHours(12, 0, 0, 0);
  // Today doesn't break the streak until it's over.
  if (!days.has(dayKey(d.getTime()))) d.setDate(d.getDate() - 1);
  while (days.has(dayKey(d.getTime()))) {
    n++;
    d.setDate(d.getDate() - 1);
  }
  return n;
}

/**
 * The one thing to do next, plus a few alternatives. Each item:
 * { id, title, text, cta, route, params, fen?, orientation?, lastMove? }
 */
export function nextActions(state, games) {
  const out = [];
  const cur = state.current;
  if (cur && cur.status === 'playing') {
    out.push({ id: 'resume', title: 'Resume your game', text: `You’re ${Math.ceil(cur.moves.length / 2)} moves into a game against level ${cur.level}.`, cta: 'Resume game', route: 'play' });
  }
  const recent = games.find((g) => g.source === 'play' || g.source === 'import');
  if (recent && !recent.analysis && Date.now() - recent.created < 14 * DAY) {
    out.push({ id: 'review', title: 'Review your last game', text: `${recent.white} – ${recent.black}, ${Math.ceil(recent.moves.length / 2)} moves. The engine will find the moment it turned and let you replay it.`, cta: 'Review last game', route: 'review', params: { id: recent.id }, gameId: recent.id });
  }
  const due = dueIds(state.puzzleStats).filter((id) => getPuzzle(id, state));
  if (due.length) {
    const first = getPuzzle(due[0], state);
    out.push({ id: 'due', title: due.length === 1 ? 'One missed puzzle is due' : `${due.length} missed puzzles are due`, text: 'Positions you got wrong before, back on schedule. Getting them right now is how the pattern sticks.', cta: `Retry ${due.length} missed`, route: 'tactics', params: { mode: 'review', label: 'Missed puzzles' }, fen: first.fen });
  }
  const weak = puzzleThemes(state.attempts).find((t) => t.n >= MIN_THEME_ATTEMPTS && t.pct < 70);
  const rec = recurringMistakes(games).byTheme[0];
  if (rec && rec.count >= 2) {
    const t = THEMES.find((x) => x.id === rec.theme);
    const name = t?.label.toLowerCase() || rec.theme;
    const top = rec.tags[0];
    const ex = rec.tags.map((x) => x.example).filter(Boolean).sort((a, b) => b.loss - a.loss)[0];
    const lessonId = ACADEMY_ID[rec.theme] || rec.theme;
    out.push({ id: 'mistake', title: `Practise ${name}`, text: `${rec.count} of the mistakes in your reviewed games come down to ${name} — most often “${top.label.toLowerCase()}” (${top.count} times). Ten ${name} puzzles at your level target exactly that.`, cta: `Practise ${name}`, route: 'tactics', params: { mode: 'theme', theme: rec.theme, label: t?.label }, example: ex || null });
    out.push({ id: 'mistake-lesson', title: `Read the lesson: ${t?.label || name}`, text: `How to spot ${name} — and stop them happening to you — with real examples.`, cta: `Lesson: ${t?.label || name}`, route: 'learn', params: { topic: lessonId }, example: ex || null });
  } else if (weak) {
    out.push({ id: 'weak', title: `Practise missed ${weak.label.toLowerCase()}`, text: `You’ve solved ${weak.ok} of ${weak.n} ${weak.label.toLowerCase()} on the first try (${weak.pct}%) — your weakest theme so far.`, cta: `Practise missed ${weak.label.toLowerCase()}`, route: 'tactics', params: { mode: 'theme', theme: weak.id, label: weak.label } });
  }
  const thrown = wonPositions(games).filter((p) => !(state.drillStats[p.id] && state.drillStats[p.id].wins));
  if (thrown.length) {
    const p = thrown[0];
    out.push({ id: 'convert', title: 'Win the game you let slip', text: `Against ${p.label.replace(/^You – |\s–\s?You$/g, '')} you were ${p.before >= 9000 ? 'mating' : `${fmtAdv(p.before)} up`} and ${p.outcome === 'won anyway' ? 'nearly threw it' : p.outcome}. Play it out again from that position until it’s a win.`, cta: 'Convert the win', route: 'learn', params: { convert: p.id }, fen: p.fen, orientation: p.userColor === 'w' ? 'white' : 'black' });
  }
  const step = nextStep(state, games, { canConvert: false });
  if (step) {
    const [route, params] = stepRoute(step, games);
    const lesson = step.kind === 'lesson' ? LESSONS.find((l) => l.id === step.id) : null;
    const p = lesson ? state.lessonProgress[lesson.id] : null;
    out.push({
      id: lesson ? 'lesson' : 'path',
      title: p && !p.done ? `Finish “${lesson.title}”` : `Next on your path: ${step.title}`,
      text: lesson && !step.weakCount ? lesson.summary : step.why,
      cta: p && !p.done ? 'Resume lesson' : lesson ? 'Start lesson' : 'Start',
      route,
      params,
      ...(lesson ? { fen: lesson.steps[Math.min(p?.step || 0, lesson.steps.length - 1)].fen, orientation: lesson.steps[0].orientation } : {}),
    });
  }
  out.push({ id: 'warmup', title: 'Resume training', text: 'Ten rated puzzles at your level — they adapt as you go.', cta: 'Resume training', route: 'tactics', params: { mode: 'rated', label: 'Rated training' } });
  out.push({ id: 'play', title: 'Play a training game', text: 'A game against the computer at your level, with coach hints if you want them.', cta: 'Play a game', route: 'play' });
  return out;
}
