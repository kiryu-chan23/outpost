// Data → "Your accounts": usernames, sync now, automatic sync, and download
// links + drop zone for when this copy can't reach the sites.
import { useState } from 'preact/hooks';
import { Icon } from '../components/Icon.jsx';
import { Note, Switch, toast, fmtDateTime } from '../components/ui.jsx';
import { useStore, update } from '../lib/store.js';
import { SITES, syncAccounts, downloadLinks, syncRunning } from '../lib/sync.js';
import { copyText } from '../lib/files.js';
import { askNotifyPermission } from '../lib/debrief.js';
import { ImportPanel } from './Review.jsx';
import { go } from '../lib/router.js';
import { syncToast } from '../lib/synctoast.js';
export { syncToast };

const ago = (t) => {
  if (!t) return 'never';
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`;
  return fmtDateTime(t);
};

export function AccountsPanel() {
  const settings = useStore((s) => s.settings);
  const log = useStore((s) => s.syncLog || {});
  const accounts = settings.accounts || {};
  const sync = settings.sync || { auto: true, analyse: true };
  const [draft, setDraft] = useState({ chesscom: accounts.chesscom || '', lichess: accounts.lichess || '' });
  const [busy, setBusy] = useState(false);
  const [showDrop, setShowDrop] = useState(false);
  const [notifyState, setNotifyState] = useState(() => {
    try {
      return typeof Notification === 'undefined' ? 'unsupported' : Notification.permission;
    } catch {
      return 'unsupported';
    }
  });
  const dirty = draft.chesscom.trim() !== (accounts.chesscom || '') || draft.lichess.trim() !== (accounts.lichess || '');

  const save = () =>
    update((s) => {
      const next = { chesscom: draft.chesscom.trim(), lichess: draft.lichess.trim() };
      const log_ = { ...(s.syncLog || {}) };
      // A new name starts that site's history from scratch.
      for (const k of ['chesscom', 'lichess']) if ((s.settings.accounts || {})[k] !== next[k]) delete log_[k];
      log_.blocked = false;
      s.syncLog = log_;
      s.settings.accounts = next;
    });
  const run = async () => {
    if (dirty) save();
    setBusy(true);
    try {
      const res = await syncAccounts({});
      syncToast(res);
    } finally {
      setBusy(false);
    }
  };
  const setSync = (k, v) =>
    update((s) => {
      s.settings.sync = { ...(s.settings.sync || { auto: true, analyse: true }), [k]: v };
    });

  const links = downloadLinks({ settings: { accounts: { chesscom: draft.chesscom.trim(), lichess: draft.lichess.trim() } }, syncLog: log });
  const blocked = !!log.blocked;

  return (
    <section class="panel pad stack" aria-labelledby="h-accounts" data-testid="accounts">
      <div class="panel-title" style={{ marginBottom: 0 }}>
        <h3 id="h-accounts">Your accounts</h3>
        <span class="small muted">{log.lastAttempt ? `Last checked ${ago(log.lastAttempt)}` : 'Not synced yet'}</span>
      </div>
      <p class="small muted">New games from these accounts come in by themselves, with your side already set, and get analysed in the background — no PGN files needed.</p>
      <div class="acct-grid">
        {['chesscom', 'lichess'].map((k) => {
          const l = log[k] || {};
          return (
            <div class="field" key={k}>
              <label for={`acct-${k}`}>{SITES[k].name} username</label>
              <input
                id={`acct-${k}`}
                class="input"
                value={draft[k]}
                autocomplete="off"
                spellcheck={false}
                placeholder={k === 'lichess' ? 'e.g. ThePawnScum12' : 'e.g. ThePawnScum'}
                onInput={(e) => setDraft({ ...draft, [k]: e.currentTarget.value })}
                data-testid={`acct-${k}`}
              />
              <span class="small" style={{ color: l.error ? 'var(--coral)' : 'var(--ink-3)' }} data-testid={`acct-${k}-status`}>
                {l.error
                  ? l.kind === 'blocked'
                    ? 'Couldn’t reach the site from here.'
                    : l.error
                  : l.okAt
                    ? `Synced ${ago(l.okAt)} · ${l.added ? `${l.added} new` : 'nothing new'}${l.total ? ` · ${l.total} in all` : ''}`
                    : draft[k].trim()
                      ? 'Not synced yet'
                      : 'Leave empty to skip this site'}
              </span>
            </div>
          );
        })}
      </div>
      <div class="btn-row">
        <button type="button" class="btn primary" onClick={run} disabled={busy || syncRunning() || !(draft.chesscom.trim() || draft.lichess.trim())} data-testid="sync-now">
          <Icon name="download" /> {busy ? 'Syncing…' : 'Sync now'}
        </button>
        {dirty ? (
          <button type="button" class="btn" onClick={save}>
            Save names
          </button>
        ) : null}
      </div>
      <Switch checked={!!sync.auto} onChange={(v) => setSync('auto', v)} hint="When you open the app, at most every 3 hours.">
        Check for new games automatically
      </Switch>
      <Switch checked={sync.analyse !== false} onChange={(v) => setSync('analyse', v)} hint="Synced games are reviewed by the engine one after another while you do other things.">
        Analyse new games in the background
      </Switch>
      <Switch checked={sync.live !== false} onChange={(v) => setSync('live', v)} hint="While Outpost is open, check every few minutes. Each finished game is reviewed first and gets a one-minute debrief.">
        Watch for finished games
      </Switch>
      <Switch
        checked={!!sync.notify && notifyState === 'granted'}
        onChange={async (v) => {
          if (!v) return setSync('notify', false);
          const p = await askNotifyPermission();
          setNotifyState(p);
          setSync('notify', p === 'granted');
          if (p !== 'granted') toast(p === 'unsupported' ? 'This browser (or this copy) can’t show notifications' : 'Notifications were blocked — allow them for this site in the browser’s settings');
        }}
        hint="A browser notification when a debrief is ready and Outpost is in a background tab."
      >
        Notify me when a debrief is ready
      </Switch>

      {blocked ? (
        <div data-testid="sync-blocked">
        <Note kind="warn" title="This copy can’t reach chess.com or Lichess">
          <p>
            The preview inside the chat runs in a sandbox that blocks connections to other sites, so it can’t fetch your games itself. Run the app from the downloaded source (see the README) or host it anywhere and syncing works on its own. Until then it takes two clicks:
          </p>
          <ol class="small" style={{ margin: '8px 0 0', paddingLeft: '18px', display: 'grid', gap: '4px' }}>
            <li>Download your new games with the links below.</li>
            <li>Drop the files into the box underneath. Your side is picked from your usernames and they’re analysed in the background.</li>
          </ol>
        </Note>
        </div>
      ) : null}
      {blocked || showDrop ? (
        <div class="stack" style={{ gap: '10px' }}>
          <div class="dl-links">
            {links.map((l) => (
              <div class="dl-link" key={l.url}>
                <a class="btn sm" href={l.url} target="_blank" rel="noopener noreferrer" data-testid="dl-link">
                  <Icon name="download" /> {l.label}
                </a>
                <button
                  type="button"
                  class="btn sm ghost"
                  onClick={async () => toast((await copyText(l.url)) ? 'Link copied — paste it into a new tab' : l.url)}
                  aria-label={`Copy the link for ${l.label}`}
                >
                  Copy link
                </button>
              </div>
            ))}
          </div>
          <ImportPanel onImported={(id) => go('review', { id })} />
        </div>
      ) : (
        <button type="button" class="btn ghost sm" style={{ alignSelf: 'start' }} onClick={() => setShowDrop(true)}>
          Download links and manual import
        </button>
      )}
    </section>
  );
}
