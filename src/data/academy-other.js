// Theme Academy — special moves, game phases and puzzle labels. Original text.
export const SPECIAL = [
  {
    id: 'promotion',
    name: 'Promotion',
    short: 'Get a pawn to the last rank and turn it into a queen (usually).',
    what: [
      'Promotion puzzles are about the race: who queens first, and can the new queen survive? Often the key move is a sacrifice that removes the piece blocking the pawn, or a check that gains the tempo you need.',
    ],
    spot: [
      'Count moves: how many does your pawn need, and how many does the opponent need to stop it?',
      'Look for a deflection of the blocker or a rook check that lets the pawn through.',
      'Make sure the promotion square isn’t covered — and that the new queen can’t be skewered.',
    ],
    patterns: ['Sacrifice the rook to deflect the blocker, then promote.', 'Promote with check so the opponent has no time to take the new queen.'],
    defend: ['Blockade passed pawns early; stop them before they reach the 6th rank.'],
    related: ['advancedPawn', 'underPromotion', 'deflection'],
  },
  {
    id: 'underPromotion',
    name: 'Underpromotion',
    short: 'Promote to a knight, rook or bishop — because a queen would be wrong.',
    what: [
      'Occasionally a queen is the wrong choice. A knight can promote with check (or fork) when a queen couldn’t, and a rook or bishop can avoid stalemate when a queen would leave the opponent without a legal move.',
    ],
    spot: ['Before promoting, check: does a queen stalemate? Would a knight give a check or fork that a queen can’t?'],
    patterns: ['Knight promotion with check that forks king and queen.', 'Rook promotion to avoid stalemate in K+Q-type positions.'],
    defend: ['When defending against a pawn, stalemate tricks can save you — the attacker may need to underpromote.'],
    related: ['promotion', 'fork'],
  },
  {
    id: 'castling',
    name: 'Castling',
    short: 'Puzzles where castling is the key move — or the trick.',
    what: [
      'Castling moves the king to safety and brings a rook to the centre in one move. In puzzles it’s often the move that brings the rook into an attack with tempo (castling long with check, or connecting the rooks just in time).',
      'Rules to remember: you can’t castle out of, through or into check, and neither the king nor that rook may have moved.',
    ],
    spot: ['If your rook needs to reach the d- or f-file urgently, castling may get it there with a threat.'],
    patterns: ['O-O-O with discovered check down the d-file.', 'Castling to escape a pin or a mating attack.'],
    defend: ['Delaying castling for pawn-grabbing is a common way to lose quickly.'],
    related: ['opening', 'exposedKing'],
  },
  {
    id: 'enPassant',
    name: 'En passant',
    short: 'Capture a pawn that just jumped two squares past yours, as if it had moved one.',
    what: [
      'If a pawn advances two squares and lands right next to one of your pawns, you may capture it as if it had moved only one square — but only on the very next move. In puzzles en passant can open a line, give a discovered check or stop a passed pawn.',
    ],
    spot: ['After the opponent’s two-square pawn push, check whether an en passant capture creates a threat (often a discovered check).'],
    patterns: ['En passant that opens a file or diagonal toward the king.'],
    defend: ['Before pushing a pawn two squares, check whether it can be taken en passant.'],
    related: ['discoveredCheck', 'pawnEndgame'],
  },
];

