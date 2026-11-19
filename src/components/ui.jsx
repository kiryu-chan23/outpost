// Shared interface pieces: workspace layout with tabs, dialogs, toasts, toggles.
import { useEffect, useRef, useState } from 'preact/hooks';
import { Icon } from './Icon.jsx';
import { sanLine } from '../lib/chessx.js';

export function useMedia(query) {
  const get = () => typeof window !== 'undefined' && window.matchMedia(query).matches;
  const [on, setOn] = useState(get);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const fn = () => setOn(mq.matches);
    mq.addEventListener('change', fn);
    fn();
    return () => mq.removeEventListener('change', fn);
  }, [query]);
  return on;
}
export const useIsMobile = () => useMedia('(max-width: 860px)');

/** Roving-tabindex tab list with arrow-key support. */
export function Tabs({ tabs, value, onChange, label, cls = 'tabs' }) {
  const ref = useRef(null);
  const onKey = (e) => {
    const i = tabs.findIndex((t) => t.id === value);
    let j = i;
    if (e.key === 'ArrowRight') j = (i + 1) % tabs.length;
    else if (e.key === 'ArrowLeft') j = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') j = 0;
    else if (e.key === 'End') j = tabs.length - 1;
    else return;
    e.preventDefault();
    e.stopPropagation();
    onChange(tabs[j].id);
    requestAnimationFrame(() => ref.current && ref.current.querySelector('[aria-selected="true"]')?.focus());
  };
  return (
    <div class={cls} role="tablist" aria-label={label} ref={ref} onKeyDown={onKey}>
      {tabs.map((t) => (
        <button key={t.id} type="button" role="tab" id={`tab-${t.id}`} aria-selected={t.id === value} aria-controls={`panel-${t.id}`} tabIndex={t.id === value ? 0 : -1} onClick={() => onChange(t.id)}>
          {t.label}
          {t.dot ? <span class="dot" aria-label="new" /> : null}
        </button>
      ))}
    </div>
  );
}

/**
 * Board-first workspace. Desktop: the board takes the stage and every section
 * sits beside it. Mobile: the board is nearly full width and the sections
 * become tabs underneath.
 */
export function Workspace({ eyebrow, title, headRight, above, board, below, strips = 0, sections, tab, onTab }) {
  const mobile = useIsMobile();
  const [inner, setInner] = useState(sections[0]?.id);
  const active = sections.some((s) => s.id === (tab ?? inner)) ? tab ?? inner : sections[0]?.id;
  const setTab = onTab || setInner;
  return (
    <div class="work">
      <div class="stage" style={{ '--strips': `${strips}px` }}>
        <div class="stage-col">
          {above}
          {board}
          {below}
        </div>
      </div>
      <aside class="side" aria-label={title}>
        <div class="side-head">
          <div>
            {eyebrow ? <div class="eyebrow" style={{ marginBottom: '6px' }}>{eyebrow}</div> : null}
            <h2>{title}</h2>
          </div>
          {headRight}
        </div>
        {mobile && sections.length > 1 ? <Tabs cls="tabs side-tabs" tabs={sections} value={active} onChange={setTab} label={`${title} sections`} /> : null}
        <div class="side-scroll">
          {sections.map((s) =>
            mobile ? (
              s.id === active ? (
                <section key={s.id} class="side-section" role="tabpanel" id={`panel-${s.id}`} aria-labelledby={`tab-${s.id}`}>
                  {s.content}
                </section>
              ) : null
            ) : (
              <section key={s.id} class={`side-section${s.grow ? ' grow-section' : ''}`} aria-label={typeof s.label === 'string' ? s.label : s.id}>
                {s.heading === false ? null : <div class="eyebrow section-label">{s.label}</div>}
                {s.content}
              </section>
            )
          )}
        </div>
      </aside>
    </div>
  );
}

