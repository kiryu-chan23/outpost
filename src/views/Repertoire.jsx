// Opening repertoire: save lines for White and Black, write down the idea
// behind a move, and rehearse the lines from memory (the app plays the other
// side, choosing among your lines where they branch).
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { Chess } from 'chess.js';
import { Board } from '../components/Board.jsx';
import { Icon } from '../components/Icon.jsx';
import { MoveList, ReplayBar } from '../components/MoveList.jsx';
import { Workspace, Note, Seg, Dialog, toast, fmtDate } from '../components/ui.jsx';
import { useStore, update, newId, logActivity, getState } from '../lib/store.js';
import { playUci, sideName, cgColor } from '../lib/chessx.js';
import { nameOpening } from '../data/openings.js';
import { SEED_LINES } from '../data/repertoire-seed.js';
import { go } from '../lib/router.js';

const replayLine = (moves) => {
  const c = new Chess();
  const plies = [];
  const fens = [c.fen()];
  for (const san of moves) {
    const m = c.move(san);
    plies.push({ san: m.san, from: m.from, to: m.to, color: m.color });
    fens.push(c.fen());
  }
  return { plies, fens };
};
const preview = (moves, n = 8) => {
  const out = [];
  moves.slice(0, n).forEach((san, i) => out.push(i % 2 === 0 ? `${i / 2 + 1}. ${san}` : san));
  return out.join(' ') + (moves.length > n ? ' …' : '');
};

export function seedRepertoire() {
  const s = getState();
  if (s.repertoireSeeded) return;
  update((st) => {
    for (const l of SEED_LINES) if (!st.repertoire[l.id]) st.repertoire[l.id] = { ...l, notes: { ...l.notes }, created: Date.now(), updated: Date.now(), reps: 0, seeded: true };
    st.repertoireSeeded = true;
  });
}

