// The learning path: a short roadmap through the lessons, academy topics and
// drills, a "do this next" pick driven by the mistakes in your own games, and
// the positions from your games that each lesson ends with.
import { Chess } from 'chess.js';
import { replayCache } from './analysis.js';
import { isMine } from './guide.js';
import { playUci } from './chessx.js';
import { TAG_THEME, TAG_LABEL } from './explain.js';
import { wonPositions } from './convert.js';
import { lessonById } from '../data/lessons.js';
import { drillById } from '../data/drills.js';
import { MOTIFS } from '../data/academy-motifs.js';
import { ADVANCED } from '../data/academy-advanced.js';
import { MATE_LENGTHS, MATE_PATTERNS } from '../data/academy-mates.js';

const TOPIC_TITLE = new Map([...MOTIFS, ...ADVANCED, ...MATE_LENGTHS, ...MATE_PATTERNS].map((t) => [t.id, t.name]));

const BAD = (m) => m && (m.cls === 'mistake' || m.cls === 'blunder');

// ---- the roadmap -----------------------------------------------------------------------
// A step is a lesson, an academy topic, a drill, or "convert one of your wins".
// `theme` links a step to the weaknesses counted from your games.
export const STAGES = [
  {
    id: 'safety',
    title: 'Stop giving things away',
    blurb: 'Most games at club level are lost to a loose piece, not a deep combination. Fix that first.',
    steps: [
      { kind: 'lesson', id: 'loose-pieces', theme: 'hangingPiece' },
      { kind: 'academy', id: 'hangingPiece', theme: 'hangingPiece' },
      { kind: 'lesson', id: 'opening-principles', theme: 'opening' },
    ],
  },
  {
    id: 'tactics',
    title: 'Tactics that win material',
    blurb: 'The four patterns behind most won pieces: forks, pins, skewers and discovered attacks.',
    steps: [
      { kind: 'lesson', id: 'knight-forks', theme: 'fork' },
      { kind: 'lesson', id: 'pins', theme: 'pin' },
      { kind: 'academy', id: 'skewer', theme: 'skewer' },
      { kind: 'academy', id: 'discoveredAttack', theme: 'discoveredAttack' },
    ],
  },
  {
    id: 'mates',
    title: 'See the checkmate',
    blurb: 'Spot mates for you and against you, starting with the back rank.',
    steps: [
      { kind: 'lesson', id: 'back-rank', theme: 'backRank' },
      { kind: 'academy', id: 'mateIn1', theme: 'mate' },
      { kind: 'academy', id: 'mateIn2', theme: 'mate' },
      { kind: 'academy', id: 'smotheredMate', theme: 'mate' },
    ],
  },
  {
    id: 'endgames',
    title: 'Endgame basics',
    blurb: 'The mates and king-and-pawn endings every player needs to win without thinking.',
    steps: [
      { kind: 'lesson', id: 'rook-mate', theme: 'endgame' },
      { kind: 'drill', id: 'kqk', theme: 'endgame' },
      { kind: 'drill', id: 'krk', theme: 'endgame' },
      { kind: 'lesson', id: 'opposition', theme: 'endgame' },
      { kind: 'drill', id: 'kpk', theme: 'endgame' },
      { kind: 'drill', id: 'kpk-hold', theme: 'endgame' },
    ],
  },
  {
    id: 'finish',
    title: 'Finish the job',
    blurb: 'Turn winning positions into wins — including the ones you let slip.',
    steps: [
      { kind: 'convert', id: 'convert', theme: 'convert' },
      { kind: 'drill', id: 'two-rooks', theme: 'endgame' },
      { kind: 'drill', id: 'lucena', theme: 'endgame' },
    ],
  },
];

/** What a weakness is called in a sentence: "You've … 9 times". */
export const WEAK_PHRASE = {
  hangingPiece: 'left a piece hanging or missed free material',
  fork: 'missed or walked into a fork',
  pin: 'missed or walked into a pin',
  skewer: 'missed or walked into a skewer',
  discoveredAttack: 'missed or allowed a discovered attack',
  mate: 'missed or allowed a checkmate',
  backRank: 'missed or allowed a back-rank mate',
  endgame: 'made a mistake in the endgame',
  opening: 'made a non-tactical mistake in the first ten moves',
  convert: 'let a winning position slip',
};

