// Theme Academy — Motifs. Original explanations for Outpost; ids match the
// Lichess puzzle theme tags so lessons can pull real examples and practice.
export const MOTIFS = [
  {
    id: 'hangingPiece',
    name: 'Hanging piece',
    short: 'A piece with no protection — or not enough — that can simply be taken.',
    what: [
      'A piece “hangs” when it can be captured and the owner can’t win the material back. Sometimes it has no defender at all. More often it has one defender but two attackers, or it is defended only by something worth more than the attacker.',
      'At club level this is the single biggest source of points. Most games are not lost to deep combinations; they are lost because a knight was left alone on the rim or a bishop’s only defender wandered off.',
    ],
    spot: [
      'Before every move, look at each enemy piece and ask “who defends it?” Then ask the same about your own pieces.',
      'Count attackers and defenders on a square. If attackers outnumber defenders, the piece is in danger. Also compare values: a queen “defended” by a pawn is still lost to a pawn attack.',
      'Pieces that just moved are the most likely to be loose — the defender they relied on may not cover the new square.',
      'Pieces on the edge (a- and h-files, back ranks) and pieces far from their army are classic victims.',
    ],
    patterns: [
      'The free capture: the opponent just moved a piece to a square you attack, and nothing covers it.',
      'The removed guard: a capture or exchange takes away the only defender, leaving something else hanging (see Capture the defender).',
      'The overloaded defender: one piece guards two things. Attack one, and the other falls (see Deflection).',
    ],
    defend: [
      'Use the “blunder check” habit: after choosing a move, scan what it leaves unguarded before you play it.',
      'Keep pieces connected — pieces that defend each other are much harder to win.',
      'When you capture, check what your capturing piece left behind.',
    ],
    tip: 'This is the theme your own games flag most often. A few minutes of hanging-piece puzzles a day trains the scan until it’s automatic.',
    related: ['capturingDefender', 'deflection', 'trappedPiece', 'fork'],
  },
  {
    id: 'fork',
    name: 'Fork',
    short: 'One piece attacks two or more targets at once — the opponent can only save one.',
    what: [
      'A fork is a double attack by a single piece. The defender gets one move and usually can only deal with one of the threats, so the other target falls.',
      'Any piece can fork. Knights are the most famous because their jumps are hard to see coming and nothing they attack can attack them back (except another knight). Pawn forks are deadly because the pawn is the cheapest piece. Queens fork constantly because they move in every direction.',
    ],
    spot: [
      'Look for two valuable targets that sit a knight’s jump, a diagonal or a line apart — then ask which square attacks both.',
      'Checks make the best forks: the king must respond, so the second target is lost for free.',
      'Enemy pieces on the same colour of square are candidates for a bishop or queen fork; pieces a knight’s “L” apart for a knight fork.',
      'Undefended pieces are ideal second targets: even attacking a defended rook plus a loose bishop wins the bishop.',
    ],
    patterns: [
      'Royal fork: a knight checks the king and attacks the queen.',
      'Family fork: a knight hits king, queen and rook together.',
      'Pawn fork: a pawn push attacks two pieces on the squares diagonally ahead of it.',
      'Queen fork with check: the queen checks the king while attacking a loose piece on the other side of the board.',
      'Setup fork: a sacrifice or exchange first drags pieces onto forkable squares (see Attraction).',
    ],
    defend: [
      'Watch the squares near your king and queen that an enemy knight could reach in one or two moves.',
      'Don’t leave your king and queen (or two rooks) a knight’s move apart when an enemy knight is nearby.',
      'Keep pieces defended, so a fork only wins something if it hits an unprotected piece.',
    ],
    tip: 'When you find a fork, check whether the forking piece can just be captured. A fork onto a defended square is no fork at all.',
    related: ['attraction', 'doubleCheck', 'hangingPiece', 'discoveredAttack'],
  },
  {
    id: 'pin',
    name: 'Pin',
    short: 'A piece can’t move because a more valuable piece is lined up behind it.',
    what: [
      'A pin happens when a bishop, rook or queen attacks a piece that shields something more valuable behind it on the same line. If the pinned piece moves, the piece behind it is exposed.',
      'An absolute pin is against the king: the pinned piece is not legally allowed to move off the line. A relative pin is against another piece (often the queen): moving is legal but costly.',
    ],
    spot: [
      'Look for enemy pieces sharing a file, rank or diagonal with their king or queen, with one piece in between.',
      'Ask: “If that piece in front weren’t there, what would my bishop/rook/queen hit?”',
      'Pinned pieces are frozen defenders — anything they appear to guard may actually be unguarded.',
    ],
    patterns: [
      'Win the pinned piece: attack it again, especially with a pawn. It can’t run, so it falls.',
      'Pile up: add more attackers to the pinned piece than there are defenders.',
      'Exploit the frozen defender: a pinned piece doesn’t really defend anything off the line, so capture what it was “guarding”.',
      'Classic opening pin: Bg5 pinning the f6 knight to the queen, or Bb5 pinning the c6 knight to the king.',
    ],
    defend: [
      'Break the pin by moving the piece behind it (often the king steps aside), by blocking with a cheaper piece, or by asking the pinning piece a question with a pawn (h6 against a bishop on g5).',
      'Avoid lining up your king and queen on an open file or diagonal.',
    ],
    tip: 'A relative pin can sometimes be ignored on purpose — if moving the pinned piece creates a bigger threat, the “pin” is an illusion.',
    related: ['skewer', 'xRayAttack', 'discoveredAttack', 'hangingPiece'],
  },
  {
    id: 'skewer',
    name: 'Skewer',
    short: 'Attack a valuable piece; when it moves, take the one behind it. A pin in reverse.',
    what: [
      'In a skewer, the more valuable piece is in front. It is attacked, has to move, and the piece behind it on the same line is captured.',
      'Skewers often come with check — the king must move, and the queen or rook behind it is lost.',
    ],
    spot: [
      'Look for the enemy king or queen on the same line as another piece, with the king/queen closer to you.',
      'Long-range pieces (rooks, bishops, queens) do the skewering. Endgames with exposed kings are full of rook and bishop skewers.',
      'Checks along an open file or diagonal are the first thing to test.',
    ],
    patterns: [
      'King-and-rook skewer: a check on the long diagonal or open file, winning the rook behind the king.',
      'Queen skewer: attack the queen with a bishop, and the rook behind it falls.',
      'Endgame skewer against a promoting pawn: the new queen appears, and a rook check behind the king wins it.',
    ],
    defend: [
      'Keep your king off lines that also contain your heavy pieces, especially in endgames.',
      'When promoting, check that the new queen won’t be skewered behind your king.',
    ],
    related: ['pin', 'xRayAttack', 'exposedKing'],
  },
  {
    id: 'discoveredAttack',
    name: 'Discovered attack',
    short: 'Move one piece out of the way to unleash an attack from the piece behind it.',
    what: [
      'A discovered attack uses two pieces on one line. The front piece moves away, revealing an attack by the long-range piece behind it — and the moving piece makes its own threat at the same time.',
      'That is why discovered attacks are so strong: the opponent faces two threats from two pieces in a single move.',
    ],
    spot: [
      'Look for your own bishop, rook or queen whose line is blocked by one of your own pieces, pointing at an enemy target.',
      'Ask what the blocking piece could do if it moved with tempo: a capture, a check, a threat.',
      'If the revealed attack is a check, it’s a discovered check — the strongest version (see Discovered check).',
    ],
    patterns: [
      'Knight jumps with a threat, uncovering a bishop’s attack on the queen.',
      'Pawn push that both attacks a piece and opens a rook’s file.',
      'The “windmill”: repeated discovered checks that let a piece capture something every other move.',
    ],
    defend: [
      'Notice batteries aimed at your king and queen even when they are blocked — a block can disappear in one move.',
      'Move the target off the line before the front piece has a useful square to jump to.',
    ],
    related: ['discoveredCheck', 'doubleCheck', 'fork', 'pin'],
  },
  {
    id: 'doubleCheck',
    name: 'Double check',
    short: 'Two pieces give check at once — the king must move, nothing else helps.',
    what: [
      'A double check happens when the moving piece gives check and also uncovers a check from a piece behind it. You can’t block two checks or capture two attackers in one move, so the only legal reply is a king move.',
      'Because the king must move, double checks often lead straight to mate, and the checking pieces can even stand on squares where they could normally be captured.',
    ],
    spot: [
      'Look for a battery aimed at the king: a bishop, rook or queen behind one of your pieces.',
      'Find a square where the front piece also gives check. If one exists, the king is in serious trouble.',
      'Check where the king can go after the double check. Few squares means a likely mate.',
    ],
    patterns: [
      'Knight double check followed by mate (Réti’s and Legal’s famous mates).',
      'Rook-and-bishop double check that drives the king into a mating net.',
    ],
    defend: [
      'Don’t let an enemy battery point at your king through a single enemy piece.',
      'Keep flight squares around your king, because against a double check moving is the only defence.',
    ],
    related: ['discoveredCheck', 'discoveredAttack', 'exposedKing'],
  },
  {
    id: 'trappedPiece',
    name: 'Trapped piece',
    short: 'A piece with no safe squares left — attack it and it’s lost.',
    what: [
      'A piece is trapped when every square it can move to is attacked (or occupied by its own pieces) and it is about to be captured. Trapping often wins material without any check or fork.',
      'Bishops and knights on the edge, queens that grab pawns deep in enemy territory, and rooks shut in by their own king are typical victims.',
    ],
    spot: [
      'Count the escape squares of an enemy piece. If it has only one or two, see if a single move covers them.',
      'Pawn moves are the best trapping tools because pawns are cheap and control squares in front of them.',
      'The “poisoned pawn”: a queen that grabs b2/b7 can sometimes be trapped by closing the exits.',
    ],
    patterns: [
      'Bishop trapped on a7/a2 or h7/h2 after taking a pawn (…b6 shuts it in).',
      'Knight on the rim with no way back.',
      'Queen trapped on the side after capturing a pawn.',
    ],
    defend: [
      'Before grabbing material deep in enemy territory, make sure the capturing piece has a way back.',
      'Keep your bishops’ diagonals open.',
    ],
    related: ['hangingPiece', 'quietMove'],
  },
  {
    id: 'capturingDefender',
    name: 'Capture the defender',
    short: 'Take the piece that guards something — then take the something.',
    what: [
      'Also called removing the guard. If one enemy piece is the only protector of another piece or a key square, capturing it (even by giving up material) leaves the target unprotected.',
      'It is a two-step idea: first remove the defender, then collect the piece or deliver the mate it was preventing.',
    ],
    spot: [
      'For every enemy piece you’d like to win, ask what defends it. If the answer is one piece, can you capture or trade that defender?',
      'A knight on f6 guarding h7, or a bishop guarding a back-rank square, are typical “only defenders”.',
    ],
    patterns: [
      'Bishop takes knight, then the queen captures what the knight defended.',
      'Exchange sacrifice on the defender of the king, leading to mate.',
    ],
    defend: [
      'Avoid relying on a single piece to hold everything; add a second defender to important points.',
    ],
    related: ['deflection', 'hangingPiece', 'attraction'],
  },
  {
    id: 'exposedKing',
    name: 'Exposed king',
    short: 'A king with few defenders and open lines around it — attack it directly.',
    what: [
      'When the pawns in front of a king are gone, or the king is stuck in the centre with open files, every check becomes dangerous. Puzzles with this theme usually end in mate or win heavy material through checks.',
    ],
    spot: [
      'Count the defenders around the enemy king, and the open files and diagonals pointing at it.',
      'Look for checks first. Every forcing move against an exposed king narrows the opponent’s choices.',
      'Bring your queen closer: queens are lethal against a king with no pawn cover.',
    ],
    patterns: [
      'Queen and knight hunting a king in the open.',
      'Rook lift to the third rank and across to the king.',
      'Sacrifice to strip the last pawn shelter, then checks.',
    ],
    defend: [
      'Castle early and don’t push the pawns in front of your castled king without a reason.',
      'Trade the opponent’s attacking queen when your king is weak.',
    ],
    related: ['kingsideAttack', 'queensideAttack', 'sacrifice', 'doubleCheck'],
  },
  {
    id: 'kingsideAttack',
    name: 'Kingside attack',
    short: 'Attacking a king that castled short (g1/g8).',
    what: [
      'Most players castle kingside, so most attacks happen there. The typical targets are the pawns on f, g and h and the squares around them, especially h7/h2 and g7/g2.',
    ],
    spot: [
      'Count attackers vs defenders near the king. If you have more pieces aimed at the kingside than they have defending, look for a breakthrough.',
      'A missing knight on f6/f3 makes h7/h2 weak. A pushed g-pawn weakens the dark or light squares around the king.',
    ],
    patterns: [
      'The Greek gift: Bxh7+ followed by Ng5+ and Qh5.',
      'Pawn storm: push h- and g-pawns to open files (best when the kings castled on opposite sides).',
      'Rook lift: Re3–g3 or Rd3–h3 to join the attack.',
    ],
    defend: [
      'Keep a knight on f6/f3 as a defender, and don’t weaken the pawn shield without need.',
      'Counterattack in the centre: central play is the classic answer to a wing attack.',
    ],
    related: ['exposedKing', 'sacrifice', 'backRankMate', 'mate'],
  },
  {
    id: 'queensideAttack',
    name: 'Queenside attack',
    short: 'Attacking a king that castled long (c1/c8).',
    what: [
      'A king on c1/c8 has the a- and b-pawns as its shield and the long diagonals pointing at it. Queenside attacks often involve sacrifices on b2/b7 or a3/a6 and checks down the open b- and c-files.',
    ],
    spot: [
      'Look at the a2/b2 (or a7/b7) pawns: is one of them weak or already advanced?',
      'Open c- and b-files plus a bishop on the long diagonal are a dangerous combination.',
    ],
    patterns: [
      'Sacrifice on b2/b7 to open the king.',
      'Queen and bishop battery on the a-file or long diagonal.',
      'Boden’s mate with two bishops (see the mate patterns).',
    ],
    defend: [
      'After castling long, consider Kb1/Kb8 to step off the c-file and cover a2/a7.',
    ],
    related: ['exposedKing', 'bodenMate', 'sacrifice'],
  },
  {
    id: 'advancedPawn',
    name: 'Advanced pawn',
    short: 'A pawn deep in enemy territory — about to promote or tie the opponent down.',
    what: [
      'A pawn on the 6th or 7th rank (3rd or 2nd for Black) is a monster: it threatens to promote, it cramps the opponent and it often forces a piece to sit in front of it.',
      'Puzzles with this tag usually revolve around pushing that pawn through, often with a sacrifice to deflect the blocker.',
    ],
    spot: [
      'Count: how many moves does the pawn need, and which enemy piece stops it? Can you remove or deflect that piece?',
      'Promotion squares under check or attack by your rook behind the pawn are often decisive.',
    ],
    patterns: [
      'Deflect the blockader, then promote.',
      'Rook behind the passed pawn, pushing it home.',
      'Two connected passed pawns on the 6th rank beat a rook.',
    ],
    defend: [
      'Blockade passed pawns early with a piece, ideally a knight.',
      'Put your rook behind the opponent’s passed pawn.',
    ],
    related: ['promotion', 'deflection', 'pawnEndgame'],
  },
  {
    id: 'attackingF2F7',
    name: 'Attacking f2 or f7',
    short: 'Hit the weakest square in the starting position — defended only by the king.',
    what: [
      'At the start of the game f2 and f7 are guarded only by the king. Early attacks with a bishop on c4/c5 and a queen or knight often aim there, and many quick wins (Scholar’s mate, the Fried Liver) come from it.',
    ],
    spot: [
      'If a bishop on c4 eyes f7 and a knight or queen can join, look for a capture or sacrifice on f7.',
      'A king that hasn’t castled is especially exposed after f7 falls.',
    ],
    patterns: [
      'Bxf7+ drawing the king out, then a knight fork on e6 or g5.',
      'Nxf7 forking queen and rook (the Fried Liver idea).',
      'Queen and bishop battery on f7 for mate.',
    ],
    defend: [
      'Develop the kingside knight to f6/f3 and castle early.',
      'Don’t let a bishop and queen line up against f7 without a defender.',
    ],
    related: ['sacrifice', 'opening', 'exposedKing'],
  },
  {
    id: 'sacrifice',
    name: 'Sacrifice',
    short: 'Give up material on purpose for a bigger gain — mate, material back, or a winning attack.',
    what: [
      'A sacrifice deliberately offers or gives up material. It is only a sacrifice if the payoff comes by force: usually checkmate, winning back more material, or a promotion.',
      'In puzzles the sacrifice is the hard first move, because your instinct says “don’t give pieces away”. The trick is to calculate what the forced replies are.',
    ],
    spot: [
      'Look for checks and captures even when they lose material at first. Ask what the opponent is forced to do next.',
      'Sacrifices work when the enemy king is short of defenders, or when the opponent has a piece that is doing too many jobs.',
    ],
    patterns: [
      'Sacrifice to expose the king (Bxh7+, Rxg7+).',
      'Sacrifice to deflect a defender (often the queen) away from a key square.',
      'Sacrifice to attract the king onto a square where a fork or mate follows.',
      'Sacrifice to promote a pawn.',
    ],
    defend: [
      'When an opponent offers material, ask “why?” before taking. Calculate their best follow-up.',
    ],
    related: ['attraction', 'deflection', 'exposedKing', 'clearance'],
  },
];
