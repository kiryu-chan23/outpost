// Home: one obvious next action, chosen from saved activity, with recent
// games and progress underneath.
import { GoalCard } from '../components/Goals.jsx';
import { useMemo } from 'preact/hooks';
import { Board } from '../components/Board.jsx';
import { Icon } from '../components/Icon.jsx';
import { useStore, listGames, update, gamesVersion } from '../lib/store.js';
import { nextActions, streak, puzzleThemes, MIN_THEME_ATTEMPTS } from '../lib/insights.js';
import { replay, START_FEN, turnOf, cgColor } from '../lib/chessx.js';
import { keyMoments } from '../lib/analysis.js';
import { GameRow } from './Review.jsx';
import { fmtDateTime } from '../components/ui.jsx';
import { go } from '../lib/router.js';

const ACT_ICON = { calc: 'eye', game: 'play', review: 'review', puzzles: 'tactics', lesson: 'learn', drill: 'learn', repertoire: 'repertoire', import: 'upload', save: 'bookmark' };

function heroPosition(action, state, games) {
  if (action.id === 'resume' && state.current) {
    const r = replay(state.current.startFen, state.current.moves);
    const last = r.plies[r.plies.length - 1];
    return { fen: r.fens[r.fens.length - 1], orientation: cgColor(state.current.userColor), lastMove: last ? [last.from, last.to] : null, cap: 'Your game in progress' };
  }
  if (action.gameId) {
    const g = games.find((x) => x.id === action.gameId);
    if (g) {
      const r = replay(g.startFen, g.moves);
      const km = keyMoments(g, g.userColor)[0];
      const ply = km ? km.ply : r.plies.length;
      const last = r.plies[ply - 1];
      return { fen: r.fens[ply], orientation: cgColor(g.userColor || 'w'), lastMove: last ? [last.from, last.to] : null, cap: `${g.white} – ${g.black}, final position` };
    }
  }
  if (action.example) {
    const g = games.find((x) => x.id === action.example.gameId);
    if (g) {
      const r = replay(g.startFen, g.moves);
      const ply = action.example.ply;
      const last = r.plies[ply - 1];
      return { fen: r.fens[ply], orientation: cgColor(g.userColor || 'w'), lastMove: last ? [last.from, last.to] : null, cap: `Your costliest one: ${g.white} – ${g.black}, before move ${Math.floor(ply / 2) + 1}` };
    }
  }
  if (action.fen) return { fen: action.fen, orientation: action.orientation || cgColor(turnOf(action.fen)), cap: action.caption || (action.id === 'due' ? 'Your next review puzzle' : 'From the lesson') };
  return { fen: START_FEN, orientation: 'white', cap: null };
}