// ---- overview ----------------------------------------------------------------------------
function Overview() {
  const lines = useStore((s) => s.repertoire);
  const [del, setDel] = useState(null);
  const all = Object.values(lines).sort((a, b) => a.name.localeCompare(b.name));
  const col = (color) => all.filter((l) => l.color === color);
  const block = (color) => {
    const ls = col(color);
    return (
      <div class="panel pad">
        <div class="panel-title">
          <h3>As {sideName(color)}</h3>
          <div class="row" style={{ gap: '8px' }}>
            <button type="button" class="btn sm" onClick={() => go('repertoire', { edit: 'new', color })}>
              <Icon name="plus" /> Add line
            </button>
            <button type="button" class="btn sm primary" disabled={!ls.length} onClick={() => go('repertoire', { rehearse: color })} data-testid={`rehearse-${color}`}>
              Rehearse
            </button>
          </div>
        </div>
        {ls.length ? (
          <ul class="list">
            {ls.map((l) => (
              <li key={l.id}>
                <div class="row" style={{ gap: '4px' }}>
                  <button type="button" class="list-row grow" onClick={() => go('repertoire', { edit: l.id })}>
                    <span class="grow">
                      <span class="title">{l.name}</span>
                      <span class="meta mono" style={{ display: 'block' }}>
                        {preview(l.moves)}
                      </span>
                      <span class="meta" style={{ display: 'block' }}>
                        {Object.keys(l.notes || {}).length} notes · {l.reps ? `rehearsed ${l.reps}× · last ${Math.round((l.lastScore ?? 0) * 100)}% · ${fmtDate(l.last)}` : 'not rehearsed yet'}
                      </span>
                    </span>
                  </button>
                  <button type="button" class="btn ghost icon" aria-label={`Rehearse ${l.name}`} title="Rehearse this line" onClick={() => go('repertoire', { rehearse: color, only: l.id })}>
                    <Icon name="play" />
                  </button>
                  <button type="button" class="btn ghost icon" aria-label={`Delete ${l.name}`} onClick={() => setDel(l)}>
                    <Icon name="trash" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div class="empty">
            <strong>No lines for {sideName(color)}</strong>
            Add the moves you want to play, with a note on the idea behind each one.
          </div>
        )}
      </div>
    );
  };
  return (
    <div class="page">
      <div class="page-head">
        <div>
          <div class="eyebrow">Opening repertoire</div>
          <h1 style={{ marginTop: '10px' }}>
            Know your first ten moves <em>cold</em>
          </h1>
          <p>Save the lines you play, note why each move is there, then rehearse: the app plays your opponent and you answer from memory. Where your lines branch, it picks a different branch each time.</p>
        </div>
      </div>
      <div class="grid-2" style={{ alignItems: 'start' }}>
        {block('w')}
        {block('b')}
      </div>
      {del ? (
        <Dialog
          title="Delete this line?"
          onClose={() => setDel(null)}
          actions={
            <>
              <button type="button" class="btn" onClick={() => setDel(null)}>Keep it</button>
              <button type="button" class="btn danger" onClick={() => { update((s) => delete s.repertoire[del.id]); setDel(null); toast('Line deleted'); }}>
                Delete
              </button>
            </>
          }
        >
          <p class="muted">{del.name} — {del.moves.length} moves and {Object.keys(del.notes || {}).length} notes.</p>
        </Dialog>
      ) : null}
    </div>
  );
}

// ---- editor ------------------------------------------------------------------------------
function Editor({ id, color: initialColor }) {
  const settings = useStore((s) => s.settings);
  const existing = useStore((s) => (id !== 'new' ? s.repertoire[id] : null));
  const [color, setColor] = useState(existing?.color || initialColor || 'w');
  const [name, setName] = useState(existing?.name || '');
  const [moves, setMoves] = useState(existing?.moves || []);
  const [notes, setNotes] = useState(existing?.notes || {});
  const [cursor, setCursor] = useState(existing ? existing.moves.length : 0);
  const [orientation, setOrientation] = useState(cgColor(existing?.color || initialColor || 'w'));
  const [rev, setRev] = useState(0);
  const [error, setError] = useState(null);
  const data = useMemo(() => replayLine(moves), [moves.join(' ')]);
  const fen = data.fens[cursor];
  const opening = nameOpening(moves, null).name;

  const onMove = (move) => {
    const c = new Chess(fen);
    const m = playUci(c, move.from + move.to + (move.promotion || ''));
    if (!m) {
      setRev((n) => n + 1);
      return;
    }
    if (moves[cursor] === m.san) {
      setCursor(cursor + 1);
      return;
    }
    const kept = moves.slice(0, cursor);
    setMoves([...kept, m.san]);
    setNotes((ns) => Object.fromEntries(Object.entries(ns).filter(([k]) => +k < cursor)));
    setCursor(cursor + 1);
  };
  const undo = () => {
    if (!moves.length) return;
    const n = moves.length - 1;
    setMoves(moves.slice(0, n));
    setNotes((ns) => Object.fromEntries(Object.entries(ns).filter(([k]) => +k < n)));
    setCursor(Math.min(cursor, n));
  };
  const save = () => {
    const mine = moves.filter((_, i) => (i % 2 === 0) === (color === 'w')).length;
    if (!mine) {
      setError(`Add at least one ${sideName(color)} move.`);
      return;
    }
    const lineId = existing?.id || newId('r');
    const label = name.trim() || opening || 'My line';
    update((s) => {
      s.repertoire[lineId] = { ...(existing || { created: Date.now(), reps: 0 }), id: lineId, color, name: label, moves, notes: Object.fromEntries(Object.entries(notes).filter(([, v]) => v && v.trim())), updated: Date.now(), seeded: false };
    });
    if (!existing) logActivity('repertoire', `Added the line “${label}”`, lineId);
    toast('Line saved');
    go('repertoire');
  };

  const sel = cursor - 1;
  const selPly = sel >= 0 ? data.plies[sel] : null;
  const panel = (
    <div class="stack" data-testid="rep-editor">
      <div class="field">
        <label for="rep-name">Name</label>
        <input id="rep-name" class="input" value={name} placeholder={opening || 'e.g. Italian Game'} onInput={(e) => setName(e.currentTarget.value)} />
      </div>
      <div class="field">
        <span class="label">I play</span>
        <Seg label="I play" value={color} onChange={(v) => { setColor(v); setOrientation(cgColor(v)); }} options={[{ value: 'w', label: 'White' }, { value: 'b', label: 'Black' }]} />
      </div>
      <p class="small muted" style={{ margin: 0 }}>Make the moves for both sides on the board. Click a move to go back to it; a different move from there replaces the rest of the line.{opening ? ` Detected: ${opening}.` : ''}</p>
      <div style={{ maxHeight: '26dvh', overflow: 'hidden', display: 'flex' }}>
        <MoveList plies={data.plies} current={cursor} onSelect={setCursor} />
      </div>
      <ReplayBar current={cursor} total={moves.length} onSelect={(n) => setCursor(Math.max(0, Math.min(moves.length, n)))}>
        <button type="button" class="btn icon" aria-label="Remove last move" title="Remove last move" onClick={undo} disabled={!moves.length}>
          <Icon name="undo" />
        </button>
      </ReplayBar>
      {selPly ? (
        <div class="field">
          <label for="rep-note">
            Idea behind {Math.floor(sel / 2) + 1}
            {selPly.color === 'w' ? '.' : '…'} {selPly.san}
          </label>
          <textarea id="rep-note" class="textarea" style={{ minHeight: '84px' }} value={notes[sel] || ''} placeholder="Why this move? What is it preparing or preventing?" onInput={(e) => { const v = e.currentTarget.value; setNotes((ns) => ({ ...ns, [sel]: v })); }} />
        </div>
      ) : (
        <p class="small muted">Select a move to write the idea behind it.</p>
      )}
      {error ? (
        <Note kind="bad" title={error} />
      ) : null}
      <div class="btn-row">
        <button type="button" class="btn primary" onClick={save} data-testid="rep-save">
          <Icon name="check" /> Save line
        </button>
        <button type="button" class="btn" onClick={() => setOrientation((o) => (o === 'white' ? 'black' : 'white'))}>
          <Icon name="flip" /> Flip
        </button>
        <button type="button" class="btn ghost" onClick={() => go('repertoire')}>
          Cancel
        </button>
      </div>
    </div>
  );
  return (
    <Workspace
      eyebrow="Opening repertoire"
      title={existing ? 'Edit line' : 'New line'}
      strips={0}
      board={<Board fen={fen} orientation={orientation} interactive lastMove={selPly ? [selPly.from, selPly.to] : null} onMove={onMove} coords={settings.coords} autoQueen={settings.autoQueen} rev={rev} label="Repertoire board" />}
      sections={[{ id: 'edit', label: 'Line', heading: false, content: panel }]}
    />
  );
}

// ---- rehearsal ---------------------------------------------------------------------------
function Rehearse({ color, only }) {
  const settings = useStore((s) => s.settings);
  const all = useStore((s) => s.repertoire);
  const pool = useMemo(() => Object.values(all).filter((l) => l.color === color && (!only || l.id === only)), [color, only]);
  const [path, setPath] = useState([]);
  const [round, setRound] = useState(0);
  const [mistakes, setMistakes] = useState(0);
  const [wrong, setWrong] = useState(null); // { tried, expected: [san], note }
  const [idea, setIdea] = useState(null); // note for the move just played
  const [flash, setFlash] = useState(null);
  const [rev, setRev] = useState(0);
  const [done, setDone] = useState(null);
  const timer = useRef(null);
  const userPlies = useRef(0);

  const data = useMemo(() => replayLine(path), [path.join(' ')]);
  const fen = data.fens[data.fens.length - 1];
  const p = path.length;
  const candidates = pool.filter((l) => l.moves.length > p && path.every((san, i) => l.moves[i] === san));
  const turn = p % 2 === 0 ? 'w' : 'b';
  const myTurn = turn === color && !wrong && !done && candidates.length > 0;
  const last = data.plies[p - 1];

  const finish = () => {
    const finished = pool.filter((l) => l.moves.length <= p && l.moves.every((san, i) => path[i] === san));
    const lines = finished.length ? finished : pool.filter((l) => path.every((san, i) => l.moves[i] === san));
    const score = userPlies.current ? Math.max(0, (userPlies.current - mistakes) / userPlies.current) : 1;
    update((s) => {
      for (const l of lines) {
        const r = s.repertoire[l.id];
        if (!r) continue;
        r.reps = (r.reps || 0) + 1;
        r.lastScore = score;
        r.last = Date.now();
      }
    });
    logActivity('repertoire', `Rehearsed ${lines[0]?.name || 'a line'} (${Math.round(score * 100)}%)`, lines[0]?.id);
    setDone({ lines, score });
  };

  // Opponent moves and the end of the line.
  useEffect(() => {
    clearTimeout(timer.current);
    if (done || wrong) return undefined;
    if (!candidates.length) {
      if (p > 0) finish();
      return undefined;
    }
    if (turn === color) return undefined;
    // Prefer the branch rehearsed least, with a little randomness.
    const weights = candidates.map((l) => 1 / (1 + (l.reps || 0)));
    let r = Math.random() * weights.reduce((a, b) => a + b, 0);
    let pick = candidates[0];
    for (let i = 0; i < candidates.length; i++) {
      r -= weights[i];
      if (r <= 0) {
        pick = candidates[i];
        break;
      }
    }
    timer.current = setTimeout(() => setPath((ps) => [...ps, pick.moves[p]]), p === 0 ? 500 : 450);
    return () => clearTimeout(timer.current);
  }, [p, round, !!wrong, !!done]);
  useEffect(() => () => clearTimeout(timer.current), []);

  const noteFor = (ply) => {
    for (const l of candidates) if (l.notes && l.notes[ply]) return l.notes[ply];
    return null;
  };

  const onMove = (move) => {
    if (!myTurn) {
      setRev((n) => n + 1);
      return;
    }
    const c = new Chess(fen);
    const m = playUci(c, move.from + move.to + (move.promotion || ''));
    if (!m) {
      setRev((n) => n + 1);
      return;
    }
    userPlies.current++;
    const expected = [...new Set(candidates.map((l) => l.moves[p]))];
    if (expected.includes(m.san)) {
      setIdea(noteFor(p) ? { san: m.san, text: noteFor(p) } : null);
      setFlash({ kind: 'good', key: Date.now() });
      setPath((ps) => [...ps, m.san]);
      return;
    }
    setMistakes((x) => x + 1);
    setFlash({ kind: 'bad', key: Date.now() });
    setWrong({ tried: m.san, expected, note: noteFor(p) });
    setIdea(null);
    setRev((n) => n + 1);
  };
  const continueAfterWrong = () => {
    const san = wrong.expected[0];
    setWrong(null);
    setIdea(wrong.note ? { san, text: wrong.note } : null);
    setPath((ps) => [...ps, san]);
  };
  const restart = () => {
    setPath([]);
    setMistakes(0);
    setWrong(null);
    setIdea(null);
    setDone(null);
    userPlies.current = 0;
    setRound((n) => n + 1);
  };

  if (!pool.length)
    return (
      <div class="page">
        <div class="empty">
          <strong>No {sideName(color)} lines to rehearse</strong>
          <div>
            <button type="button" class="btn primary" onClick={() => go('repertoire', { edit: 'new', color })}>Add a line</button>
          </div>
        </div>
      </div>
    );

  const shapes = wrong ? wrong.expected.map((san) => { const m = new Chess(fen).move(san); return { orig: m.from, dest: m.to, brush: 'turq' }; }) : [];
  const panel = (
    <div class="stack" data-testid="rehearse-panel">
      <div class="row between">
        <span class={`turn-pill${!myTurn && !done && !wrong ? ' thinking' : ''}`} aria-live="polite">
          <i />
          {done ? 'Line complete' : wrong ? 'Not your line' : myTurn ? `Your move · ${sideName(color)}` : 'Opponent moves…'}
        </span>
        <span class="small muted">{mistakes} slip{mistakes === 1 ? '' : 's'}</span>
      </div>
      {!done && !wrong && p === 0 && color === 'w' ? <p class="muted" style={{ margin: 0 }}>Play your first move from memory.</p> : null}
      {wrong ? (
        <Note kind="bad" title={`${wrong.tried} isn’t in your repertoire`} pop>
          <p>
            Your line{wrong.expected.length > 1 ? 's play' : ' plays'} <strong class="mono">{wrong.expected.join(' or ')}</strong> here.
            {wrong.note ? ` ${wrong.note}` : ''}
          </p>
          <button type="button" class="btn sm" style={{ marginTop: '10px' }} onClick={continueAfterWrong} data-testid="rehearse-continue" autoFocus>
            Play {wrong.expected[0]} and continue
          </button>
        </Note>
      ) : null}
      {idea && !wrong ? (
        <Note kind="good" title={`The idea behind ${idea.san}`}>
          <p>{idea.text}</p>
        </Note>
      ) : null}
      {done ? (
        <Note kind={done.score === 1 ? 'good' : 'warn'} title={done.score === 1 ? 'Perfect run' : `${Math.round(done.score * 100)}% from memory`} pop>
          <p>
            {done.lines.map((l) => l.name).join(', ')} — {Math.ceil(p / 2)} moves.{' '}
            {done.score === 1 ? 'Run it again to see another branch.' : 'Run it again until it’s clean.'}
          </p>
        </Note>
      ) : null}
      <div class="btn-row">
        {done ? (
          <button type="button" class="btn primary" onClick={restart} data-testid="rehearse-again" autoFocus>
            <Icon name="retry" /> Again
          </button>
        ) : (
          <button type="button" class="btn" onClick={restart}>
            <Icon name="retry" /> Restart
          </button>
        )}
        <button type="button" class="btn ghost" onClick={() => go('repertoire')}>
          All lines
        </button>
      </div>
      <div style={{ maxHeight: '24dvh', overflow: 'hidden', display: 'flex' }}>
        <MoveList plies={data.plies} current={p} />
      </div>
    </div>
  );
  return (
    <Workspace
      eyebrow={`Rehearse · ${sideName(color)}`}
      title={only ? pool[0].name : `${pool.length} line${pool.length === 1 ? '' : 's'}`}
      strips={0}
      board={<Board fen={fen} orientation={cgColor(color)} interactive={myTurn} movableColor={color} lastMove={last ? [last.from, last.to] : null} shapes={shapes} onMove={onMove} coords={settings.coords} autoQueen={settings.autoQueen} rev={rev} flash={flash} label="Rehearsal board" />}
      sections={[{ id: 'rehearse', label: 'Rehearse', heading: false, content: panel }]}
    />
  );
}

export function Repertoire({ params }) {
  useEffect(() => seedRepertoire(), []);
  if (params?.edit) return <Editor id={params.edit} color={params.color} />;
  if (params?.rehearse) return <Rehearse color={params.rehearse} only={params.only} />;
  return <Overview />;
}

