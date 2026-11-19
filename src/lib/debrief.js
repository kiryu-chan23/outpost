// Post-game debrief: when a game you just played online has been synced and
// analysed, pick its biggest moment and offer a 60-second fix-it while the
// game is still fresh. Optional browser notification when the tab is hidden.
import { getState, update, getGame, logActivity } from './store.js';
import { guideSteps } from './guide.js';
import { gameMetrics } from './goals.js';
import { TAG_LABEL } from './explain.js';
import { replayCache } from './analysis.js';
import { toast } from '../components/ui.jsx';
import { go } from './router.js';

export const FRESH = 24 * 3600 * 1000; // games played this long ago still get a debrief
export const QUICK = 2; // moments in a debrief

const moveNo = (ply) => `${Math.floor(ply / 2) + 1}`;

/** Build a debrief record for an analysed game of mine. */
export function makeDebrief(game, now = Date.now()) {
  if (!game || !game.analysis || !game.userColor) return null;
  const steps = guideSteps(game, QUICK);
  const top = steps.slice().sort((a, b) => b.loss - a.loss)[0] || null;
  const opp = game.userColor === 'w' ? game.black : game.white;
  let headline = 'A clean game — no serious mistakes to fix.';
  let san = null;
  if (top) {
    const { plies } = replayCache(game);
    san = plies[top.ply] ? plies[top.ply].san : null;
    if (top.kind === 'punish') headline = `Missed a chance to punish their mistake on move ${moveNo(top.ply)}`;
    else {
      const tag = (top.tags || []).find((t) => TAG_LABEL[t]);
      headline = `${tag ? TAG_LABEL[tag] : top.cls === 'blunder' ? 'A blunder' : 'A mistake'} on move ${moveNo(top.ply)}${san ? ` (${san})` : ''}`;
    }
  }
  return { id: game.id, at: now, created: game.created, opp, result: game.result, steps: steps.length, top: top ? { ply: top.ply, kind: top.kind, cls: top.cls, loss: top.loss } : null, headline, metrics: gameMetrics(game), done: false, found: null };
}

/** Debriefs still waiting, newest game first. */
export function pendingDebriefs(state, now = Date.now()) {
  return Object.values(state.debriefs || {})
    .filter((d) => d && !d.done && d.steps > 0 && now - d.created < 2 * FRESH)
    .sort((a, b) => b.created - a.created);
}

function notify(d) {
  const msg = d.steps ? `Debrief ready: vs ${d.opp} — ${d.headline}` : `vs ${d.opp}: ${d.headline}`;
  toast(msg);
  const want = getState().settings.sync?.notify;
  try {
    if (want && typeof Notification !== 'undefined' && Notification.permission === 'granted' && typeof document !== 'undefined' && document.hidden) {
      const n = new Notification(d.steps ? `Game debrief: vs ${d.opp}` : `vs ${d.opp}: clean game`, { body: d.steps ? `${d.headline}. Fix it while it’s fresh — about a minute.` : d.headline, tag: `outpost-debrief-${d.id}` });
      n.onclick = () => {
        window.focus();
        go('review', { id: d.id, debrief: 1 });
        n.close();
      };
    }
  } catch {
    /* notifications are optional */
  }
}

/** Called after a game is analysed (by the batch). Creates the debrief for fresh synced games. */
export function debriefHook(game, { now = Date.now(), quiet = false } = {}) {
  if (!game || game.source !== 'sync' || !game.userColor || now - game.created > FRESH) return null;
  const s = getState();
  if ((s.debriefs || {})[game.id]) return null;
  const d = makeDebrief(game, now);
  if (!d) return null;
  update((st) => {
    const all = { ...(st.debriefs || {}), [d.id]: d };
    // Keep the most recent 40.
    const keep = Object.values(all).sort((a, b) => b.created - a.created).slice(0, 40);
    st.debriefs = Object.fromEntries(keep.map((x) => [x.id, x]));
  });
  if (!quiet) notify(d);
  return d;
}

export function finishDebrief(id, found, total) {
  update((s) => {
    const d = (s.debriefs || {})[id] || makeDebrief(getGame(id));
    if (!d) return;
    s.debriefs = { ...(s.debriefs || {}), [id]: { ...d, done: true, found, total, doneAt: Date.now() } };
  });
  logActivity('review', `Debrief: found ${found} of ${total}`, id);
}

export async function askNotifyPermission() {
  try {
    if (typeof Notification === 'undefined') return 'unsupported';
    if (Notification.permission === 'granted') return 'granted';
    return await Notification.requestPermission();
  } catch {
    return 'unsupported';
  }
}
