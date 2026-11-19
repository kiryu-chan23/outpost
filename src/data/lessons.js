// Short interactive lessons. Text and positions are original to Outpost.
// A step either explains a position (no task) or asks for a move: `accept`
// lists every SAN that counts as correct (checked by scripts/verify-content.mjs
// against the engine), `reply` is the opponent's answer shown afterwards.
export const LESSONS = [
  {
    id: 'loose-pieces',
    title: 'Loose pieces drop off',
    theme: 'hangingPiece',
    minutes: 3,
    summary: 'Count attackers and defenders before every move — yours and theirs.',
    steps: [
      {
        fen: '4k3/pp3ppp/2n5/3b4/8/2N2Q2/PPP2PPP/4K3 w - - 0 1',
        text: 'Most games below 1500 are decided by a piece left without a guard. A quick habit: before you move, look at every enemy piece and ask “who protects it?”. Here, find the black piece with no defender and take it.',
        accept: ['Nxd5', 'Qxd5'],
        hint: 'Look along the long diagonal from your queen.',
        success: 'The bishop on d5 had nobody guarding it — a free piece.',
      },
      {
        fen: '4k3/ppp2ppp/5n2/3p4/8/1BN5/PPP2PPP/4K3 w - - 0 1',
        text: 'When a piece is defended, count. The pawn on d5 is attacked twice (knight and bishop) and defended once (the knight on f6). Two attackers beat one defender, so you can win it.',
        accept: ['Nxd5', 'Bxd5'],
        hint: 'Start the trade on d5 — you have the last word.',
        success: 'After the trade on d5 you capture last and come out a pawn up.',
      },
      {
        fen: '4k3/ppp2ppp/5n2/3p4/8/2N5/PPP2PPP/4K3 w - - 0 1',
        text: 'Now the bishop is gone: one attacker, one defender. Nxd5 Nxd5 just swaps a knight for a pawn. When the count is even, the capture loses material — make a useful move instead. The lesson: count first, capture second.',
      },
    ],
  },
  {
    id: 'knight-forks',
    title: 'Knight forks',
    theme: 'fork',
    minutes: 3,
    summary: 'Find the square that touches two targets at once.',
    steps: [
      {
        fen: 'r3k3/5ppp/8/3N4/8/8/5PPP/6K1 w - - 0 1',
        text: 'A fork attacks two pieces with one move. Knights are the best forkers because nothing blocks them and nothing they attack can attack back. Find the check that also hits the rook.',
        accept: ['Nc7+'],
        hint: 'Which square is a knight’s jump from both e8 and a8?',
        reply: 'Kd7',
        success: 'Nc7+ checks the king and attacks the rook. Black must deal with the check, and the rook on a8 falls next move.',
      },
      {
        fen: '4k3/1q3r2/6pp/8/4N3/8/5PPP/R5K1 w - - 0 1',
        text: 'The “family fork” hits the king, the queen and a rook. Train your eye to scan for squares where all three are a knight’s jump away.',
        accept: ['Nd6+'],
        hint: 'The knight wants a square on the d-file.',
        success: 'Nd6+ forks king, queen and rook. After the king moves, take the queen.',
      },
    ],
  },
  {
    id: 'pins',
    title: 'Pins: frozen pieces',
    theme: 'pin',
    minutes: 3,
    summary: 'A pinned piece can’t run — so attack it again.',
    steps: [
      {
        fen: '4k3/1p3ppp/2n5/1B6/3P4/8/5PPP/4K3 w - - 0 1',
        text: 'The bishop on b5 pins the knight on c6 to the black king: the knight is not allowed to move, because that would expose the king. Pinned pieces are targets. Attack the knight with something cheaper.',
        accept: ['d5'],
        hint: 'A pawn attack is the cheapest attack there is.',
        success: 'd5 hits the knight, and it can’t escape. Taking on c6 first would only trade; attacking the pinned piece wins it.',
      },
      {
        fen: 'rn1qkbnr/ppp2ppp/3p4/4p3/2B1P1b1/5N2/PPPP1PPP/RNBQK2R w KQkq - 2 4',
        text: 'Not every pin is absolute. Here the bishop on g4 pins the knight on f3 to the queen — the knight may move, but then the queen is lost. Breaking a pin with a pawn move such as h3 is a common, healthy reply. Learn to spot pins against you as well as the ones you make.',
      },
    ],
  },
  {
    id: 'back-rank',
    title: 'The back rank',
    theme: 'backRank',
    minutes: 3,
    summary: 'A king behind three pawns has nowhere to go.',
    steps: [
      {
        fen: '6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1',
        text: 'Black’s king is boxed in by its own pawns. A rook or queen landing on the eighth rank with check is mate. Deliver it.',
        accept: ['Rd8#'],
        hint: 'The d-file is open all the way.',
        success: 'Checkmate. The pawns that were meant to shelter the king became the walls of its prison.',
      },
      {
        fen: '4r1k1/5ppp/8/8/2R5/8/5PPP/6K1 w - - 0 1',
        text: 'Now the roles are reversed: Black threatens …Re1, mating you. Give your king some air — or cover the back rank.',
        accept: ['h3', 'h4', 'g3', 'g4', 'f3', 'f4', 'Kf1', 'Rc1'],
        hint: 'One pawn step in front of your king creates an escape square.',
        success: 'A “luft” square (an escape hatch for the king) defuses the threat for the rest of the game.',
      },
    ],
  },
  {
    id: 'opposition',
    title: 'King and pawn: the opposition',
    theme: 'endgame',
    minutes: 4,
    summary: 'In pawn endings the king that doesn’t have to move often wins.',
    steps: [
      {
        fen: '8/8/4k3/8/3K4/8/4P3/8 w - - 0 1',
        text: 'Two kings facing each other with one square between them are “in opposition”. Whoever has to move must step aside and let the other king through. White is to move, and exactly one move wins: take the opposition.',
        accept: ['Ke4'],
        hint: 'Put your king directly in front of Black’s, one square apart.',
        reply: 'Kd6',
        success: 'Ke4 takes the opposition. Black has to give way, and White’s king marches ahead of the pawn (next: Kf5). Every other move lets Black hold the draw.',
        drill: 'kpk',
      },
      {
        fen: '8/8/8/5k2/P7/8/8/7K b - - 0 1',
        orientation: 'black',
        text: 'The rule of the square: draw a box from the pawn to the queening square. If the defending king can step inside it, it catches the pawn. Black to move — step into the square.',
        accept: ['Ke5', 'Ke4', 'Ke6'],
        hint: 'The square runs from a4 to e8. Get onto the e-file.',
        success: 'Inside the square, the king reaches the pawn in time. One file further away and it would be too late.',
      },
    ],
  },
  {
    id: 'rook-mate',
    title: 'Mating with a rook',
    theme: 'endgame',
    minutes: 4,
    summary: 'Shrink the box, keep the rook safe, then mate on the edge.',
    steps: [
      {
        fen: '8/8/8/4k3/8/8/8/R3K3 w - - 0 1',
        text: 'The rook cuts the enemy king into a box. Your plan: (1) put the rook on a line that limits the king, (2) bring your king up to protect the rook, (3) every time the kings face each other, check from the side to push the king back one rank.',
      },
      {
        fen: '3k4/8/3K4/8/8/8/8/7R w - - 0 1',
        text: 'The end of the plan: the kings face each other and the black king is on the edge. A check along the back rank is mate.',
        accept: ['Rh8#'],
        hint: 'Your king covers c7, d7 and e7.',
        success: 'Mate. Practise the whole technique against the engine in the rook-mate drill.',
        drill: 'krk',
      },
    ],
  },
  {
    id: 'opening-principles',
    title: 'Opening principles',
    theme: 'opening',
    minutes: 3,
    summary: 'Centre, development, king safety — in that order.',
    steps: [
      {
        fen: 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3',
        text: 'Three questions for every opening move: does it fight for the centre, does it bring a new piece out, does it help castling? Make a move that does at least two of these.',
        accept: ['Bc4', 'Bb5', 'Nc3', 'd4'],
        strict: true,
        hint: 'Your kingside bishop hasn’t moved yet.',
        success: 'Good — a new piece joins the game and the centre stays contested.',
      },
      {
        fen: 'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/3P1N2/PPP2PPP/RNBQK2R w KQkq - 1 5',
        text: 'Your kingside pieces are out. Before the centre opens, tuck the king away and connect your rooks.',
        accept: ['O-O'],
        strict: true,
        hint: 'The king can move two squares this one time.',
        success: 'Castled. The king is safe and the rook is ready to come to the centre.',
      },
      {
        fen: 'rnb1kbnr/pppp1ppp/8/4p3/4P2q/2N5/PPPP1PPP/R1BQKBNR w KQkq - 2 3',
        text: 'Moving the queen out early invites the opponent to develop with tempo by attacking it. Here Nf3 attacks the queen while developing — Black has to spend another move on her.',
      },
    ],
  },
];
export const lessonById = (id) => LESSONS.find((l) => l.id === id);
