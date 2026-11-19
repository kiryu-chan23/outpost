// Data & settings: export/import of all training data, board preferences,
// engine status and licences.
import { useEffect, useRef, useState } from 'preact/hooks';
import { Icon } from '../components/Icon.jsx';
import { Dialog, Note, Seg, Switch, toast, fmtDateTime } from '../components/ui.jsx';
import { useStore, update, exportAll, readExport, applyImport, resetAll, storageUsage, storageStatus } from '../lib/store.js';
import { saveTextFile, copyText, readFileText } from '../lib/files.js';
import { engines, engineStatus, onEngineStatus } from '../lib/engine.js';
import { AccountsPanel } from './Accounts.jsx';

export function Prefs() {
  const settings = useStore((s) => s.settings);
  const counts = useStore((s) => ({ games: s.gameOrder.length, attempts: s.attempts.length, saved: Object.keys(s.customPuzzles).length, lines: Object.keys(s.repertoire).length, lessons: Object.values(s.lessonProgress).filter((p) => p.done).length }));
  const [, setN] = useState(0);
  useEffect(() => onEngineStatus(() => setN((n) => n + 1)), []);
  const [pasted, setPasted] = useState('');
  const [pending, setPending] = useState(null); // { data, summary }
  const [error, setError] = useState(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [exportText, setExportText] = useState(null);
  const fileRef = useRef(null);
  const store = storageStatus();
  const kb = Math.round(storageUsage() / 1024);

  const doExport = async () => {
    const text = exportAll();
    const r = await saveTextFile(`outpost-training-${new Date().toISOString().slice(0, 10)}.json`, text, 'application/json');
    if (r === 'saved') toast('Training data exported');
    else {
      setExportText(text);
      if (await copyText(text)) toast('Downloads are blocked here — the export was copied to the clipboard');
    }
  };
  const check = (text) => {
    const r = readExport(text);
    if (!r.ok) {
      setError(r.error);
      setPending(null);
      return;
    }
    setError(null);
    setPending(r);
  };
  const onFile = async (e) => {
    const f = e.currentTarget.files && e.currentTarget.files[0];
    e.currentTarget.value = '';
    if (!f) return;
    try {
      check(await readFileText(f));
    } catch (err) {
      setError(err.message);
    }
  };
  const apply = (mode) => {
    applyImport(pending.data, mode);
    toast(mode === 'replace' ? 'Training data replaced' : 'Training data merged');
    setPending(null);
    setPasted('');
  };

  return (
    <div class="page">
      <div class="page-head">
        <div>
          <div class="eyebrow">Data & settings</div>
          <h1 style={{ marginTop: '10px' }}>Your data stays in this browser</h1>
          <p>Games, reviews, puzzle history, saved positions, repertoire, lessons and settings are kept in this browser’s local storage and survive reloads. Export a backup now and then — clearing site data or switching browsers starts from zero.</p>
        </div>
      </div>
      {!store.ok ? (
        <Note kind="bad" title="Storage is blocked in this browser">
          <p>Progress only lasts until the tab closes. Export before you leave.</p>
        </Note>
      ) : null}

      <div style={{ marginBottom: '18px' }}>
        <AccountsPanel />
      </div>

      <div class="grid-2" style={{ alignItems: 'start' }}>
        <section class="panel pad stack" aria-labelledby="h-backup">
          <div class="panel-title" style={{ marginBottom: 0 }}>
            <h3 id="h-backup">Back up & restore</h3>
            <span class="small muted mono">{kb} KB used</span>
          </div>
          <p class="small muted">
            {counts.games} games · {counts.attempts} puzzle attempts · {counts.saved} saved positions · {counts.lines} repertoire lines · {counts.lessons} lessons finished
          </p>
          <div class="btn-row">
            <button type="button" class="btn primary" onClick={doExport} data-testid="export-data">
              <Icon name="download" /> Export training data
            </button>
            <button type="button" class="btn" onClick={() => fileRef.current.click()}>
              <Icon name="upload" /> Import a backup file
            </button>
            <input ref={fileRef} type="file" accept=".json,application/json" class="sr-only" tabIndex={-1} aria-label="Choose a backup file" onChange={onFile} />
          </div>
          {exportText ? (
            <div class="field">
              <label for="export-text">Your export (select all and copy if the clipboard was blocked)</label>
              <textarea id="export-text" class="textarea mono" style={{ fontSize: '12px' }} readOnly value={exportText} onFocus={(e) => e.currentTarget.select()} />
            </div>
          ) : null}
          <div class="field">
            <label for="import-text">…or paste a backup</label>
            <textarea id="import-text" class="textarea mono" style={{ fontSize: '12px', minHeight: '90px' }} value={pasted} placeholder='{"app":"outpost", …}' onInput={(e) => setPasted(e.currentTarget.value)} />
            <div>
              <button type="button" class="btn sm" disabled={!pasted.trim()} onClick={() => check(pasted)} data-testid="check-import">
                Check backup
              </button>
            </div>
          </div>
          {error ? (
            <Note kind="bad" title="That backup can’t be imported">
              <p>{error}</p>
            </Note>
          ) : null}
          <hr style={{ border: 0, borderTop: '1px solid var(--line)', margin: '4px 0' }} />
          <div>
            <button type="button" class="btn danger" onClick={() => setConfirmReset(true)}>
              <Icon name="trash" /> Delete all training data
            </button>
          </div>
        </section>

        <section class="panel pad stack" aria-labelledby="h-settings">
          <h3 id="h-settings">Board & review</h3>
          <Switch checked={settings.coords} onChange={(v) => update((s) => (s.settings.coords = v))} hint="Files and ranks along the board edge.">
            Show coordinates
          </Switch>
          <Switch checked={settings.autoQueen} onChange={(v) => update((s) => (s.settings.autoQueen = v))} hint="Skip the promotion picker and always make a queen.">
            Auto-queen
          </Switch>
          <div class="field">
            <span class="label">Review depth</span>
            <Seg label="Review depth" value={settings.reviewDepth} onChange={(v) => update((s) => (s.settings.reviewDepth = v))} options={[{ value: 'quick', label: 'Quick' }, { value: 'standard', label: 'Standard' }, { value: 'deep', label: 'Deep' }]} />
            <span class="small muted">Deeper finds more but takes longer (roughly 10s / 30s / 90s for a 40-move game).</span>
          </div>
          <div class="field">
            <span class="label">Names that are you (for PGN imports)</span>
            {settings.names?.length ? (
              <div class="row wrap" style={{ gap: '6px' }}>
                {settings.names.map((n) => (
                  <button key={n} type="button" class="chip" style={{ cursor: 'pointer', minHeight: '32px' }} aria-label={`Forget the name ${n}`} onClick={() => update((s) => (s.settings.names = s.settings.names.filter((x) => x !== n)))}>
                    {n} <Icon name="x" size={12} />
                  </button>
                ))}
              </div>
            ) : (
              <span class="small muted">None yet — pick your side when importing and the name is remembered.</span>
            )}
            <form class="row" style={{ gap: '8px', marginTop: '6px' }} onSubmit={(e) => { e.preventDefault(); const v = e.currentTarget.elements.newname.value.trim(); if (v) { update((s) => (s.settings.names = [...new Set([...(s.settings.names || []), v])])); e.currentTarget.reset(); } }}>
              <input name="newname" class="input" style={{ flex: 1 }} placeholder="Add a username" aria-label="Add a username" autocapitalize="off" spellcheck={false} />
              <button type="submit" class="btn sm">Add</button>
            </form>
          </div>
          <h3 style={{ marginTop: '6px' }}>Engine</h3>
          <p class="small muted">
            {engineStatus.state === 'ready' ? `${engineStatus.flavour.label} — running in a background worker.` : engineStatus.state === 'loading' ? 'Starting…' : engineStatus.state === 'failed' ? `Failed to start: ${engineStatus.error}` : 'Starts the first time you play or analyse.'}
          </p>
          {engineStatus.state !== 'ready' && engineStatus.state !== 'loading' ? (
            <div>
              <button type="button" class="btn sm" onClick={() => engines.analyst.init().catch(() => {})}>
                Start the engine now
              </button>
            </div>
          ) : null}
          <h3 style={{ marginTop: '6px' }}>Credits & licences</h3>
          <p class="small muted">
            Outpost is free software under the GPL-3.0. Chess rules: chess.js (BSD-2-Clause). Board: chessground (GPL-3.0). Engine: Stockfish 19 via stockfish.js (GPL-3.0; licence text ships in engine/COPYING.txt). Pieces: Colin M.L. Burnett’s set (GPLv2+), recoloured. Fonts: Inter, Fraunces, JetBrains Mono (SIL Open Font License). Puzzles were mined from engine self-play and verified with Stockfish; lessons and notes are original.
          </p>
        </section>
      </div>

      {pending ? (
        <Dialog
          title="Import this backup?"
          onClose={() => setPending(null)}
          actions={
            <>
              <button type="button" class="btn" onClick={() => setPending(null)}>Cancel</button>
              <button type="button" class="btn" onClick={() => apply('merge')} data-testid="import-merge">Merge with what’s here</button>
              <button type="button" class="btn danger" onClick={() => apply('replace')}>Replace everything</button>
            </>
          }
        >
          <p class="muted">
            {pending.summary.games} games{pending.summary.skipped ? ` (${pending.summary.skipped} damaged and skipped)` : ''}, {pending.summary.puzzles} puzzle records, {pending.summary.saved} saved positions, {pending.summary.lines} repertoire lines
            {pending.summary.exportedAt ? `, exported ${fmtDateTime(Date.parse(pending.summary.exportedAt))}` : ''}.
          </p>
          <p class="small muted" style={{ marginTop: '8px' }}>Merge keeps everything here and adds what’s new; for the same item the more recent record wins.</p>
        </Dialog>
      ) : null}
      {confirmReset ? (
        <Dialog
          title="Delete all training data?"
          onClose={() => setConfirmReset(false)}
          actions={
            <>
              <button type="button" class="btn" onClick={() => setConfirmReset(false)}>Keep my data</button>
              <button type="button" class="btn danger" onClick={() => { resetAll(); setConfirmReset(false); toast('All training data deleted'); }}>
                Delete everything
              </button>
            </>
          }
        >
          <p class="muted">Games, reviews, puzzle history, saved positions, repertoire and settings in this browser are removed. This can’t be undone — export first if you might want it back.</p>
        </Dialog>
      ) : null}
    </div>
  );
}
