import { Component } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { Icon } from './components/Icon.jsx';
import { Toasts, copyTextSafe } from './components/ui.jsx';
import { useRoute, go } from './lib/router.js';
import { useStore, storageStatus, getState, update } from './lib/store.js';
import { dueIds } from './lib/srs.js';
import { useBatch } from './views/Review.jsx';
import { loadLibrary } from './lib/puzzles.js';
import { syncAccounts, autoSyncDue, liveSyncDue } from './lib/sync.js';
import { onAnalysedGame } from './lib/batch.js';
import { debriefHook, pendingDebriefs } from './lib/debrief.js';
import { syncToast } from './lib/synctoast.js';
import { Home } from './views/Home.jsx';
import { Play } from './views/Play.jsx';
import { Review } from './views/Review.jsx';
import { Tactics } from './views/Tactics.jsx';
import { Learn } from './views/Learn.jsx';
import { Repertoire, seedRepertoire } from './views/Repertoire.jsx';
import { Insights } from './views/Insights.jsx';
import { Prefs } from './views/Prefs.jsx';

const NAV = [
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'play', label: 'Play', icon: 'play' },
  { id: 'review', label: 'Review', icon: 'review' },
  { id: 'tactics', label: 'Tactics', icon: 'tactics' },
  { id: 'learn', label: 'Learn', icon: 'learn' },
  { id: 'repertoire', label: 'Openings', icon: 'repertoire' },
  { id: 'insights', label: 'Insights', icon: 'insights' },
  { id: 'prefs', label: 'Data', icon: 'prefs' },
];
const VIEWS = { home: Home, play: Play, review: Review, tactics: Tactics, learn: Learn, repertoire: Repertoire, insights: Insights, prefs: Prefs };
const MOBILE_MAIN = ['home', 'play', 'review', 'tactics'];

// Anything that escapes a view is recorded here and shown on screen instead of a blank page.
export const errorLog = [];
if (typeof window !== 'undefined') {
  window.addEventListener('error', (e) => {
    if (/ResizeObserver loop/.test(e.message || '')) return; // harmless browser notice
    errorLog.push(`${e.message} @ ${e.filename || ''}:${e.lineno || ''}`);
  });
  window.addEventListener('unhandledrejection', (e) => errorLog.push(`unhandled: ${(e.reason && (e.reason.stack || e.reason.message)) || e.reason}`));
}

class ViewBoundary extends Component {
  constructor() {
    super();
    this.state = { error: null };
  }
  componentDidCatch(error) {
    errorLog.push(`${error && error.stack ? error.stack : error}`);
    this.setState({ error });
  }
  render({ children, route }, { error }) {
    if (!error) return children;
    const details = [`Outpost ${__BUILD__} · ${route} · ${navigator.userAgent}`, String(error && error.stack ? error.stack : error), ...errorLog.slice(-5)].join('\n\n');
    return (
      <div class="page" role="alert" data-testid="view-error">
        <div class="page-head">
          <div>
            <div class="eyebrow">Something broke</div>
            <h1 style={{ marginTop: '10px' }}>This screen hit an error</h1>
            <p>Your saved data is fine. Try again, or go home. If it keeps happening, copy the details and send them over so it can be fixed.</p>
          </div>
        </div>
        <pre class="note bad mono small" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxHeight: '40dvh', overflow: 'auto', padding: '14px' }}>{details}</pre>
        <div class="btn-row" style={{ marginTop: '14px' }}>
          <button type="button" class="btn primary" onClick={() => this.setState({ error: null })}>Try again</button>
          <button type="button" class="btn" onClick={() => copyTextSafe(details)}>Copy error details</button>
          {route === 'play' && getState().current ? (
            <button type="button" class="btn danger" onClick={() => { update((st) => (st.current = null)); this.setState({ error: null }); }}>
              Discard the game in progress
            </button>
          ) : null}
          <button type="button" class="btn ghost" onClick={() => { this.setState({ error: null }); go('home'); }}>Go home</button>
        </div>
      </div>
    );
  }
}

function BatchPill({ onOpen, route }) {
  const b = useBatch();
  if (!b.running || route === 'review') return null;
  return (
    <button type="button" class="batch-pill" onClick={onOpen} aria-live="polite">
      <i aria-hidden="true" />
      Analysing {Math.min(b.done + 1, b.ids.length)} / {b.ids.length}
    </button>
  );
}

function DebriefPill({ route }) {
  const debriefs = useStore((s) => s.debriefs);
  const list = pendingDebriefs({ debriefs });
  if (!list.length || route === 'review' || route === 'home') return null;
  const d = list[0];
  return (
    <button type="button" class="batch-pill debrief-pill" onClick={() => go('review', { id: d.id, debrief: 1 })} data-testid="debrief-pill">
      <i aria-hidden="true" />
      Debrief ready · vs {d.opp}
    </button>
  );
}