export function Dialog({ title, children, onClose, actions, wide }) {
  const ref = useRef(null);
  useEffect(() => {
    const prev = document.activeElement;
    const node = ref.current;
    const focusable = () => [...node.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter((n) => !n.disabled);
    (focusable()[0] || node).focus();
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      } else if (e.key === 'Tab') {
        const f = focusable();
        if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) {
          e.preventDefault();
          f[f.length - 1].focus();
        } else if (!e.shiftKey && document.activeElement === f[f.length - 1]) {
          e.preventDefault();
          f[0].focus();
        }
      }
    };
    node.addEventListener('keydown', onKey);
    return () => {
      node.removeEventListener('keydown', onKey);
      if (prev && prev.focus) prev.focus();
    };
  }, []);
  return (
    <div class="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div class="dialog" role="dialog" aria-modal="true" aria-label={title} ref={ref} tabIndex={-1} style={wide ? { width: 'min(760px, 100%)' } : null}>
        <div class="row between" style={{ alignItems: 'start', marginBottom: '12px' }}>
          <h2>{title}</h2>
          <button type="button" class="btn ghost icon" aria-label="Close" onClick={onClose}>
            <Icon name="x" />
          </button>
        </div>
        {children}
        {actions ? <div class="actions">{actions}</div> : null}
      </div>
    </div>
  );
}

// ---- toasts ------------------------------------------------------------------
let pushToast = () => {};
export const toast = (msg) => pushToast(msg);
export function Toasts() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    pushToast = (msg) => {
      const id = Math.random().toString(36).slice(2);
      setItems((xs) => [...xs.slice(-2), { id, msg }]);
      setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), 3200);
    };
  }, []);
  return (
    <div class="toasts" role="status" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} class="toast">
          {t.msg}
        </div>
      ))}
    </div>
  );
}

export function Switch({ checked, onChange, children, hint }) {
  return (
    <label class="switch">
      <span>
        <span style={{ fontWeight: 600 }}>{children}</span>
        {hint ? <span class="small muted" style={{ display: 'block' }}>{hint}</span> : null}
      </span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.currentTarget.checked)} />
      <span class="track" aria-hidden="true" />
    </label>
  );
}

/** Single-choice segmented control. */
export function Seg({ options, value, onChange, label }) {
  return (
    <div class="seg" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

const NOTE_ICON = { good: 'check', bad: 'x', warn: 'hint', info: 'eye' };
export function Note({ kind = 'info', title, children, pop }) {
  return (
    <div class={`note ${kind}${pop ? ' pop' : ''}`} role={kind === 'bad' || kind === 'good' ? 'status' : undefined}>
      <span class="ico" aria-hidden="true">
        <Icon name={NOTE_ICON[kind]} />
      </span>
      <div>
        {title ? <h4>{title}</h4> : null}
        {children ? <div class="note-body">{children}</div> : null}
      </div>
    </div>
  );
}

/** A clickable SAN variation. onPick(fen, index) previews that position. */
export function Line({ fen, pv, max = 8, onPick, label }) {
  const toks = sanLine(fen, pv || [], max);
  if (!toks.length) return null;
  return (
    <div class="line" aria-label={label || 'Variation'}>
      {toks.map((t, i) => (
        <span key={i} style={{ display: 'inline-flex', gap: '4px', alignItems: 'baseline' }}>
          {t.label ? <span class="n">{t.label}</span> : null}
          {onPick ? (
            <button type="button" onClick={() => onPick(t, i, toks)}>
              {t.san}
            </button>
          ) : (
            <span>{t.san}</span>
          )}
        </span>
      ))}
    </div>
  );
}

export function EngineGate({ status, children, onRetry }) {
  if (status.state === 'failed')
    return (
      <Note kind="bad" title="The chess engine couldn’t start">
        <p>
          {typeof location !== 'undefined' && location.protocol === 'file:'
            ? 'The app was opened straight from a file. Run it with “npm run serve” (or any static server) and open http://127.0.0.1:5180 instead.'
            : 'Reload the page to try again. If it keeps failing here, the local copy (npm run serve) runs the engine fine.'}
        </p>
        <p class="small muted mono" style={{ marginTop: '6px', overflowWrap: 'anywhere' }}>{status.error || 'The engine worker failed to load.'}</p>
        {onRetry ? (
          <button type="button" class="btn sm" style={{ marginTop: '10px' }} onClick={onRetry}>
            Try starting the engine again
          </button>
        ) : null}
      </Note>
    );
  return children || null;
}

export const fmtDate = (t) => new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
export const fmtDateTime = (t) => new Date(t).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export async function copyTextSafe(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast('Copied');
  } catch {
    toast('Copy was blocked — select the text and copy it by hand');
  }
}
