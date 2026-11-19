// Spaced repetition for missed puzzles and saved positions (Leitner boxes).
// A miss sends the card back to box 0 (due again in ten minutes); each clean
// solve moves it up one box and pushes the next review further out.
export const DAY = 24 * 60 * 60 * 1000;
export const INTERVAL_DAYS = [0, 1, 3, 7, 16, 35];
const RETRY_MS = 10 * 60 * 1000;

export function schedule(card, ok, now = Date.now()) {
  const prev = card || { box: 0, reps: 0, lapses: 0 };
  const box = ok ? Math.min(prev.box + 1, INTERVAL_DAYS.length - 1) : 0;
  return {
    box,
    due: ok ? now + INTERVAL_DAYS[box] * DAY : now + RETRY_MS,
    reps: (prev.reps || 0) + 1,
    lapses: (prev.lapses || 0) + (ok ? 0 : 1),
  };
}

/** Record an attempt on the stats record for one puzzle and return the updated record. */
export function recordAttempt(stat, { ok, hint, now = Date.now() }) {
  const s = { attempts: 0, correct: 0, ...(stat || {}) };
  const clean = ok && !hint;
  s.attempts += 1;
  if (clean) s.correct += 1;
  s.last = now;
  s.lastOk = clean;
  // Only puzzles I have missed (or needed a hint on) enter the review queue;
  // once there, every result reschedules them.
  if (s.srs || !clean) s.srs = schedule(s.srs, clean, now);
  return s;
}

export const isDue = (stat, now = Date.now()) => !!(stat && stat.srs && stat.srs.due <= now);

export function dueIds(puzzleStats, now = Date.now()) {
  return Object.entries(puzzleStats)
    .filter(([, s]) => isDue(s, now))
    .sort((a, b) => a[1].srs.due - b[1].srs.due)
    .map(([id]) => id);
}

export function describeDue(stat, now = Date.now()) {
  if (!stat?.srs) return null;
  const ms = stat.srs.due - now;
  if (ms <= 0) return 'due now';
  if (ms < 60 * 60 * 1000) return `due in ${Math.max(1, Math.round(ms / 60000))} min`;
  if (ms < DAY) return `due in ${Math.round(ms / 3600000)} h`;
  const d = Math.round(ms / DAY);
  return `due in ${d} day${d === 1 ? '' : 's'}`;
}