const stepKey = (s) => `${s.kind}:${s.id}`;

export function stepDone(step, state) {
  const lp = state.lessonProgress || {};
  const ds = state.drillStats || {};
  if (step.kind === 'lesson') return !!lp[step.id]?.done;
  if (step.kind === 'academy') return !!(state.academy || {})[step.id]?.learned;
  if (step.kind === 'drill') return !!ds[step.id]?.wins;
  if (step.kind === 'convert') return Object.values(state.convertStats || {}).some((x) => x && x.wins) || Object.entries(ds).some(([id, x]) => id.startsWith('cv-') && x && x.wins);
  return false;
}

export function stepTitle(step) {
  if (step.kind === 'lesson') return lessonById(step.id)?.title || step.id;
  if (step.kind === 'drill') return drillById(step.id)?.title || step.id;
  if (step.kind === 'convert') return 'Convert one of your wins';
  return TOPIC_TITLE.get(step.id) || step.id;
}

// ---- weaknesses from your games --------------------------------------------------------
/** Is the mate at the end of `pv` (from `fen`) delivered on the mated king's back rank? */
export function backRankMate(fen, pv) {
  if (!pv || !pv.length) return false;
  const c = new Chess(fen);
  let last = null;
  for (const u of pv.slice(0, 9)) {
    last = playUci(c, u);
    if (!last) return false;
  }
  if (!c.isCheckmate()) return false;
  const mated = c.turn();
  const back = mated === 'w' ? '1' : '8';
  const king = c.board().flat().find((p) => p && p.type === 'k' && p.color === mated);
  return !!king && king.square[1] === back && (last.piece === 'r' || last.piece === 'q') && last.to[1] === back;
}

/**
 * Every one of my bad moves in reviewed games, with what it was about.
 * `themes` holds the weakness keys it counts towards.
 */
export function myMistakes(games) {
  const out = [];
  for (const g of games) {
    const an = g.analysis;
    if (!an || !g.userColor) continue;
    let fens = null;
    an.moves.forEach((m, ply) => {
      if (!isMine(g, ply) || !BAD(m)) return;
      const themes = new Set();
      let tag = null;
      for (const t of m.tags || []) {
        const th = TAG_THEME[t];
        if (th) {
          themes.add(th);
          tag = tag || t;
        }
      }
      if (themes.has('mate')) {
        fens = fens || replayCache(g).fens;
        const missedMate = (m.tags || []).includes('missed-mate');
        const fen = missedMate ? fens[ply] : fens[ply + 1];
        const pv = missedMate ? an.evals[ply]?.pv : an.evals[ply + 1]?.pv;
        if (fen && backRankMate(fen, pv)) themes.add('backRank');
      }
      if (m.phase === 'endgame') themes.add('endgame');
      if (ply < 20 && !tag) themes.add('opening'); // tactical slips count under their tactic
      out.push({ game: g, ply, m, themes, tag });
    });
  }
  return out;
}

/** How often each weakness shows up in my most recent reviewed games. */
export function weaknesses(games, recent = 40) {
  const reviewed = games.filter((g) => g.analysis && g.userColor).slice(0, recent);
  const count = {};
  for (const x of myMistakes(reviewed)) for (const t of x.themes) count[t] = (count[t] || 0) + 1;
  const thrown = wonPositions(reviewed).length;
  if (thrown) count.convert = thrown;
  return { reviewed: reviewed.length, count };
}

// ---- the path --------------------------------------------------------------------------
/** Stage status: done steps, and whether it is open (first stage, half of the previous stage done, or skipped ahead). */
export function pathState(state) {
  const unlocked = state.pathUnlocked || {};
  let prevOk = true;
  return STAGES.map((st, i) => {
    const steps = st.steps.map((s) => ({ ...s, key: stepKey(s), title: stepTitle(s), done: stepDone(s, state) }));
    const done = steps.filter((s) => s.done).length;
    const open = i === 0 || prevOk || !!unlocked[st.id];
    prevOk = done >= Math.ceil(steps.length / 2);
    return { ...st, steps, done, open, complete: done === steps.length };
  });
}

// How much a weakness has to show up before it outranks plain path order.
const MIN_WEAK = 2;

/**
 * The one step to do next: among open, unfinished steps, the one whose theme
 * shows up most in my games; otherwise the first unfinished step in order.
 */
