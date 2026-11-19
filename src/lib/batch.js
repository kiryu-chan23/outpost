// Background batch analysis: works through every unreviewed game one at a
// time in the engine worker, saving each as it finishes. It keeps running
// while you use other screens; cancelling keeps what is already done.
import { analyseGame, REVIEW_DEPTH } from './analysis.js';
import { getGame, saveGame, listGames, logActivity } from './store.js';

export const batch = { running: false, ids: [], done: 0, failed: 0, current: null, currentPly: 0, currentPlies: 0, startedAt: 0, finishedAt: 0, lastError: null };
const listeners = new Set();
let ac = null;
const emit = () => listeners.forEach((l) => l());
export function onBatch(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export const unreviewed = () => listGames().filter((g) => !g.analysis && g.moves.length >= 2);

/** Analyse the given game ids (default: every unreviewed game, newest first). */
export async function startBatch(ids = unreviewed().map((g) => g.id), { depth = 'quick' } = {}) {
  if (batch.running) {
    // Add to the running queue instead of starting a second one.
    for (const id of ids) if (!batch.ids.includes(id)) batch.ids.push(id);
    emit();
    return;
  }
  if (!ids.length) return;
  ac = new AbortController();
  Object.assign(batch, { running: true, ids: ids.slice(), done: 0, failed: 0, current: null, startedAt: Date.now(), finishedAt: 0, lastError: null });
  emit();
  for (let i = 0; i < batch.ids.length; i++) {
    if (ac.signal.aborted) break;
    const g = getGame(batch.ids[i]);
    if (!g || g.analysis) {
      batch.done++;
      continue;
    }
    batch.current = { id: g.id, label: `${g.white} – ${g.black}` };
    batch.currentPly = 0;
    batch.currentPlies = g.moves.length + 1;
    emit();
    try {
      const report = await analyseGame(g, {
        depth: REVIEW_DEPTH[depth] || 10,
        signal: ac.signal,
        onProgress: (d, t) => {
          batch.currentPly = d;
          batch.currentPlies = t;
          emit();
        },
      });
      if (ac.signal.aborted || !report) break;
      // Re-read in case the game changed (e.g. was opened and analysed meanwhile).
      const fresh = getGame(g.id);
      if (fresh && !fresh.analysis) saveGame({ ...fresh, analysis: report });
      batch.done++;
    } catch (e) {
      if (ac.signal.aborted) break;
      batch.failed++;
      batch.done++;
      batch.lastError = String((e && e.message) || e);
    }
    emit();
  }
  const finished = batch.done;
  Object.assign(batch, { running: false, current: null, finishedAt: Date.now() });
  if (finished) logActivity('review', `Batch-analysed ${finished - batch.failed} game${finished - batch.failed === 1 ? '' : 's'}`);
  emit();
}

export function cancelBatch() {
  if (ac) ac.abort();
}
