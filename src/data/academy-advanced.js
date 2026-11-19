// Theme Academy — Advanced tactics. Original explanations for Outpost.
export const ADVANCED = [
  {
    id: 'deflection',
    name: 'Deflection',
    short: 'Force a defender away from its job, so the thing it guarded collapses.',
    what: [
      'A deflection makes an enemy piece leave the square or line where it does an important job — guarding a piece, covering a mating square, or blocking a pawn. Usually you offer material it “has to” take, or attack it so it must move.',
      'Deflection and overloading are close cousins: an overloaded piece has two jobs, and you deflect it from one by attacking the other.',
    ],
    spot: [
      'Find the enemy piece that holds the position together. Ask: if it weren’t there, what would I win?',
      'Look for a check or capture that forces exactly that piece to respond.',
      'Back-rank defenders and queens that guard several squares are frequent targets.',
    ],
    patterns: [
      'Queen sacrifice that drags the defending queen away from the back rank, then mate.',
      'Rook offer on the 8th rank: if the rook takes, mate follows elsewhere.',
      'Attacking a blockader so a passed pawn can promote.',
    ],
    defend: [
      'Spread duties among several pieces. One piece guarding two critical things is a weakness.',
    ],
    related: ['capturingDefender', 'attraction', 'interference', 'backRankMate'],
  },
  {
    id: 'attraction',
    name: 'Attraction',
    short: 'Lure an enemy piece (often the king) onto a square where a tactic works.',
    what: [
      'Attraction is the mirror of deflection: instead of pulling a piece away from a square, you drag it onto a square that is bad for it — usually with a sacrifice it has to accept.',
      'The classic target is the king: sacrifice to pull it forward, then fork it, skewer it or mate it.',
    ],
    spot: [
      'Look for squares where an enemy piece would be forked, pinned or mated if it stood there.',
      'Then look for a capture or check that forces it to go there.',
    ],
    patterns: [
      'Sacrifice on f7 or h7 to draw the king out, followed by a knight fork.',
      'Pull the queen onto a square where a knight fork wins it back with interest.',
    ],
    defend: [
      'Before taking a “free” piece near your king, check whether the capture puts your king or queen on a forkable square.',
    ],
    related: ['deflection', 'fork', 'sacrifice', 'skewer'],
  },
  {
    id: 'clearance',
    name: 'Clearance',
    short: 'Move a piece out of the way — with tempo — to open a square or line for another piece.',
    what: [
      'Sometimes your own piece is in the way: it blocks a file your rook needs, or sits on the square your knight wants. A clearance move gets rid of it, ideally with check or a threat so the opponent has no time to react.',
    ],
    spot: [
      'Imagine your own blocking piece vanished. Would a mate or big capture appear? Then find a forcing way to move it.',
      'Sacrificing the blocker is common: it clears the line and gains time at once.',
    ],
    patterns: [
      'Push a pawn with tempo to open a diagonal for a bishop.',
      'Sacrifice a piece on a square another piece needs (clearing it for a knight fork or queen check).',
    ],
    defend: [
      'Look at the opponent’s blocked batteries: a clearance can switch them on instantly.',
    ],
    related: ['discoveredAttack', 'sacrifice', 'interference'],
  },
  {
    id: 'interference',
    name: 'Interference',
    short: 'Drop a piece between two enemy pieces to cut the line connecting them.',
    what: [
      'Interference blocks the line between an enemy defender and what it defends. Even if your interfering piece can be captured, capturing it may break the connection or cost the defender its job.',
    ],
    spot: [
      'Find two enemy pieces that protect each other along a line (two rooks, rook and queen, bishop guarding a promotion square).',
      'Is there a square between them you can occupy, ideally with a threat or check?',
    ],
    patterns: [
      'A knight landing between two rooks that defend each other.',
      'A pawn push that cuts a bishop off from the promotion square of your other pawn.',
    ],
    defend: [
      'Pieces defending along long lines can be cut off; prefer defenders that are close to what they protect.',
    ],
    related: ['deflection', 'clearance', 'promotion'],
  },
  {
    id: 'intermezzo',
    name: 'Intermezzo',
    short: 'Before the “obvious” recapture, insert a stronger forcing move first.',
    what: [
      'Also called zwischenzug (“in-between move”). When a sequence seems forced — they take, you take back — an intermezzo puts in a check, capture or big threat first, changing the outcome.',
      'It is a common reason why calculation goes wrong: you assume the recapture is automatic, but your opponent (or you) has something better in between.',
    ],
    spot: [
      'Whenever a recapture looks automatic, pause and look for checks and threats first.',
      'Especially useful when the piece you’d recapture is not running away.',
    ],
    patterns: [
      'Instead of recapturing, give check first, then recapture with gain.',
      'Instead of moving an attacked piece, attack something bigger.',
    ],
    defend: [
      'When you start an exchange, check what the opponent can do instead of recapturing.',
    ],
    related: ['defensiveMove', 'quietMove', 'deflection'],
  },
  {
    id: 'quietMove',
    name: 'Quiet move',
    short: 'A non-forcing move — no check, no capture — that creates a threat that can’t be met.',
    what: [
      'Most tactics are checks and captures. A quiet move is different: it calmly improves a piece, cuts off an escape square or prepares an unstoppable threat. Because it isn’t forcing, it’s easy to overlook.',
    ],
    spot: [
      'When checks and captures don’t work, ask: what would I play if the opponent passed? Then see if they have a defence against that.',
      'Moves that take away the last escape square of a king or a trapped piece are typical quiet moves.',
    ],
    patterns: [
      'A king move or pawn move that sets up mate next move.',
      'A rook lift that adds an attacker the opponent can’t neutralise in time.',
    ],
    defend: [
      'Ask what your opponent is threatening even when they didn’t check or capture.',
    ],
    related: ['zugzwang', 'trappedPiece', 'intermezzo'],
  },
  {
    id: 'defensiveMove',
    name: 'Defensive move',
    short: 'The only move that holds — find the resource that saves the position.',
    what: [
      'These puzzles don’t ask you to win, they ask you not to lose. The opponent threatens something, and there is exactly one move (or one sequence) that parries it — often a counter-threat, an intermezzo or a precise retreat.',
      'This is the theme most players neglect, and it’s worth points: half your games are decided by whether you find the saving move when you’re under pressure.',
    ],
    spot: [
      'Start by naming the opponent’s threat precisely. What exactly do they win if you do nothing?',
      'List every move that deals with it: moving, defending, blocking, capturing the attacker, or counterattacking something bigger.',
      'Check each candidate against their best reply. The first idea that comes to mind is often not enough.',
    ],
    patterns: [
      'A counter-check that wins time.',
      'A retreat that defends two things at once.',
      'Returning material to defuse an attack.',
    ],
    defend: [
      'This theme is itself the defence: practising it trains you to stay calm and find resources instead of panicking.',
    ],
    related: ['intermezzo', 'quietMove', 'exposedKing'],
  },
  {
    id: 'discoveredCheck',
    name: 'Discovered check',
    short: 'Move a piece to reveal a check from the piece behind it — and do damage with the moved piece.',
    what: [
      'A discovered check is the strongest kind of discovered attack. The opponent has to answer the check, so the piece that moved can do almost anything: capture the queen, attack a rook, even move to a square where it can be taken.',
    ],
    spot: [
      'Look for your bishop, rook or queen pointing at the enemy king with one of your own pieces in between.',
      'Ask what the front piece can grab while the check is revealed.',
    ],
    patterns: [
      'The front piece captures the queen while revealing check.',
      'Windmill: alternating discovered checks and captures.',
      'Discovered check that is also a double check (see Double check).',
    ],
    defend: [
      'Never leave your king on a line with an enemy long-range piece if only one enemy piece stands between.',
    ],
    related: ['discoveredAttack', 'doubleCheck', 'exposedKing'],
  },
  {
    id: 'xRayAttack',
    name: 'X-ray attack',
    short: 'A piece attacks or defends a square through another piece on the same line.',
    what: [
      'An x-ray is “seeing through” a piece. A rook behind its partner on a file still defends the square in front of the partner, because if the partner is exchanged off, the back rook recaptures. It also works through enemy pieces: once they move or are captured, the line opens.',
      'In puzzles it often decides who wins an exchange on a square — you count the x-raying piece as an extra attacker or defender.',
    ],
    spot: [
      'When counting attackers and defenders, include pieces lined up behind the first attacker on the same line.',
      'After a capture on a square, check which long-range pieces now see through to it.',
    ],
    patterns: [
      'Doubled rooks: the back rook supports the front one through it.',
      'A queen trade on a square where your rook behind the queen recaptures and wins the back rank.',
    ],
    defend: [
      'Recount exchanges carefully: long-range pieces behind others are easy to forget.',
    ],
    related: ['skewer', 'pin', 'discoveredAttack'],
  },
  {
    id: 'zugzwang',
    name: 'Zugzwang',
    short: 'Every move the opponent has makes their position worse — they’d love to pass, but can’t.',
    what: [
      'Zugzwang (German for “compulsion to move”) is when being on move is a disadvantage. It is most common in endgames, especially pawn endings, where a king that has to step aside lets the other king in.',
      'Zugzwang puzzles often want a waiting move or a precise king move that hands the obligation to move back to the opponent.',
    ],
    spot: [
      'In endgames, ask: if it were their move right now, would any of their moves be acceptable? If not, find a move that keeps the position the same but passes the turn.',
      'Opposition in king-and-pawn endings is a type of zugzwang.',
    ],
    patterns: [
      'Taking the opposition so the defending king must give way.',
      'A spare pawn move that changes who is on move (a tempo move).',
      'Triangulation: the king loses a move by walking around a triangle.',
    ],
    defend: [
      'Keep spare pawn moves in reserve in pawn endings — they can break a zugzwang.',
    ],
    related: ['pawnEndgame', 'quietMove', 'endgame'],
  },
  {
    id: 'collinearMove',
    name: 'Collinear move',
    short: 'Two opposing pieces face each other on a line, and one slides along it without capturing.',
    what: [
      'A rare, advanced tag. Two long-range pieces face each other on a file, rank or diagonal, and the key move slides one of them along that same line to a new square — not capturing, but changing what both pieces attack.',
      'It usually works because the new square adds a threat (often check) while keeping the original line covered.',
    ],
    spot: [
      'When your rook or queen faces an enemy rook or queen on a line, consider moves along that line, not just the capture.',
    ],
    patterns: [
      'A rook sliding up the file to give check while still pinning or guarding.',
    ],
    defend: [
      'When heavy pieces face each other, look at every square on the shared line, not just the capture.',
    ],
    related: ['xRayAttack', 'quietMove'],
  },
];
