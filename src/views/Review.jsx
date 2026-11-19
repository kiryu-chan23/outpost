// Review: import a PGN or open a played game, analyse it in the engine worker,
// then walk the mistakes — graph, move list and board stay in sync. "Try again"
// hides the answer while you replay the position; "Save for practice" puts it
// in the spaced-repetition queue.
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { Chess } from 'chess.js';
import { Board } from '../components/Board.jsx';
import { Icon } from '../components/Icon.jsx';
import { MoveList, ReplayBar, useReplayKeys } from '../components/MoveList.jsx';
import { EvalGraph } from '../components/EvalGraph.jsx';
import { ClockChart } from '../components/ClockChart.jsx';
import { clockReport, fmtSecs } from '../lib/clock.js';
import { scanSummary } from '../lib/blundercheck.js';
import { guideSteps, punishments, lessonsOf, threatBefore } from '../lib/guide.js';
import { ACADEMY_ID } from '../lib/insights.js';
import { themeLabel } from '../data/themes.js';
import { Workspace, Dialog, Note, Line, Seg, EngineGate, toast, fmtDateTime, fmtDate } from '../components/ui.jsx';
import { useStore, update, getState, getGame, saveGame, deleteGame, listGames, newId, logActivity, storageStatus } from '../lib/store.js';
import { batch, onBatch, startBatch, cancelBatch, unreviewed } from '../lib/batch.js';
import { parsePgn, buildPgn, replay, sideName, cgColor, opp, playUci } from '../lib/chessx.js';
import { analyseGame, judgeAttempt, REVIEW_DEPTH, CLASS_LABEL, CLASS_MARK, keyMoments } from '../lib/analysis.js';
import { TAG_LABEL, TAG_THEME } from '../lib/explain.js';
import { formatScore } from '../lib/uci.js';
import { engineStatus, onEngineStatus } from '../lib/engine.js';
import { nameOpening } from '../data/openings.js';
import { saveTextFile, copyText, readFileText } from '../lib/files.js';
import { go } from '../lib/router.js';
import { dedupe, saveImported } from '../lib/gameimport.js';
import { syncAccounts } from '../lib/sync.js';
import { syncToast } from '../lib/synctoast.js';
import { finishDebrief, QUICK } from '../lib/debrief.js';
import { gameMetrics, reviewedSeries, trend, currentGoal, METRICS, fmt } from '../lib/goals.js';

/** After a debrief: this game's number for your goal next to your recent average. */
function DebriefResult({ game }) {
  const all = listGames();
  const goal = currentGoal(useStore((s) => s), all);
  const m = gameMetrics(game);
  if (!m) return null;
  const tr = trend(reviewedSeries(all), goal.metric);
  const meta = METRICS[goal.metric];
  const v = m[goal.metric];
  const ok = meta.lower ? v <= goal.target : v >= goal.target;
  return (
    <div class="goal-mini" data-testid="debrief-goal">
      <span class="eyebrow">Your goal · {meta.label.toLowerCase()}</span>
      <p>
        This game: <strong style={{ color: ok ? 'var(--turq)' : 'var(--coral)' }}>{meta.unit === '%' ? `${v}%` : v}</strong> · last 10 games {fmt(goal.metric, tr.last10)} · goal {meta.lower ? '≤' : '≥'} {fmt(goal.metric, goal.target)}
      </p>
    </div>
  );
}

function useEngineStatus() {
  const [, setN] = useState(0);
  useEffect(() => onEngineStatus(() => setN((n) => n + 1)), []);
  return engineStatus;
}

export const customIdFor = (gameId, ply) => `my-${gameId}-${ply}`;

/** Save a position from a reviewed game into the practice queue. Returns the id. */
export function savePosition(game, ply, fens, plies) {
  const rec = game.analysis.moves[ply];
  const ev = game.analysis.evals[ply];
  const id = customIdFor(game.id, ply);
  const theme = rec.tags.map((t) => TAG_THEME[t]).find(Boolean) || null;
  update((s) => {
    s.customPuzzles[id] = {
      id,
      fen: fens[ply],
      solution: [ev.best],
      line: ev.pv || [ev.best],
      ref: { cp: ev.cp, mate: ev.mate, best: ev.best },
      themes: theme ? [theme] : [],
      played: plies[ply].san,
      note: rec.text || '',
      source: { gameId: game.id, ply, label: `${game.white} – ${game.black}` },
      created: Date.now(),
    };
    if (!s.puzzleStats[id]) s.puzzleStats[id] = { attempts: 0, correct: 0, srs: { box: 0, due: Date.now(), reps: 0, lapses: 0 } };
  }, { immediate: true });
  logActivity('save', `Saved a position from ${game.white} – ${game.black}`, id);
  return id;
}