export const PHASES = [
  {
    id: 'opening',
    name: 'Opening tactics',
    short: 'Tactics in the first moves — usually punishing a development or king-safety mistake.',
    what: [
      'Opening puzzles often punish greed or neglect: a queen that came out too early, a king that didn’t castle, a pawn grab that left pieces undeveloped. The most common ideas are tactics on f7/f2, pins on knights, and forks in the centre.',
    ],
    spot: ['Check for loose pieces after each capture in the opening, and look at f2/f7 and e-file pins whenever kings haven’t castled.'],
    patterns: ['Pins on the e-file against an uncastled king.', 'Knight forks on c7/c2.', 'Trapping a queen that grabbed b2/b7.'],
    defend: ['Develop, castle, and don’t grab pawns with your queen early.'],
    related: ['attackingF2F7', 'pin', 'fork', 'castling'],
  },
  {
    id: 'middlegame',
    name: 'Middlegame tactics',
    short: 'Combinations with many pieces on the board — king attacks, double attacks, deflections.',
    what: [
      'Most puzzles come from the middlegame, where every tactic type appears. The common thread: look for forcing moves first, and look at the king.',
    ],
    spot: ['Checks, captures, threats — in that order — for both sides, every move.'],
    patterns: ['Every motif in the academy shows up here.'],
    defend: ['Before each move, ask what your opponent’s best forcing move would be.'],
    related: ['fork', 'pin', 'kingsideAttack', 'deflection'],
  },
  {
    id: 'endgame',
    name: 'Endgame tactics',
    short: 'Few pieces left — precise king moves, promotions and zugzwang decide.',
    what: [
      'Endgame puzzles reward precision. The king becomes a fighting piece, pawns become potential queens, and tempo (who is on move) matters enormously.',
    ],
    spot: ['Count pawn races, use your king actively, and check for zugzwang ideas.'],
    patterns: ['Promotion races, skewers against exposed kings, opposition in pawn endings.'],
    defend: ['Activate your king early once queens are off.'],
    related: ['pawnEndgame', 'rookEndgame', 'zugzwang', 'promotion'],
  },
  {
    id: 'pawnEndgame',
    name: 'Pawn endgame',
    short: 'Only kings and pawns — opposition, counting and key squares.',
    what: [
      'King-and-pawn endings are pure calculation: there are no pieces to hide mistakes. The key ideas are the opposition (who has to give way), key squares in front of a pawn, the rule of the square, and breakthroughs with pawn sacrifices.',
    ],
    spot: ['Count moves exactly. Ask which king reaches the key squares first and who is on move when the kings face each other.'],
    patterns: ['Taking the opposition.', 'Rule of the square.', 'Pawn breakthrough sacrifices (e.g. three pawns against three).'],
    defend: ['Keep your king in front of the enemy pawn; spare pawn moves can save a zugzwang.'],
    related: ['zugzwang', 'promotion', 'advancedPawn'],
  },
  {
    id: 'rookEndgame',
    name: 'Rook endgame',
    short: 'The most common endgame — activity and the Lucena/Philidor positions.',
    what: [
      'Rook endings are the most frequent type of endgame. An active rook (on the 7th rank, behind passed pawns, cutting off the king) is often worth a pawn.',
    ],
    spot: ['Look for checks from behind, cutting off the enemy king, and skewers when a pawn promotes.'],
    patterns: ['Lucena position: build a bridge to promote.', 'Philidor position: the defending rook on the 6th rank.', 'Skewer the new queen from behind.'],
    defend: ['Keep your rook active; a passive rook loses even with equal pawns.'],
    related: ['skewer', 'promotion', 'blindSwineMate'],
  },
  {
    id: 'bishopEndgame',
    name: 'Bishop endgame',
    short: 'Bishops and pawns — colour complexes and blockades.',
    what: [
      'With same-coloured bishops, put your pawns on the opposite colour to your bishop. With opposite-coloured bishops, draws are common because each side can blockade on its own colour.',
    ],
    spot: ['Look for pawn breakthroughs on the colour the enemy bishop can’t control.'],
    patterns: ['Deflecting the bishop from the long diagonal to promote.'],
    defend: ['Blockade passed pawns on your bishop’s colour.'],
    related: ['promotion', 'zugzwang'],
  },
  {
    id: 'knightEndgame',
    name: 'Knight endgame',
    short: 'Knights and pawns — forks and the knight’s struggle against outside passed pawns.',
    what: [
      'Knight endings behave like pawn endings: forks are everywhere, and a passed pawn on the far side of the board is hard for a knight to stop.',
    ],
    spot: ['Look for knight forks of king and pawn, and count whether the knight can reach the promotion path in time.'],
    patterns: ['Fork after promotion.', 'Knight sacrifice for the last pawn.'],
    defend: ['Keep your king near your pawns; knights struggle with wide pawn structures.'],
    related: ['fork', 'pawnEndgame'],
  },
  {
    id: 'queenEndgame',
    name: 'Queen endgame',
    short: 'Queens and pawns — perpetual checks, skewers and queen trades.',
    what: [
      'With queens on, kings are always exposed. The side with the extra pawn must avoid perpetual check; the defender looks for one. Trading queens into a won pawn ending is a key winning idea.',
    ],
    spot: ['Look for checks that force a queen trade or skewer the queen behind the king.'],
    patterns: ['Forcing a queen trade into a won king-and-pawn ending.', 'Perpetual check to save a worse position.'],
    defend: ['Keep your king sheltered from checks; centralise your queen.'],
    related: ['skewer', 'pawnEndgame', 'defensiveMove'],
  },
  {
    id: 'queenRookEndgame',
    name: 'Queen and rook endgame',
    short: 'Queens, rooks and pawns — heavy-piece mating attacks and back-rank threats.',
    what: [
      'With queens and rooks left, mating attacks are still very possible. Back-rank weaknesses and checks on open files decide most of these.',
    ],
    spot: ['Check the back rank and look for queen-and-rook batteries on open files.'],
    patterns: ['Triangle and kill-box mates; back-rank mates.'],
    defend: ['Give your king luft and keep a heavy piece guarding your back rank.'],
    related: ['backRankMate', 'triangleMate', 'killBoxMate'],
  },
];

// How Lichess labels puzzles (not teaching topics — context for reading puzzle tags).
export const LABELS = [
  { title: 'Goals', text: 'Every Lichess puzzle has a goal. “Equality” means you save a worse position. “Advantage” means you win a clear edge (about two pawns or more). “Crushing” means a decisive win (more than about six pawns of advantage). “Mate” means a forced checkmate.' },
  { title: 'Lengths', text: '“One-move” puzzles have a single move. “Short” puzzles take two of your moves, “Long” three, and “Very long” four or more. Longer isn’t harder by itself — rating measures difficulty — but longer lines train calculation.' },
  { title: 'Origin', text: '“Master games”, “Master vs Master” and “Super GM games” tag puzzles taken from games between strong players. Everything else comes from games on Lichess. The tactics are verified by Stockfish either way.' },
  { title: 'By opening', text: 'Lichess also groups puzzles by the opening of the game they came from (Sicilian, Italian, Ruy Lopez…). Practising puzzles from your own openings is a good way to learn the tactics that come up in your games.' },
  { title: 'Rating', text: 'Each puzzle has a rating that moves as people solve or miss it. Outpost uses those ratings to pick puzzles near your own puzzle rating, so you see each theme at a level you can learn from.' },
];