function NavButton({ item, current, badge, onPick }) {
  return (
    <a class="nav-item" href={`#${item.id}`} aria-current={current === item.id ? 'page' : undefined} onClick={(e) => { e.preventDefault(); onPick(item.id); }}>
      <Icon name={item.icon} />
      <span>{item.label}</span>
      {badge ? <span class="nav-badge" aria-label={`${badge} due`}>{badge}</span> : null}
    </a>
  );
}

export function App() {
  const nav = useRoute();
  const stats = useStore((s) => s.puzzleStats);
  const [more, setMore] = useState(false);
  const due = dueIds(stats).length;
  const store = storageStatus();
  const View = VIEWS[nav.route] || Home;
  const pick = (id) => {
    setMore(false);
    go(id);
  };
  useEffect(() => {
    seedRepertoire();
    loadLibrary().catch(() => {});
    // Pull new games from chess.com / Lichess shortly after opening, at most every few hours.
    const due = () => autoSyncDue(getState()) || liveSyncDue(getState());
    const t = setTimeout(() => {
      if (due()) syncAccounts({ quiet: true }).then(syncToast).catch(() => {});
    }, 1500);
    // While open, keep watching for finished games so each one gets a debrief soon after.
    const iv = setInterval(() => {
      if (liveSyncDue(getState())) syncAccounts({ quiet: true }).then(syncToast).catch(() => {});
    }, 60 * 1000);
    const off = onAnalysedGame((g) => debriefHook(g));
    return () => {
      clearTimeout(t);
      clearInterval(iv);
      off();
    };
  }, []);
  useEffect(() => {
    document.title = `${NAV.find((n) => n.id === nav.route)?.label || 'Home'} · Outpost`;
  }, [nav.route]);

  return (
    <div class="shell">
      <nav class="rail" aria-label="Main">
        <a class="brand" href="#home" onClick={(e) => { e.preventDefault(); pick('home'); }} aria-label="Outpost home">
          <span class="brand-mark" aria-hidden="true"><i /><i /><i /><i /></span>
          <span class="brand-name">Outpost</span>
        </a>
        {NAV.map((item) => (
          <NavButton key={item.id} item={item} current={nav.route} badge={item.id === 'tactics' ? due : 0} onPick={pick} />
        ))}
      </nav>
      <main class="main" id="main">
        {!store.ok || store.error ? (
          <div class="banner" role="alert">
            {store.error === 'quota' ? 'This browser’s storage is full, so new progress may not be saved. Export your data, then delete some old games.' : 'This browser is blocking storage, so progress will be lost when you close the tab. Use Data → Export to keep a copy.'}
          </div>
        ) : null}
        <ViewBoundary key={`${nav.route}:${nav.seq}`} route={nav.route}>
          <View params={nav.params} />
        </ViewBoundary>
      </main>
      <nav class="tabbar" aria-label="Main">
        {NAV.filter((n) => MOBILE_MAIN.includes(n.id)).map((item) => (
          <NavButton key={item.id} item={item} current={nav.route} badge={item.id === 'tactics' ? due : 0} onPick={pick} />
        ))}
        <button type="button" class="nav-item" aria-expanded={more} aria-haspopup="menu" aria-current={!MOBILE_MAIN.includes(nav.route) ? 'page' : undefined} onClick={() => setMore((m) => !m)}>
          <Icon name="more" />
          <span>More</span>
        </button>
      </nav>
      {more ? (
        <div class="scrim" style={{ alignItems: 'end', zIndex: 39, paddingBottom: 'calc(var(--tabbar) + 12px)' }} onClick={() => setMore(false)}>
          <div class="dialog" role="menu" aria-label="More sections" style={{ padding: '10px' }} onClick={(e) => e.stopPropagation()}>
            {NAV.filter((n) => !MOBILE_MAIN.includes(n.id)).map((item) => (
              <button key={item.id} type="button" role="menuitem" class="list-row" aria-current={nav.route === item.id ? 'page' : undefined} onClick={() => pick(item.id)}>
                <Icon name={item.icon} size={22} />
                <span class="title">{item.label === 'Data' ? 'Data & settings' : item.label === 'Openings' ? 'Opening repertoire' : item.label === 'Learn' ? 'Lessons & drills' : item.label}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
      <BatchPill onOpen={() => pick('review')} route={nav.route} />
      <DebriefPill route={nav.route} />
      <Toasts />
    </div>
  );
}