export function nextStep(state, games, { canConvert = true } = {}) {
  const stages = pathState(state);
  const { count, reviewed } = weaknesses(games);
  const open = [];
  stages.forEach((st) => {
    if (!st.open) return;
    for (const s of st.steps) {
      if (s.done) continue;
      if (s.kind === 'convert' && (!canConvert || !count.convert)) continue;
      open.push({ ...s, stage: st });
    }
  });
  if (!open.length) return null;
  let best = null;
  for (const s of open) {
    const n = count[s.theme] || 0;
    if (n >= MIN_WEAK && (!best || n > best.n)) best = { step: s, n };
  }
  const step = best ? best.step : open[0];
  const n = best ? best.n : 0;
  const why = n
    ? `You’ve ${WEAK_PHRASE[step.theme]} ${n} time${n === 1 ? '' : 's'} in your last ${reviewed} reviewed game${reviewed === 1 ? '' : 's'}. This is the step that targets it.`
    : reviewed
      ? 'Next on your path. Nothing in your recent games stands out more than this.'
      : 'Next on your path. Import and review some of your games and this pick will start targeting your own mistakes.';
  return { ...step, weakCount: n, why };
}

/** Route for a step. */
export function stepRoute(step, games) {
  if (step.kind === 'lesson') return ['learn', { lesson: step.id }];
  if (step.kind === 'academy') return ['learn', { topic: step.id }];
  if (step.kind === 'drill') return ['learn', { drill: step.id }];
  if (step.kind === 'convert') {
    const p = wonPositions(games)[0];
    return p ? ['learn', { convert: p.id }] : ['review', {}];
  }
  return ['learn', {}];
}

// ---- "from your games" positions for a lesson ------------------------------------------
// Which of my mistakes belong to each lesson, and how to phrase the task.
const LESSON_MATCH = {
  'loose-pieces': (x) => x.themes.has('hangingPiece'),
  'knight-forks': (x) => x.themes.has('fork'),
  pins: (x) => x.themes.has('pin'),
  'back-rank': (x) => x.themes.has('backRank'),
  opposition: (x, fen) => x.m.phase === 'endgame' && /^[kpKP1-8/]+$/.test(fen.split(' ')[0]),
  'rook-mate': (x) => x.m.phase === 'endgame' && x.themes.has('mate'),
  'opening-principles': (x) => x.ply < 20 && !x.tag,
};
export const lessonHasOwn = (id) => !!LESSON_MATCH[id];

/**
 * Up to `n` positions from my reviewed games that match a lesson, missed
 * chances first, one per game where possible, biggest first.
 */
export function lessonPositions(games, lessonId, n = 3) {
  const match = LESSON_MATCH[lessonId];
  if (!match) return [];
  const items = [];
  for (const x of myMistakes(games)) {
    const { fens, plies } = replayCache(x.game);
    const fen = fens[x.ply];
    if (!fen || !match(x, fen)) continue;
    const ref = x.game.analysis.evals[x.ply];
    if (!ref || !ref.best) continue;
    const kind = x.tag && x.tag.startsWith('missed-') ? 'missed' : x.tag ? 'allowed' : 'other';
    items.push({
      id: `${x.game.id}:${x.ply}`,
      gameId: x.game.id,
      ply: x.ply,
      fen,
      played: plies[x.ply].san,
      playedUci: plies[x.ply].uci,
      bestSan: x.m.bestSan || null,
      ref,
      kind,
      tag: x.tag,
      tagLabel: x.tag ? TAG_LABEL[x.tag] : null,
      text: x.m.text,
      loss: x.m.loss,
      cls: x.m.cls,
      userColor: x.game.userColor,
      label: `${x.game.white} – ${x.game.black}`,
      created: x.game.created,
      moveNo: Math.floor(x.ply / 2) + 1,
    });
  }
  const order = { missed: 0, allowed: 1, other: 2 };
  items.sort((a, b) => order[a.kind] - order[b.kind] || b.loss - a.loss);
  const out = [];
  const games_ = new Set();
  for (const it of items) {
    if (out.length >= n) break;
    if (games_.has(it.gameId)) continue;
    games_.add(it.gameId);
    out.push(it);
  }
  for (const it of items) {
    if (out.length >= n) break;
    if (!out.includes(it)) out.push(it);
  }
  return out;
}