// ---- library & import ------------------------------------------------------------
function SyncLine() {
  const accounts = useStore((s) => s.settings.accounts || {});
  const log = useStore((s) => s.syncLog || {});
  const [busy, setBusy] = useState(false);
  const names = [accounts.chesscom && `${accounts.chesscom} (Chess.com)`, accounts.lichess && `${accounts.lichess} (Lichess)`].filter(Boolean);
  if (!names.length)
    return (
      <p class="small muted" style={{ marginBottom: '10px' }}>
        Add your chess.com or Lichess username on the <a class="linkish" href="#prefs" onClick={(e) => { e.preventDefault(); go('prefs'); }}>Data page</a> and new games come in by themselves.
      </p>
    );
  const run = async () => {
    setBusy(true);
    try {
      syncToast(await syncAccounts({}));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div class="row between wrap" style={{ gap: '8px', marginBottom: '10px' }}>
      <span class="small muted">
        Syncing {names.join(' and ')}
        {log.blocked ? ' — blocked in this copy, see Data' : log.lastAttempt ? ` · checked ${new Date(log.lastAttempt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}` : ''}
      </span>
      <button type="button" class="btn sm" onClick={log.blocked ? () => go('prefs') : run} disabled={busy} data-testid="review-sync">
        <Icon name="download" /> {busy ? 'Syncing…' : log.blocked ? 'Get new games' : 'Sync now'}
      </button>
    </div>
  );
}

export function ImportPanel({ onImported }) {
  const names = useStore((s) => s.settings.names);
  const [text, setText] = useState('');
  const [errors, setErrors] = useState([]);
  const [pending, setPending] = useState(null); // { games, dupes, candidates, chosen:Set, analyse }
  const [drag, setDrag] = useState(false);
  const fileRef = useRef(null);

  const parseAll = (sources) => {
    const all = [];
    const errs = [];
    for (const { name, text: t } of sources) {
      const r = parsePgn(t);
      all.push(...r.games);
      errs.push(...r.errors.map((e) => (sources.length > 1 ? `${name}: ${e}` : e)));
    }
    setErrors(errs.slice(0, 8).concat(errs.length > 8 ? [`…and ${errs.length - 8} more problems.`] : []));
    if (!all.length) return;
    const { fresh, dupes } = dedupe(all);
    // Whoever appears in most games is probably you.
    const count = {};
    for (const g of fresh) for (const n of [g.white, g.black]) if (n !== 'White' && n !== 'Black') count[n] = (count[n] || 0) + 1;
    const candidates = Object.entries(count).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const known = new Set((names || []).map((n) => n.toLowerCase()));
    const chosen = new Set(candidates.filter(([n]) => known.has(n.toLowerCase())).map(([n]) => n));
    if (!chosen.size && candidates.length && fresh.length >= 2 && candidates[0][1] >= Math.max(2, fresh.length * 0.3)) {
      // Pick the most frequent player, plus look-alike names (e.g. the same handle on another site).
      const top = candidates[0][0].toLowerCase().replace(/[^a-z]/g, '');
      for (const [n] of candidates) {
        const k = n.toLowerCase().replace(/[^a-z]/g, '');
        if (k && (k === top || (k.length >= 5 && (k.startsWith(top.slice(0, 6)) || top.startsWith(k.slice(0, 6)))))) chosen.add(n);
      }
    }
    const side = (g, set) => (set.has(g.white) ? 'w' : set.has(g.black) ? 'b' : null);
    setPending({ games: fresh.map((g) => ({ ...g, side: side(g, chosen) })), dupes, candidates, chosen, analyse: true });
  };
  const onFiles = async (files) => {
    const list = [...(files || [])].slice(0, 40);
    if (!list.length) return;
    try {
      const sources = await Promise.all(list.map(async (f) => ({ name: f.name, text: await readFileText(f) })));
      if (sources.length === 1) setText(sources[0].text.length < 200000 ? sources[0].text : '');
      parseAll(sources);
    } catch (err) {
      setErrors([err.message]);
    }
  };
  const toggleName = (n) =>
    setPending((p) => {
      const chosen = new Set(p.chosen);
      chosen.has(n) ? chosen.delete(n) : chosen.add(n);
      return { ...p, chosen, games: p.games.map((g) => ({ ...g, side: chosen.has(g.white) ? 'w' : chosen.has(g.black) ? 'b' : null })) };
    });
  const commit = () => {
    const learned = new Set(names || []);
    for (const g of pending.games) {
      if (g.side === 'w' && g.white !== 'White') learned.add(g.white);
      if (g.side === 'b' && g.black !== 'Black') learned.add(g.black);
    }
    const { ids, full, total } = saveImported(pending.games);
    const games = { length: total };
    update((s) => (s.settings.names = [...learned].slice(-12)));
    logActivity('import', `Imported ${ids.length} game${ids.length === 1 ? '' : 's'}`, ids[ids.length - 1]);
    const analyse = pending.analyse && ids.length > 1;
    setPending(null);
    setText('');
    setErrors(full ? [`Storage is full: ${ids.length} of ${games.length} games were imported. Delete old games or export a backup and start fresh.`] : []);
    toast(`Imported ${ids.length} game${ids.length === 1 ? '' : 's'}${analyse ? ' — analysing in the background' : ''}`);
    if (analyse) startBatch(ids.slice().reverse());
    if (ids.length === 1) onImported(ids[0]);
  };

  const p = pending;
  const withSide = p ? p.games.filter((g) => g.side).length : 0;
  return (
    <div
      class={`panel pad stack${drag ? ' dropping' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); onFiles(e.dataTransfer.files); }}
    >
      <div>
        <h3>Import games</h3>
        <p class="muted small" style={{ marginTop: '4px' }}>
          Paste PGN, choose one or more .pgn files, or drop them here. On chess.com: Archive → select games → Download; on Lichess: your profile → Export games. Duplicates are skipped.
        </p>
      </div>
      <div class="field">
        <label for="pgn-text">PGN</label>
        <textarea id="pgn-text" class="textarea" value={text} placeholder={'[White "Me"]\n[Black "Opponent"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bc4 …'} spellcheck={false} aria-describedby="pgn-errors" aria-invalid={errors.length > 0} onInput={(e) => { setText(e.currentTarget.value); if (errors.length) setErrors([]); }} />
      </div>
      <div id="pgn-errors" aria-live="polite">
        {errors.length ? (
          <Note kind="bad" title={errors.length === 1 ? 'That PGN couldn’t be imported' : 'Some games couldn’t be imported'}>
            <ul style={{ margin: '4px 0 0', paddingLeft: '18px' }}>
              {errors.map((e, i) => (
                <li key={i} class="small">{e}</li>
              ))}
            </ul>
          </Note>
        ) : null}
      </div>
      <div class="btn-row">
        <button type="button" class="btn primary" data-testid="import-pgn" onClick={() => parseAll([{ name: 'pasted text', text }])}>
          <Icon name="upload" /> Import
        </button>
        <button type="button" class="btn" onClick={() => fileRef.current.click()}>
          Choose .pgn files
        </button>
        <input ref={fileRef} type="file" multiple accept=".pgn,.txt,text/plain,application/x-chess-pgn" class="sr-only" tabIndex={-1} aria-label="Choose PGN files" data-testid="pgn-files" onChange={(e) => { onFiles(e.currentTarget.files); e.currentTarget.value = ''; }} />
      </div>
      {p && !p.games.length ? (
        <Dialog title="Nothing new to import" onClose={() => setPending(null)} actions={<button type="button" class="btn primary" onClick={() => setPending(null)}>OK</button>}>
          <p class="muted">All {p.dupes} game{p.dupes === 1 ? ' is' : 's are'} already in your library.</p>
        </Dialog>
      ) : null}
      {p && p.games.length === 1 ? (
        <Dialog title="Which side were you?" onClose={() => setPending(null)} actions={<><button type="button" class="btn" onClick={() => setPending(null)}>Cancel</button><button type="button" class="btn primary" data-testid="confirm-import" onClick={commit}>Import and review</button></>}>
          <p class="muted small" style={{ marginBottom: '14px' }}>Feedback is written for your side, and your stats only count your moves. The name you pick is remembered for next time.</p>
          <div class="field">
            <span class="label">{p.games[0].white} vs {p.games[0].black} · {p.games[0].result} · {Math.ceil(p.games[0].moves.length / 2)} moves</span>
            <Seg label="Your side" value={p.games[0].side || 'n'} onChange={(v) => setPending((q) => ({ ...q, games: [{ ...q.games[0], side: v === 'n' ? null : v }] }))} options={[{ value: 'w', label: `White (${p.games[0].white.slice(0, 14)})` }, { value: 'b', label: `Black (${p.games[0].black.slice(0, 14)})` }, { value: 'n', label: 'Neither' }]} />
          </div>
        </Dialog>
      ) : null}
      {p && p.games.length > 1 ? (
        <Dialog title={`Import ${p.games.length} games`} onClose={() => setPending(null)} actions={<><button type="button" class="btn" onClick={() => setPending(null)}>Cancel</button><button type="button" class="btn primary" data-testid="confirm-import" onClick={commit}>Import {p.games.length} games</button></>}>
          {p.dupes ? <p class="small muted" style={{ marginBottom: '10px' }}>{p.dupes} duplicate{p.dupes === 1 ? '' : 's'} skipped.</p> : null}
          <div class="field">
            <span class="label">Which player is you?</span>
            <div class="stack tight">
              {p.candidates.map(([n, c]) => (
                <label key={n} class="row" style={{ gap: '10px', minHeight: '40px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={p.chosen.has(n)} onChange={() => toggleName(n)} style={{ width: '20px', height: '20px' }} />
                  <span class="grow"><strong>{n}</strong> <span class="small muted">in {c} game{c === 1 ? '' : 's'}</span></span>
                </label>
              ))}
            </div>
            <span class="small muted">{withSide} of {p.games.length} games will be reviewed from your side. Games without you are kept as model games.</span>
          </div>
          <label class="row" style={{ gap: '10px', minHeight: '40px', cursor: 'pointer', marginTop: '8px' }}>
            <input type="checkbox" checked={p.analyse} onChange={() => setPending((q) => ({ ...q, analyse: !q.analyse }))} style={{ width: '20px', height: '20px' }} />
            <span>Analyse them in the background (quick depth, about {Math.max(1, Math.round(p.games.length / 80))} min). You can keep using the app meanwhile.</span>
          </label>
        </Dialog>
      ) : null}
    </div>
  );
}

function BatchPanel() {
  const b = useBatch();
  useStore((s) => s.gameOrder);
  const todo = unreviewed().length;
  if (!b.running && !todo) return null;
  if (b.running) {
    const total = b.ids.length;
    const pct = Math.round(((b.done + (b.currentPlies ? b.currentPly / b.currentPlies : 0)) / Math.max(1, total)) * 100);
    return (
      <div class="panel pad stack" data-testid="batch-panel">
        <div class="row between">
          <h3>Analysing your games</h3>
          <span class="small muted mono">{Math.min(b.done + 1, total)} / {total}</span>
        </div>
        <p class="small muted" style={{ margin: 0 }}>{b.current ? `Now: ${b.current.label}` : 'Starting the engine…'} · runs in the background while you use the app.</p>
        <div class="progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Batch analysis progress">
          <i style={{ width: `${pct}%` }} />
        </div>
        <div>
          <button type="button" class="btn sm" onClick={cancelBatch} data-testid="cancel-batch">
            <Icon name="stop" /> Stop (keeps finished games)
          </button>
        </div>
      </div>
    );
  }
  return (
    <div class="panel pad row between wrap" style={{ gap: '12px' }}>
      <span>
        <strong>{todo} game{todo === 1 ? '' : 's'} not reviewed yet.</strong> <span class="small muted">Analysing them fills Insights with your own mistakes.</span>
      </span>
      <button type="button" class="btn primary" onClick={() => startBatch()} data-testid="start-batch">
        Analyse all {todo}
      </button>
    </div>
  );
}

export function useBatch() {
  const [, setN] = useState(0);
  useEffect(() => onBatch(() => setN((n) => n + 1)), []);
  return batch;
}

const userResult = (g) => {
  if (!g.userColor || g.result === '*') return { tag: g.result === '*' ? '…' : g.result === '1/2-1/2' ? '½' : g.result, cls: '', word: g.result === '*' ? 'Unfinished' : g.result };
  if (g.result === '1/2-1/2') return { tag: '½', cls: '', word: 'Draw' };
  const won = (g.result === '1-0') === (g.userColor === 'w');
  return { tag: won ? 'W' : 'L', cls: won ? 'win' : 'loss', word: won ? 'Win' : 'Loss' };
};
export function GameRow({ game, onOpen, onDelete }) {
  const r = userResult(game);
  const acc = game.analysis && game.userColor ? game.analysis.accuracy[game.userColor] : null;
  return (
    <li>
      <div class="row" style={{ gap: '4px' }}>
        <button type="button" class="list-row grow" onClick={() => onOpen(game.id)}>
          <span class={`result-tag ${r.cls}`} aria-hidden="true">{r.tag}</span>
          <span class="grow">
            <span class="title">{game.white} – {game.black}</span>
            <span class="meta" style={{ display: 'block' }}>
              {r.word} · {game.opening || 'Opening unknown'} · {Math.ceil(game.moves.length / 2)} moves · {game.created % 1000 === 1 ? fmtDate(game.created) : fmtDateTime(game.created)}
            </span>
          </span>
          {game.analysis ? <span class="chip turq">{acc != null ? `${Math.round(acc)}% accuracy` : 'Reviewed'}</span> : <span class="chip amber">Not reviewed</span>}
        </button>
        {onDelete ? (
          <button type="button" class="btn ghost icon" aria-label={`Delete game ${game.white} versus ${game.black}`} onClick={() => onDelete(game)}>
            <Icon name="trash" />
          </button>
        ) : null}
      </div>
    </li>
  );
}

function Library({ onOpen }) {
  useStore((s) => s.gameOrder);
  const all = listGames();
  const [del, setDel] = useState(null);
  const [filter, setFilter] = useState('all');
  const [limit, setLimit] = useState(40);
  const games = all.filter((g) => (filter === 'todo' ? !g.analysis : filter === 'mine' ? !!g.userColor : filter === 'losses' ? g.userColor && ((g.result === '1-0' && g.userColor === 'b') || (g.result === '0-1' && g.userColor === 'w')) : true));
  return (
    <div class="page">
      <div class="page-head">
        <div>
          <div class="eyebrow">Review</div>
          <h1 style={{ marginTop: '10px' }}>Find the move that <em>cost you</em></h1>
          <p>Open a game you played here or import one. The engine marks turning points, missed tactics and blunders, and you replay them until the right move sticks.</p>
        </div>
      </div>
      <div style={{ marginBottom: '18px' }}>
        <BatchPanel />
      </div>
      <div class="grid-2" style={{ alignItems: 'start' }}>
        <ImportPanel onImported={onOpen} />
        <div class="panel pad">
          <div class="panel-title">
            <h3>Your games</h3>
            <span class="small muted">{all.length} saved</span>
          </div>
          <SyncLine />
          {all.length > 6 ? (
            <div style={{ marginBottom: '10px' }}>
              <Seg label="Show" value={filter} onChange={(v) => { setFilter(v); setLimit(40); }} options={[{ value: 'all', label: 'All' }, { value: 'mine', label: 'Mine' }, { value: 'losses', label: 'Losses' }, { value: 'todo', label: 'Not reviewed' }]} />
            </div>
          ) : null}
          {all.length && !games.length ? <p class="small muted">No games match this filter.</p> : null}
          {games.length ? (
            <>
            <ul class="list">
              {games.slice(0, limit).map((g) => (
                <GameRow key={g.id} game={g} onOpen={onOpen} onDelete={setDel} />
              ))}
            </ul>
            {games.length > limit ? (
              <button type="button" class="btn sm" style={{ marginTop: '10px' }} onClick={() => setLimit(limit + 40)}>
                Show more ({games.length - limit} left)
              </button>
            ) : null}
            </>
          ) : all.length ? null : (
            <div class="empty">
              <strong>No games yet</strong>
              Play a game against the computer or import a PGN, and it will show up here ready to review.
              <div>
                <button type="button" class="btn primary" onClick={() => go('play')}>Play a game</button>
              </div>
            </div>
          )}
        </div>
      </div>
      {del ? (
        <Dialog title="Delete this game?" onClose={() => setDel(null)} actions={<><button type="button" class="btn" onClick={() => setDel(null)}>Keep it</button><button type="button" class="btn danger" onClick={() => { deleteGame(del.id); setDel(null); toast('Game deleted'); }}>Delete</button></>}>
          <p class="muted">{del.white} – {del.black}, {Math.ceil(del.moves.length / 2)} moves. Positions you saved from it stay in your practice queue.</p>
        </Dialog>
      ) : null}
    </div>
  );
}

// ---- one game --------------------------------------------------------------------
const ArrowKey = ({ threat }) => (
  <p class="small muted arrow-key" style={{ margin: 0 }}>
    <span><i style={{ background: 'var(--coral)' }} />your move</span>
    <span><i style={{ background: 'var(--amber)' }} />their best answer</span>
    <span><i style={{ background: 'var(--turq)' }} />the better move</span>
    {threat ? <span><i style={{ background: 'var(--amber)', opacity: 0.5 }} />the threat you missed</span> : null}
  </p>
);

function GameReview({ id, startPly, startRetry, startDebrief, onBack }) {
  const settings = useStore((s) => s.settings);
  const customs = useStore((s) => s.customPuzzles);
  const status = useEngineStatus();
  const [game, setGame] = useState(() => getGame(id));
  const data = useMemo(() => replay(game.startFen, game.moves), [game.id]);
  const total = data.plies.length;
  const [ply, setPly] = useState(() => (startPly != null ? Math.min(total, startPly + 1) : 0));
  const [orientation, setOrientation] = useState(cgColor(game.userColor || 'w'));
  const [progress, setProgress] = useState(null); // { done, total }
  const [failed, setFailed] = useState(null);
  const [preview, setPreview] = useState(null); // { fen, lastMove, label }
  const [retry, setRetry] = useState(null); // { ply, state, msg, tries }
  const [tab, setTab] = useState('coach');
  const [rev, setRev] = useState(0);
  const [flash, setFlash] = useState(null);
  const [guide, setGuide] = useState(null); // guided review: { i, phase, verdict, tryFen, tryMove, results }
  const [threats, setThreats] = useState({}); // ply -> threat before that move | false | 'loading'
  const abortRef = useRef(null);
  const an = game.analysis;
  const [quick, setQuick] = useState(!!startDebrief); // debrief: just the moments that mattered most
  const steps = useMemo(() => (an ? guideSteps(game, quick ? QUICK : 5) : []), [an, quick]);
  const fullSteps = useMemo(() => (an ? guideSteps(game, 5).length : 0), [an]);
  const autoRef = useRef(false);
  const debriefRef = useRef(false);
  const punish = useMemo(() => (an ? punishments(game) : null), [an]);
  const guideStep = guide && guide.i < steps.length ? steps[guide.i] : null;

  const run = (depthKey = settings.reviewDepth) => {
    if (abortRef.current) abortRef.current.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setFailed(null);
    setProgress({ done: 0, total: data.fens.length });
    analyseGame(game, { depth: REVIEW_DEPTH[depthKey] || 13, signal: ac.signal, onProgress: (done, tot) => setProgress({ done, total: tot }) })
      .then((report) => {
        if (ac.signal.aborted) return;
        setProgress(null);
        if (!report) return;
        const next = { ...game, analysis: report };
        saveGame(next);
        setGame(next);
        logActivity('review', `Reviewed ${game.white} – ${game.black}`, game.id);
        // Jump to the costliest moment for my side.
        const first = keyMoments(next, next.userColor)[0];
        if (first && ply === 0) setPly(first.ply + 1);
      })
      .catch((e) => {
        if (ac.signal.aborted) return;
        setProgress(null);
        setFailed(e.message || String(e));
      });
  };
  const cancel = () => {
    if (abortRef.current) abortRef.current.abort();
    setProgress(null);
  };
  useEffect(() => {
    if (!game.analysis) run();
    return () => abortRef.current && abortRef.current.abort();
  }, []);
  useEffect(() => {
    if (startRetry && an && startPly != null) beginRetry(startPly);
  }, []);

  const select = (n) => {
    setPreview(null);
    setRetry(null);
    setGuide(null);
    setPly(Math.max(0, Math.min(total, n)));
  };
  useReplayKeys(ply, total, select, !retry && !guide);

  const rec = an && ply > 0 ? an.moves[ply - 1] : null;
  const played = ply > 0 ? data.plies[ply - 1] : null;
  const flagged = rec && (rec.cls === 'inaccuracy' || rec.cls === 'mistake' || rec.cls === 'blunder');
  const evBefore = an && ply > 0 ? an.evals[ply - 1] : null;
  const mine = played && (!game.userColor || played.color === game.userColor);
  const savedId = played ? customIdFor(game.id, ply - 1) : null;
  const isSaved = savedId && !!customs[savedId];

  // -- threat before a mistake (computed on demand, cached per ply)
  const threatPly = guide && guideStep && guide.phase === 'explain' ? guideStep.ply : !guide && !retry && !preview && flagged && mine && game.userColor ? ply - 1 : null;
  useEffect(() => {
    if (threatPly == null || progress || threats[threatPly] !== undefined) return undefined;
    const ac = new AbortController();
    setThreats((t) => ({ ...t, [threatPly]: 'loading' }));
    threatBefore(data.fens[threatPly], data.plies[threatPly].color, { signal: ac.signal })
      .then((t) => !ac.signal.aborted && setThreats((x) => ({ ...x, [threatPly]: t || false })))
      .catch(() => setThreats((x) => ({ ...x, [threatPly]: false })));
    return () => {
      ac.abort();
      setThreats((x) => (x[threatPly] === 'loading' ? (({ [threatPly]: _, ...rest }) => rest)(x) : x));
    };
  }, [threatPly, !!progress]);
  const threatAt = (p) => (threats[p] && threats[p] !== 'loading' ? threats[p] : null);
  // Arrows for a mistake at ply p: my move (coral), their best answer (amber), the better move (turquoise), the threat I missed (faint amber).
  const arrowsFor = (p) => {
    const out = [];
    const t = threatAt(p);
    const reply = an.evals[p + 1] && an.evals[p + 1].best;
    if (t && t.uci !== reply) out.push({ orig: t.from, dest: t.to, brush: 'threat' });
    out.push({ orig: data.plies[p].from, dest: data.plies[p].to, brush: 'coral' });
    if (reply) out.push({ orig: reply.slice(0, 2), dest: reply.slice(2, 4), brush: 'amber' });
    const best = an.evals[p].best;
    if (best && best !== data.plies[p].uci) out.push({ orig: best.slice(0, 2), dest: best.slice(2, 4), brush: 'turq' });
    return out;
  };

  // -- guided review
  const startGuide = () => {
    if (!steps.length) return;
    setRetry(null);
    setPreview(null);
    setOrientation(cgColor(game.userColor));
    setGuide({ i: 0, phase: 'ask', verdict: null, tryFen: null, tryMove: null, results: [] });
    setTab('coach');
  };
  const onGuideMove = async (move) => {
    const i = guide.i;
    const p = guideStep.ply;
    const fen = data.fens[p];
    const uci = move.from + move.to + (move.promotion || '');
    const c = new Chess(fen);
    const m = playUci(c, uci);
    if (!m) {
      setRev((n) => n + 1);
      return;
    }
    if (uci === data.plies[p].uci) {
      setFlash({ kind: 'bad', key: Date.now() });
      setGuide((g) => ({ ...g, phase: 'explain', verdict: { ok: false, same: true, san: m.san }, tryFen: null }));
      return;
    }
    setGuide((g) => ({ ...g, phase: 'checking', tryFen: c.fen(), tryMove: [m.from, m.to] }));
    const v = await judgeAttempt(fen, uci, an.evals[p], { depth: 12 }).catch(() => null);
    setFlash({ kind: v && v.ok ? 'good' : 'bad', key: Date.now() });
    setGuide((g) => (g && g.i === i ? { ...g, phase: 'explain', verdict: v ? { ok: v.ok, exact: v.exact, san: m.san, after: v.after } : { ok: false, unknown: true, san: m.san }, tryFen: null } : g));
  };
  // A debrief starts by itself once the analysis is there.
  useEffect(() => {
    if (!startDebrief || !an || autoRef.current) return;
    autoRef.current = true;
    if (steps.length) startGuide();
    else finishDebrief(game.id, 0, 0);
  }, [an, steps.length]);
  useEffect(() => {
    if (!guide || guide.phase !== 'done' || debriefRef.current) return;
    const pending = (getState().debriefs || {})[game.id];
    if (!quick && !(pending && !pending.done)) return;
    debriefRef.current = true;
    finishDebrief(game.id, guide.results.filter(Boolean).length, steps.length);
  }, [guide && guide.phase]);
  const fullGuide = () => {
    setQuick(false);
    setGuide({ i: 0, phase: 'ask', verdict: null, tryFen: null, tryMove: null, results: [] });
  };

  const guideNext = () =>
    setGuide((g) => ({ ...g, i: g.i + 1, phase: g.i + 1 < steps.length ? 'ask' : 'done', results: [...g.results, !!(g.verdict && g.verdict.ok)], verdict: null, tryFen: null }));

  // -- try again
  const beginRetry = (p) => {
    setPreview(null);
    setPly(p + 1);
    setOrientation(cgColor(data.plies[p].color));
    setRetry({ ply: p, state: 'idle', msg: null, tries: 0 });
    setTab('coach');
  };
  const onRetryMove = async (move) => {
    const p = retry.ply;
    const fen = data.fens[p];
    const uci = move.from + move.to + (move.promotion || '');
    const c = new Chess(fen);
    const m = playUci(c, uci);
    if (!m) {
      setRev((n) => n + 1);
      return;
    }
    if (uci === data.plies[p].uci) {
      setFlash({ kind: 'bad', key: Date.now() });
      setRetry((r) => ({ ...r, state: 'wrong', tries: r.tries + 1, msg: `${m.san} is what you played in the game. Look for something different.` }));
      setRev((n) => n + 1);
      return;
    }
    setRetry((r) => ({ ...r, state: 'checking', tryFen: c.fen(), tryMove: [m.from, m.to] }));
    const verdict = await judgeAttempt(fen, uci, an.evals[p], { depth: 12 }).catch(() => null);
    if (!verdict) {
      setRetry((r) => (r ? { ...r, state: 'idle', tryFen: null, msg: 'The engine couldn’t check that move. Try it again.' } : r));
      return;
    }
    if (verdict.ok) {
      setFlash({ kind: 'good', key: Date.now() });
      setRetry((r) => (r ? { ...r, state: 'right', tries: r.tries + 1, msg: verdict.exact ? `${m.san} — exactly the engine’s move.` : `${m.san} works too: it keeps the evaluation where it was.` } : r));
    } else {
      setFlash({ kind: 'bad', key: Date.now() });
      setRetry((r) => (r ? { ...r, state: 'wrong', tries: r.tries + 1, tryFen: null, msg: `${m.san} still gives ground (${verdict.after ? formatScore(verdict.after) : 'worse'} after it). Have another look.` } : r));
      setRev((n) => n + 1);
    }
  };

  const save = (p) => {
    savePosition(game, p, data.fens, data.plies);
    toast('Saved — it will come up in Tactics → My mistakes');
  };

  const copyPgn = async () => toast((await copyText(buildPgn(game))) ? 'PGN copied to the clipboard' : 'Copy was blocked by the browser');
  const savePgn = async () => {
    const r = await saveTextFile(`${game.white}-vs-${game.black}.pgn`.replace(/[^\w.-]+/g, '_'), buildPgn(game), 'application/x-chess-pgn');
    if (r === 'saved') toast('PGN saved');
    else if (r === 'unavailable') copyPgn();
  };

  // -- board state
  let boardFen = data.fens[ply];
  let lastMove = played ? [played.from, played.to] : null;
  let interactive = false;
  let shapes = [];
  let movable;
  if (guide && guideStep) {
    const p = guideStep.ply;
    boardFen = guide.tryFen || data.fens[p];
    lastMove = guide.tryFen ? guide.tryMove : p > 0 ? [data.plies[p - 1].from, data.plies[p - 1].to] : null;
    interactive = guide.phase === 'ask';
    movable = game.userColor;
    if (guide.phase === 'explain') shapes = arrowsFor(p);
  } else if (guide) {
    boardFen = data.fens[total];
  } else if (retry) {
    boardFen = retry.tryFen || data.fens[retry.ply];
    lastMove = retry.tryFen ? retry.tryMove : retry.ply > 0 ? [data.plies[retry.ply - 1].from, data.plies[retry.ply - 1].to] : null;
    interactive = retry.state === 'idle' || retry.state === 'wrong';
    movable = data.plies[retry.ply].color;
    if (retry.state === 'shown') {
      const b = an.evals[retry.ply].best;
      shapes = [{ orig: b.slice(0, 2), dest: b.slice(2, 4), brush: 'turq' }];
    }
  } else if (preview) {
    boardFen = preview.fen;
    lastMove = preview.lastMove;
  } else if (flagged && evBefore && evBefore.best && evBefore.best !== played.uci) {
    shapes = arrowsFor(ply - 1);
  }

  const pickLine = (baseFen) => (tok) => setPreview({ fen: tok.fen, lastMove: [tok.uci.slice(0, 2), tok.uci.slice(2, 4)], label: tok.san, baseFen });

  // -- coach panel
  let coach;
  if (progress) {
    const pct = Math.round((progress.done / progress.total) * 100);
    coach = (
      <div class="stack" data-testid="analysis-progress">
        <Note kind="info" title={status.state === 'loading' ? 'Starting the engine…' : `Analysing move ${Math.max(0, progress.done - 1)} of ${progress.total - 1}`}>
          <p>The engine runs in the background, so you can step through the game while it works.</p>
        </Note>
        <div class="progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Analysis progress">
          <i style={{ width: `${pct}%` }} />
        </div>
        <div class="row between">
          <span class="small muted mono">{pct}%</span>
          <button type="button" class="btn sm" onClick={cancel} data-testid="cancel-analysis">
            <Icon name="stop" /> Cancel analysis
          </button>
        </div>
      </div>
    );
  } else if (!an) {
    coach = (
      <div class="stack">
        <EngineGate status={status} />
        {failed ? <Note kind="bad" title="Analysis stopped"><p>{failed}</p></Note> : <Note kind="info" title="This game hasn’t been analysed"><p>Analysis finds the turning points and explains them. It takes roughly ten to forty seconds.</p></Note>}
        <div class="field">
          <span class="label">Depth</span>
          <Seg label="Analysis depth" value={settings.reviewDepth} onChange={(v) => update((s) => (s.settings.reviewDepth = v))} options={[{ value: 'quick', label: 'Quick' }, { value: 'standard', label: 'Standard' }, { value: 'deep', label: 'Deep' }]} />
        </div>
        <button type="button" class="btn primary big" onClick={() => run()} data-testid="analyse">
          Analyse this game
        </button>
      </div>
    );
  } else if (guide) {
    const n = steps.length;
    if (guide.phase === 'done') {
      const found = guide.results.filter(Boolean).length;
      const lessons = lessonsOf(game);
      coach = (
        <div class="stack" data-testid="guide-done">
          {quick ? <DebriefResult game={game} found={found} n={n} /> : null}
          <Note kind={found === n ? 'good' : 'info'} title={quick ? `Debrief done — you found ${found} of ${n}` : `Guided review done — you found ${found} of ${n}`} pop>
            <p>{found === n ? 'You found the better move every time. The problem in this game was seeing it at the board — blunder check helps with that.' : 'Save the moments you missed for practice; they come back in Tactics until they stick.'}</p>
          </Note>
          {punish && punish.chances ? (
            <p class="small" style={{ margin: 0 }}>
              Your opponent made {punish.chances} serious mistake{punish.chances === 1 ? '' : 's'}; you punished {punish.punished}.
            </p>
          ) : null}
          {lessons.length ? (
            <div class="stack tight">
              <div class="eyebrow">What this game teaches</div>
              {lessons.slice(0, 3).map((l) => (
                <div key={l.theme} class="insight">
                  <div>
                    <h4>{themeLabel(l.theme)}</h4>
                    <p>{l.labels.join(', ')} — {l.count} time{l.count === 1 ? '' : 's'} in this game.</p>
                  </div>
                  <div class="btn-row" style={{ justifyContent: 'flex-end' }}>
                    <button type="button" class="btn sm" onClick={() => go('learn', { topic: ACADEMY_ID[l.theme] || l.theme })}>Lesson</button>
                    <button type="button" class="btn sm primary" onClick={() => go('tactics', { mode: 'theme', theme: l.theme, label: themeLabel(l.theme) })}>Practise</button>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
          <div class="btn-row">
            {quick && fullSteps > n ? (
              <button type="button" class="btn primary" onClick={fullGuide} data-testid="debrief-full">
                Full guided review ({fullSteps} moments)
              </button>
            ) : null}
            <button type="button" class="btn" onClick={startGuide}><Icon name="retry" /> Go through it again</button>
            <button type="button" class="btn ghost" onClick={() => { setGuide(null); setPly(0); }}>Back to the review</button>
            {quick ? <button type="button" class="btn ghost" onClick={() => go('home')}>Home</button> : null}
          </div>
        </div>
      );
    } else {
      const st = guideStep;
      const p = st.ply;
      const moveNo = `${Math.floor(p / 2) + 1}${data.plies[p].color === 'w' ? '.' : '…'}`;
      const prev = p > 0 ? data.plies[p - 1] : null;
      const t = threatAt(p);
      const v = guide.verdict;
      const reply = an.evals[p + 1] && an.evals[p + 1].best;
      coach = (
        <div class="stack" data-testid="guide-panel">
          <div class="row between">
            <span class="eyebrow">{quick ? 'Debrief' : 'Guided review'} · moment {guide.i + 1} of {n}</span>
            <span class={`chip ${st.kind === 'punish' ? 'amber' : 'coral'}`}>{st.kind === 'punish' ? 'Missed chance' : CLASS_LABEL[st.cls] || 'Mistake'}</span>
          </div>
          {guide.phase === 'ask' || guide.phase === 'checking' ? (
            <>
              <Note kind="info" title={`Move ${moveNo} — what would you play?`}>
                <p>
                  {st.kind === 'punish'
                    ? `Your opponent just played ${prev ? prev.san : 'a move'}, and it was a mistake. Can you punish it? Make your move on the board.`
                    : `${prev ? `Your opponent just played ${prev.san}. ` : ''}This is where the game turned. Take your time — checks, captures and threats for both sides — then make your move.`}
                </p>
              </Note>
              {guide.phase === 'checking' ? <Note kind="info" title="Checking your move…" /> : null}
              <div class="btn-row">
                <button type="button" class="btn" onClick={() => setGuide((g) => ({ ...g, phase: 'explain', verdict: { skipped: true }, tryFen: null }))} disabled={guide.phase === 'checking'} data-testid="guide-skip">
                  <Icon name="eye" /> I don’t know — show me
                </button>
                <button type="button" class="btn ghost" onClick={() => setGuide(null)}>
                  Exit guided review
                </button>
              </div>
            </>
          ) : (
            <>
              {v && !v.skipped ? (
                v.ok ? (
                  <Note kind="good" title={v.exact ? `${v.san} — exactly right` : `${v.san} works`} pop>
                    <p>{v.exact ? 'That’s the engine’s move.' : 'It holds the position as well as the engine’s choice.'} In the game you played {data.plies[p].san}.</p>
                  </Note>
                ) : v.same ? (
                  <Note kind="bad" title={`${v.san} is what you played in the game`} pop>
                    <p>Same move, same problem. Here’s why it doesn’t work.</p>
                  </Note>
                ) : (
                  <Note kind="bad" title={`${v.san} isn’t it`} pop>
                    <p>{v.unknown ? 'The engine couldn’t check it.' : `It still gives ground (${v.after ? formatScore(v.after) : 'worse'} after it).`} In the game you played {data.plies[p].san}.</p>
                  </Note>
                )
              ) : null}
              <Note kind="warn" title={`What went wrong with ${moveNo} ${data.plies[p].san}`}>
                {t ? (
                  <p data-testid="guide-threat">
                    <strong>{t.text}</strong>
                  </p>
                ) : threats[p] === 'loading' ? (
                  <p class="small muted">Looking for the threat…</p>
                ) : null}
                <p>{st.text || `The engine preferred ${st.bestSan || 'another move'}.`}</p>
                <div style={{ marginTop: '8px' }}>
                  <ArrowKey threat={!!(t && t.uci !== reply)} />
                </div>
              </Note>
              {an.evals[p].pv && an.evals[p].pv.length ? (
                <div class="stack tight">
                  <div class="eyebrow">The better line</div>
                  <Line fen={data.fens[p]} pv={an.evals[p].pv} max={8} label="Engine line" />
                </div>
              ) : null}
              <div class="btn-row">
                <button type="button" class="btn primary" onClick={guideNext} data-testid="guide-next" autoFocus>
                  {guide.i + 1 < n ? 'Next moment' : 'Finish'} <Icon name="arrow" />
                </button>
                {v && !v.ok && !v.skipped ? (
                  <button type="button" class="btn" onClick={() => setGuide((g) => ({ ...g, phase: 'ask', verdict: null }))}>
                    <Icon name="retry" /> Try another move
                  </button>
                ) : null}
                {customs[customIdFor(game.id, p)] ? (
                  <span class="chip turq">
                    <Icon name="check" size={14} /> In your practice queue
                  </span>
                ) : (
                  <button type="button" class="btn" onClick={() => save(p)} data-testid="guide-save">
                    <Icon name="bookmark" /> Save for practice
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      );
    }

  } else if (retry) {
    const p = retry.ply;
    const who = sideName(data.plies[p].color);
    const done = retry.state === 'right' || retry.state === 'shown';
    coach = (
      <div class="stack" data-testid="retry-panel">
        <Note kind="warn" title={`Try again — ${who} to move`}>
          <p>
            In the game you played <strong class="mono">{Math.floor(p / 2) + 1}{data.plies[p].color === 'w' ? '.' : '…'} {data.plies[p].san}</strong>. The better move is hidden. Find it on the board.
          </p>
        </Note>
        {retry.state === 'checking' ? <Note kind="info" title="Checking your move…" /> : null}
        {retry.state === 'wrong' ? <Note kind="bad" title="Not quite" pop key={retry.tries}><p>{retry.msg}</p></Note> : null}
        {retry.state === 'idle' && retry.msg ? <Note kind="info" title={retry.msg} /> : null}
        {retry.state === 'right' ? <Note kind="good" title="That’s the one" pop><p>{retry.msg}</p></Note> : null}
        {retry.state === 'shown' ? (
          <Note kind="info" title={`The engine’s move: ${an.moves[p].bestSan || ''}`}>
            {an.moves[p].text ? <p>{an.moves[p].text}</p> : null}
            <div style={{ marginTop: '8px' }}><Line fen={data.fens[p]} pv={an.evals[p].pv} max={8} /></div>
          </Note>
        ) : null}
        <div class="btn-row">
          {!done ? (
            <button type="button" class="btn" onClick={() => setRetry((r) => ({ ...r, state: 'shown', tryFen: null }))} data-testid="show-answer">
              <Icon name="eye" /> Show the answer
            </button>
          ) : null}
          {done ? (
            <button type="button" class="btn" onClick={() => setRetry({ ply: p, state: 'idle', msg: null, tries: 0 })}>
              <Icon name="retry" /> Once more
            </button>
          ) : null}
          {customs[customIdFor(game.id, p)] ? (
            <span class="chip turq"><Icon name="check" size={14} /> In your practice queue</span>
          ) : (
            <button type="button" class={`btn${done ? ' primary' : ''}`} onClick={() => save(p)} data-testid="save-practice">
              <Icon name="bookmark" /> Save for practice
            </button>
          )}
          <button type="button" class="btn ghost" onClick={() => { setRetry(null); setOrientation(cgColor(game.userColor || 'w')); }}>
            Back to the review
          </button>
        </div>
      </div>
    );
  } else if (preview) {
    coach = (
      <div class="stack">
        <Note kind="info" title={`Previewing the line after ${preview.label}`}>
          <p>This position isn’t from the game.</p>
          <button type="button" class="btn sm" style={{ marginTop: '8px' }} onClick={() => setPreview(null)}>Back to the game</button>
        </Note>
      </div>
    );
  } else if (ply === 0) {
    const acc = an.accuracy;
    const who = game.userColor;
    const km = keyMoments(game, who);
    coach = (
      <div class="stack" data-testid="review-summary">
        <div class="grid-2" style={{ gap: '10px' }}>
          {['w', 'b'].map((c) => (
            <div key={c} class="stat">
              <div class="eyebrow">{c === 'w' ? game.white : game.black}{who === c ? ' (you)' : ''}</div>
              <div class="v">{acc[c] != null ? `${Math.round(acc[c])}%` : '–'}</div>
              <div class="s">accuracy · {an.counts[c].blunder} blunder{an.counts[c].blunder === 1 ? '' : 's'}, {an.counts[c].mistake} mistake{an.counts[c].mistake === 1 ? '' : 's'}</div>
            </div>
          ))}
        </div>
        {steps.length ? (
          <div class="stack tight">
            <button type="button" class="btn primary big" onClick={startGuide} data-testid="start-guide">
              Start guided review · {steps.length} moment{steps.length === 1 ? '' : 's'} <Icon name="arrow" />
            </button>
            <p class="small muted" style={{ margin: 0 }}>You see each key position and choose your move before anything is revealed.</p>
          </div>
        ) : null}
        {punish && punish.chances ? (
          <Note kind={punish.missed.length ? 'warn' : 'good'} title={`Chances your opponent gave you: ${punish.chances} · you took ${punish.punished}`}>
            {punish.missed.length ? (
              <p>
                Missed:{' '}
                {punish.missed.map((m, i) => (
                  <span key={m.ply}>
                    {i ? ', ' : ''}
                    <button type="button" class="linkish" onClick={() => select(m.ply + 1)} data-testid="missed-chance">
                      {Math.floor(m.ply / 2) + 1}
                      {data.plies[m.ply].color === 'w' ? '.' : '…'} {data.plies[m.ply].san}
                    </button>
                  </span>
                ))}
                . Each time they had just made a mistake, and your reply let it go.
              </p>
            ) : (
              <p>Every time they slipped, you made them pay.</p>
            )}
          </Note>
        ) : null}
        {km.length ? (
          <button type="button" class={`btn${steps.length ? '' : ' primary big'}`} onClick={() => select(km[0].ply + 1)} data-testid="go-critical">
            Go to the critical mistake <Icon name="arrow" />
          </button>
        ) : (

          <Note kind="good" title="No serious mistakes found"><p>{who ? 'Your moves held up at this depth.' : 'Neither side made a serious mistake at this depth.'}</p></Note>
        )}
      </div>
    );
  } else {
    const kind = rec.cls === 'blunder' ? 'bad' : rec.cls === 'mistake' ? 'bad' : rec.cls === 'inaccuracy' ? 'warn' : 'good';
    const moveLabel = `${Math.floor((ply - 1) / 2) + 1}${played.color === 'w' ? '.' : '…'} ${played.san}`;
    coach = (
      <div class="stack" data-testid="move-feedback">
        <Note kind={kind} title={`${moveLabel}${CLASS_MARK[rec.cls] ? ' ' + CLASS_MARK[rec.cls] : ''} — ${CLASS_LABEL[rec.cls]}`}>
          <div class="row wrap" style={{ gap: '6px', margin: '2px 0 6px' }}>
            {rec.turning ? <span class="chip amber">Turning point</span> : null}
            {rec.missed ? <span class="chip coral">Missed tactic</span> : null}
            {rec.tags.filter((t) => TAG_LABEL[t]).slice(0, 2).map((t) => <span key={t} class="chip">{TAG_LABEL[t]}</span>)}
            <span class="chip mono">{formatScore(an.evals[ply - 1])} → {formatScore(an.evals[ply])}</span>
          </div>
          {flagged ? <p data-testid="explanation">{rec.text}</p> : <p>{rec.cls === 'best' ? 'This is the engine’s first choice.' : 'A reasonable move — it keeps the evaluation steady.'}</p>}
          {flagged && mine && game.userColor && threatAt(ply - 1) ? <p data-testid="threat-note" style={{ marginTop: '6px' }}><strong>{threatAt(ply - 1).text}</strong></p> : null}
          {flagged && evBefore && evBefore.best && evBefore.best !== played.uci ? <div style={{ marginTop: '8px' }}><ArrowKey threat={!!(mine && threatAt(ply - 1) && threatAt(ply - 1).uci !== an.evals[ply].best)} /></div> : null}
        </Note>
        {flagged && evBefore && evBefore.pv && evBefore.pv.length ? (
          <div class="stack tight">
            <div class="eyebrow">Better line</div>
            <Line fen={data.fens[ply - 1]} pv={evBefore.pv} max={8} onPick={pickLine(data.fens[ply - 1])} label="Engine line from before the move" />
            {an.evals[ply].pv && an.evals[ply].pv.length ? (
              <>
                <div class="eyebrow" style={{ marginTop: '6px' }}>What happens after {played.san}</div>
                <Line fen={data.fens[ply]} pv={an.evals[ply].pv} max={8} onPick={pickLine(data.fens[ply])} label="Engine line after the move" />
              </>
            ) : null}
          </div>
        ) : null}
        {flagged ? (
          <div class="btn-row">
            <button type="button" class="btn primary" onClick={() => beginRetry(ply - 1)} data-testid="try-again">
              <Icon name="retry" /> Try again
            </button>
            {isSaved ? (
              <span class="chip turq"><Icon name="check" size={14} /> In your practice queue</span>
            ) : (
              <button type="button" class="btn" onClick={() => save(ply - 1)} data-testid="save-practice">
                <Icon name="bookmark" /> Save for practice
              </button>
            )}
          </div>
        ) : null}
        {flagged && !mine ? <p class="small muted">This was your opponent’s move — it shows what you could have punished.</p> : null}
      </div>
    );
  }

  const marks = an ? an.moves : null;
  const evalText = an ? an.moves.map((_, i) => formatScore(an.evals[i + 1])) : null;
  const movesSection = (
    <div class="stack tight">
      <div style={{ maxHeight: '34dvh', overflow: 'hidden', display: 'flex' }}>
        <MoveList plies={data.plies} current={retry ? retry.ply : ply} onSelect={select} marks={marks} startFen={game.startFen} evalText={evalText} />
      </div>
      <ReplayBar current={ply} total={total} onSelect={select}>
        <button type="button" class="btn icon" aria-label="Flip board" onClick={() => setOrientation((o) => (o === 'white' ? 'black' : 'white'))}>
          <Icon name="flip" />
        </button>
      </ReplayBar>
      <p class="small dim">← → step through moves · Home / End jump to the start or finish</p>
    </div>
  );

  const km = an ? keyMoments(game, null) : [];
  const momentsSection = (
    <div class="stack tight">
      {an ? (
        km.length ? (
          <ul class="list">
            {km.slice(0, 12).map((m) => {
              const p = data.plies[m.ply];
              const isMine = !game.userColor || p.color === game.userColor;
              return (
                <li key={m.ply}>
                  <button type="button" class="list-row" onClick={() => { select(m.ply + 1); setTab('coach'); }}>
                    <span class={`result-tag ${m.cls === 'blunder' || m.cls === 'mistake' ? 'loss' : ''}`} aria-hidden="true">{CLASS_MARK[m.cls] || '!'}</span>
                    <span class="grow">
                      <span class="title mono">{Math.floor(m.ply / 2) + 1}{p.color === 'w' ? '.' : '…'} {p.san}</span>
                      <span class="meta" style={{ display: 'block' }}>
                        {CLASS_LABEL[m.cls]}{m.turning ? ' · turning point' : ''}{m.missed ? ' · missed tactic' : ''} · {isMine && game.userColor ? 'you' : sideName(p.color)}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p class="muted small">No mistakes, blunders or turning points at this depth.</p>
        )
      ) : (
        <p class="muted small">Key moments appear here once the game is analysed.</p>
      )}
      <div class="btn-row" style={{ marginTop: '6px' }}>
        <button type="button" class="btn sm" onClick={copyPgn}><Icon name="copy" /> Copy PGN</button>
        <button type="button" class="btn sm" onClick={savePgn}><Icon name="download" /> Save .pgn</button>
        {an && !progress ? <button type="button" class="btn sm ghost" onClick={() => run()}>Re-analyse</button> : null}
      </div>
    </div>
  );

  const hideEval = retry || (guide && guide.phase !== 'explain' && guide.phase !== 'done');
  const graph = an && !hideEval ? <EvalGraph evals={an.evals} moves={an.moves} plies={data.plies} current={ply} onSelect={select} userColor={game.userColor} /> : hideEval ? (
    <div class="graph"><div class="graph-head"><span>The evaluation is hidden while you choose your move.</span></div></div>
  ) : (
    <div class="graph"><div class="graph-head"><span>{progress ? 'The evaluation graph appears when analysis finishes.' : 'No evaluation yet.'}</span></div></div>
  );

  // -- clock & blunder-check sections
  const clk = useMemo(() => clockReport(game), [game.id, !!game.analysis]);
  const scans = game.checks && game.checks.length ? scanSummary(game.checks) : null;
  const clockSection = clk || scans ? (
    <div class="stack" data-testid="clock-section">
      {clk ? (
        <>
          <p class="small" style={{ margin: 0 }}>
            You used <strong>{fmtSecs(clk.total)}</strong> over {clk.moves.length} moves · average <strong>{fmtSecs(clk.avg)}</strong> a move{clk.longest ? <> · longest think {fmtSecs(clk.longest.spent)} on move {Math.floor(clk.longest.ply / 2) + 1}</> : null}.
          </p>
          <ClockChart report={clk} current={ply} onSelect={select} />
          {clk.sinks.length ? (
            <Note kind="warn" title="Time sinks">
              <p>
                {clk.sinks.map((m, i) => (
                  <span key={m.ply}>
                    {i ? '; ' : ''}
                    <button type="button" class="linkish" onClick={() => select(m.ply + 1)}>move {Math.floor(m.ply / 2) + 1}</button> took {fmtSecs(m.spent)}
                  </span>
                ))}
                {' '}— long thinks on moves the engine rates as routine. Save that time for positions with a tactic in the air.
              </p>
            </Note>
          ) : null}
          {clk.lowTime ? (
            <Note kind={clk.lowBlunders ? 'bad' : 'info'} title={`${clk.lowTime} move${clk.lowTime === 1 ? '' : 's'} with under ${fmtSecs(clk.lowLine)} left`}>
              <p>{game.analysis ? (clk.lowBlunders ? `${clk.lowBlunders} of your ${clk.allBlunders} mistakes and blunders came in that time trouble.` : 'No mistakes or blunders in that time trouble.') : 'Analyse the game to see how many mistakes came in time trouble.'}</p>
            </Note>
          ) : null}
        </>
      ) : null}
      {scans ? (
        <Note kind={scans.hung ? 'warn' : 'good'} title="Blunder check">
          <p>{scans.right} of {scans.scans} scans right. {scans.hung ? `${scans.hung} move${scans.hung === 1 ? '' : 's'} left something hanging${scans.hungAfterWrong ? `, ${scans.hungAfterWrong} of them after a wrong scan` : ''}.` : 'No move left a piece hanging.'}</p>
        </Note>
      ) : null}
    </div>
  ) : null;

  return (
    <Workspace
      eyebrow={`${game.opening || 'Game'} · ${game.result}`}
      title={`${game.white} – ${game.black}`}
      headRight={<button type="button" class="btn sm" onClick={onBack}>All games</button>}
      strips={an && !hideEval ? 150 : 50}
      tab={tab}
      onTab={setTab}
      board={<Board fen={boardFen} orientation={orientation} interactive={interactive} movableColor={movable} lastMove={lastMove} shapes={shapes} onMove={guide ? onGuideMove : onRetryMove} coords={settings.coords} autoQueen={settings.autoQueen} rev={rev} flash={flash} label="Review board" />}
      below={graph}
      sections={[
        { id: 'coach', label: 'Coach', heading: false, content: coach },
        { id: 'moves', label: 'Moves', content: movesSection },
        { id: 'moments', label: 'Key moments', content: momentsSection },
        ...(clockSection ? [{ id: 'clock', label: 'Clock', content: clockSection }] : []),
      ]}
    />
  );
}

export function Review({ params }) {
  const reviewId = useStore((s) => s.ui.reviewId);
  const id = params?.id || reviewId;
  const game = id ? getGame(id) : null;
  const open = (gid) => {
    update((s) => (s.ui.reviewId = gid), { immediate: true });
    go('review', { id: gid });
  };
  if (!game) return <Library onOpen={open} />;
  return <GameReview key={`${game.id}:${params?.ply ?? ''}:${params?.retry ? 'r' : ''}:${params?.debrief ? 'd' : ''}`} id={game.id} startPly={params?.ply} startRetry={params?.retry} startDebrief={!!params?.debrief} onBack={() => { update((s) => (s.ui.reviewId = null), { immediate: true }); go('review'); }} />;
}