export function Home() {
  const state = useStore();
  const games = useMemo(() => listGames(), [state.gameOrder.join(','), state.activity.length, gamesVersion()]);
  const actions = useMemo(() => nextActions(state, games), [state, games]);
  const main = actions[0];
  const also = actions.slice(1, 4);
  const pos = heroPosition(main, state, games);
  const streakDays = streak(state.attempts, state.activity);
  const week = Date.now() - 7 * 24 * 3600 * 1000;
  const weekAttempts = state.attempts.filter((a) => a.t >= week);
  const weekOk = weekAttempts.filter((a) => a.ok && !a.hint).length;
  const themes = puzzleThemes(state.attempts).filter((t) => t.n >= MIN_THEME_ATTEMPTS);
  const lessonsDone = Object.values(state.lessonProgress).filter((p) => p.done).length;
  const fresh = !games.length && !state.attempts.length && !state.activity.length;
  const reviewedCount = games.filter((g) => g.analysis && g.userColor).length;

  const start = (a) => {
    if (a.route === 'review' && a.params?.id) update((s) => (s.ui.reviewId = a.params.id));
    go(a.route, a.params || {});
  };

  return (
    <div class="page">
      <section class="hero" aria-labelledby="hero-title">
        <div>
          <div class="eyebrow">{fresh ? 'Welcome to Outpost' : 'Next up'}</div>
          <h1 id="hero-title">{main.title}</h1>
          <p class="lede">{fresh && main.id === 'lesson' ? `Start with a three-minute lesson, then play or solve puzzles. Everything you do is saved in this browser and feeds your insights. ${main.text}` : main.text}</p>
          <div class="cta">
            <button type="button" class="btn primary big" onClick={() => start(main)} data-testid="next-action">
              {main.cta} <Icon name="arrow" />
            </button>
          </div>
          {also.length ? (
            <div class="also" aria-label="Other suggestions">
              {also.map((a) => (
                <button key={a.id} type="button" class="btn sm" onClick={() => start(a)}>
                  {a.cta}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <div class="hero-board">
          <Board fen={pos.fen} orientation={pos.orientation} lastMove={pos.lastMove} viewOnly coords={false} label={pos.cap || 'Preview board'} />
          {pos.cap ? <div class="cap">{pos.cap}</div> : null}
        </div>
      </section>

      <div class="stat-row" style={{ marginBottom: '22px' }}>
        <div class="stat">
          <div class="eyebrow">Streak</div>
          <div class="v" style={{ color: streakDays ? 'var(--amber)' : undefined }}>{streakDays} day{streakDays === 1 ? '' : 's'}</div>
          <div class="s">{streakDays ? 'keep it going today' : 'train today to start one'}</div>
        </div>
        <div class="stat">
          <div class="eyebrow">Puzzles this week</div>
          <div class="v">{weekAttempts.length}</div>
          <div class="s">{weekAttempts.length ? `${weekOk} solved first try` : 'none yet this week'}</div>
        </div>
        <div class="stat">
          <div class="eyebrow">Strongest theme</div>
          <div class="v" style={{ fontSize: '19px', marginTop: '12px' }}>{themes.length ? themes[themes.length - 1].label : '–'}</div>
          <div class="s">{themes.length ? `${themes[themes.length - 1].pct}% first try` : `needs ${MIN_THEME_ATTEMPTS}+ attempts in a theme`}</div>
        </div>
        <div class="stat">
          <div class="eyebrow">Lessons</div>
          <div class="v">{lessonsDone}</div>
          <div class="s">finished</div>
        </div>
      </div>

      {reviewedCount ? (
        <div style={{ marginBottom: '18px' }}>
          <GoalCard compact />
        </div>
      ) : null}

      <div class="grid-2" style={{ alignItems: 'start' }}>
        <section class="panel pad" aria-labelledby="h-recent">
          <div class="panel-title">
            <h3 id="h-recent">Recent games</h3>
            <button type="button" class="btn sm ghost" onClick={() => go('review')}>
              All games
            </button>
          </div>
          {games.length ? (
            <ul class="list">
              {games.slice(0, 5).map((g) => (
                <GameRow key={g.id} game={g} onOpen={(id) => { update((s) => (s.ui.reviewId = id)); go('review', { id }); }} />
              ))}
            </ul>
          ) : (
            <div class="empty">
              <strong>No games yet</strong>
              Play the computer or import a PGN from chess.com or Lichess.
              <div class="btn-row" style={{ justifyContent: 'center' }}>
                <button type="button" class="btn primary" onClick={() => go('play')}>Play a game</button>
                <button type="button" class="btn" onClick={() => go('review')}>Import a PGN</button>
              </div>
            </div>
          )}
        </section>
        <section class="panel pad" aria-labelledby="h-activity">
          <div class="panel-title">
            <h3 id="h-activity">Recent training</h3>
            <button type="button" class="btn sm ghost" onClick={() => go('insights')}>
              Insights
            </button>
          </div>
          {state.activity.length ? (
            <ul class="list">
              {state.activity.slice(0, 6).map((a) => (
                <li key={`${a.t}${a.type}`}>
                  <div class="list-row" style={{ cursor: 'default' }}>
                    <span class="result-tag" aria-hidden="true">
                      <Icon name={ACT_ICON[a.type] || 'check'} size={16} />
                    </span>
                    <span class="grow">
                      <span class="title">{a.label}</span>
                      <span class="meta" style={{ display: 'block' }}>{fmtDateTime(a.t)}</span>
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div class="empty">
              <strong>Nothing logged yet</strong>
              Lessons, puzzles, games and reviews all show up here.
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
