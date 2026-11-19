// Puzzle themes shown in the app. The tags come from src/lib/motifs.js
// (classifyLine) when the puzzle library is built.
export const THEMES = [
  { id: 'fork', label: 'Forks', one: 'fork', blurb: 'One piece attacks two things at once.' },
  { id: 'pin', label: 'Pins', one: 'pin', blurb: 'A piece can’t move without exposing a bigger one.' },
  { id: 'skewer', label: 'Skewers', one: 'skewer', blurb: 'Attack the big piece; win the one behind it.' },
  { id: 'discoveredAttack', label: 'Discovered attacks', one: 'discovered attack', blurb: 'Move one piece to unmask another.' },
  { id: 'hangingPiece', label: 'Hanging pieces', one: 'hanging piece', blurb: 'Spot the undefended piece and take it.' },
  { id: 'backRank', label: 'Back-rank mates', one: 'back-rank mate', blurb: 'The king is trapped behind its own pawns.' },
  { id: 'smothered', label: 'Smothered mates', one: 'smothered mate', blurb: 'A knight mates a king boxed in by its own pieces.' },
  { id: 'mateIn1', label: 'Mate in one', one: 'mate in one', blurb: 'Find the move that ends it.' },
  { id: 'mateIn2', label: 'Mate in two', one: 'mate in two', blurb: 'A forcing move, then mate.' },
  { id: 'mateIn3', label: 'Mate in three', one: 'mate in three', blurb: 'Longer forcing mates.' },
  { id: 'promotion', label: 'Promotion', one: 'promotion', blurb: 'Push a pawn through to a new queen.' },
  { id: 'sacrifice', label: 'Sacrifices', one: 'sacrifice', blurb: 'Give material to get more back.' },
  { id: 'deflection', label: 'Deflection', one: 'deflection', blurb: 'Pull a defender away from its job.' },
  { id: 'attraction', label: 'Attraction', one: 'attraction', blurb: 'Lure a piece onto a bad square.' },
  { id: 'trappedPiece', label: 'Trapped pieces', one: 'trapped piece', blurb: 'A piece with no safe square left.' },
  { id: 'doubleCheck', label: 'Double check', one: 'double check', blurb: 'Two checks at once — only the king can move.' },
  { id: 'defensiveMove', label: 'Defensive moves', one: 'defensive move', blurb: 'Find the move that saves the position.' },
  { id: 'quietMove', label: 'Quiet moves', one: 'quiet move', blurb: 'No check, no capture — and still decisive.' },
  { id: 'endgame', label: 'Endgames', one: 'endgame', blurb: 'Technique with few pieces left.' },
];
export const THEME_BY_ID = Object.fromEntries(THEMES.map((t) => [t.id, t]));
// 'mate' is a parent tag; practising "mate" means any of the mating themes.
THEME_BY_ID.mate = { id: 'mate', label: 'Checkmates', one: 'checkmate', blurb: 'Any forced mate.' };
export const themeLabel = (id) => THEME_BY_ID[id]?.label || id;
export const themeOne = (id) => THEME_BY_ID[id]?.one || id;
