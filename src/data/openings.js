// A small opening-name table (names and move orders are common knowledge, not
// anyone's database). Games are matched on their longest known prefix.
import { Chess } from 'chess.js';

const TABLE = [
  ['King’s Pawn Opening', 'e4'],
  ['Open Game', 'e4 e5'],
  ['King’s Knight Opening', 'e4 e5 Nf3'],
  ['Italian Game', 'e4 e5 Nf3 Nc6 Bc4'],
  ['Italian Game, Giuoco Piano', 'e4 e5 Nf3 Nc6 Bc4 Bc5'],
  ['Italian Game, Evans Gambit', 'e4 e5 Nf3 Nc6 Bc4 Bc5 b4'],
  ['Italian Game, Two Knights Defence', 'e4 e5 Nf3 Nc6 Bc4 Nf6'],
  ['Two Knights, Fried Liver Attack', 'e4 e5 Nf3 Nc6 Bc4 Nf6 Ng5 d5 exd5 Nxd5 Nxf7'],
  ['Italian Game, Blackburne Shilling Gambit', 'e4 e5 Nf3 Nc6 Bc4 Nd4'],
  ['Ruy Lopez', 'e4 e5 Nf3 Nc6 Bb5'],
  ['Ruy Lopez, Morphy Defence', 'e4 e5 Nf3 Nc6 Bb5 a6'],
  ['Ruy Lopez, Exchange Variation', 'e4 e5 Nf3 Nc6 Bb5 a6 Bxc6'],
  ['Ruy Lopez, Berlin Defence', 'e4 e5 Nf3 Nc6 Bb5 Nf6'],
  ['Scotch Game', 'e4 e5 Nf3 Nc6 d4'],
  ['Three Knights Opening', 'e4 e5 Nf3 Nc6 Nc3'],
  ['Four Knights Game', 'e4 e5 Nf3 Nc6 Nc3 Nf6'],
  ['Ponziani Opening', 'e4 e5 Nf3 Nc6 c3'],
  ['Petrov’s Defence', 'e4 e5 Nf3 Nf6'],
  ['Philidor Defence', 'e4 e5 Nf3 d6'],
  ['Elephant Gambit', 'e4 e5 Nf3 d5'],
  ['Latvian Gambit', 'e4 e5 Nf3 f5'],
  ['Vienna Game', 'e4 e5 Nc3'],
  ['King’s Gambit', 'e4 e5 f4'],
  ['King’s Gambit Accepted', 'e4 e5 f4 exf4'],
  ['Bishop’s Opening', 'e4 e5 Bc4'],
  ['Centre Game', 'e4 e5 d4 exd4 Qxd4'],
  ['Danish Gambit', 'e4 e5 d4 exd4 c3'],
  ['Wayward Queen Attack', 'e4 e5 Qh5'],
  ['Sicilian Defence', 'e4 c5'],
  ['Sicilian Defence, Open', 'e4 c5 Nf3 d6 d4'],
  ['Sicilian Defence, Najdorf', 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6'],
  ['Sicilian Defence, Dragon', 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 g6'],
  ['Sicilian Defence, Old Sicilian', 'e4 c5 Nf3 Nc6'],
  ['Sicilian Defence, Open (…Nc6)', 'e4 c5 Nf3 Nc6 d4'],
  ['Sicilian Defence, French Variation', 'e4 c5 Nf3 e6'],
  ['Sicilian Defence, Alapin', 'e4 c5 c3'],
  ['Sicilian Defence, Closed', 'e4 c5 Nc3'],
  ['Sicilian Defence, Smith-Morra Gambit', 'e4 c5 d4 cxd4 c3'],
  ['Sicilian Defence, Bowdler Attack', 'e4 c5 Bc4'],
  ['French Defence', 'e4 e6'],
  ['French Defence, Advance', 'e4 e6 d4 d5 e5'],
  ['French Defence, Exchange', 'e4 e6 d4 d5 exd5'],
  ['French Defence, Winawer', 'e4 e6 d4 d5 Nc3 Bb4'],
  ['French Defence, Classical', 'e4 e6 d4 d5 Nc3 Nf6'],
  ['French Defence, Tarrasch', 'e4 e6 d4 d5 Nd2'],
  ['Caro-Kann Defence', 'e4 c6'],
  ['Caro-Kann Defence, Advance', 'e4 c6 d4 d5 e5'],
  ['Caro-Kann Defence, Exchange', 'e4 c6 d4 d5 exd5'],
  ['Caro-Kann Defence, Classical', 'e4 c6 d4 d5 Nc3 dxe4 Nxe4 Bf5'],
  ['Scandinavian Defence', 'e4 d5'],
  ['Scandinavian Defence, Main Line', 'e4 d5 exd5 Qxd5 Nc3 Qa5'],
  ['Scandinavian Defence, Modern', 'e4 d5 exd5 Nf6'],
  ['Alekhine’s Defence', 'e4 Nf6'],
  ['Pirc Defence', 'e4 d6 d4 Nf6 Nc3 g6'],
  ['Modern Defence', 'e4 g6'],
  ['Owen’s Defence', 'e4 b6'],
  ['Nimzowitsch Defence', 'e4 Nc6'],
  ['Queen’s Pawn Opening', 'd4'],
  ['Queen’s Pawn Game', 'd4 d5'],
  ['Queen’s Gambit', 'd4 d5 c4'],
  ['Queen’s Gambit Accepted', 'd4 d5 c4 dxc4'],
  ['Queen’s Gambit Declined', 'd4 d5 c4 e6'],
  ['Slav Defence', 'd4 d5 c4 c6'],
  ['Albin Countergambit', 'd4 d5 c4 e5'],
  ['London System', 'd4 d5 Bf4'],
  ['London System', 'd4 Nf6 Bf4'],
  ['London System', 'd4 d5 Nf3 Nf6 Bf4'],
  ['London System', 'd4 Nf6 Nf3 d5 Bf4'],
  ['Colle System', 'd4 d5 Nf3 Nf6 e3'],
  ['Indian Defence', 'd4 Nf6'],
  ['Indian Defence', 'd4 Nf6 c4'],
  ['King’s Indian Defence', 'd4 Nf6 c4 g6 Nc3 Bg7'],
  ['Grünfeld Defence', 'd4 Nf6 c4 g6 Nc3 d5'],
  ['Nimzo-Indian Defence', 'd4 Nf6 c4 e6 Nc3 Bb4'],
  ['Queen’s Indian Defence', 'd4 Nf6 c4 e6 Nf3 b6'],
  ['Bogo-Indian Defence', 'd4 Nf6 c4 e6 Nf3 Bb4+'],
  ['Catalan Opening', 'd4 Nf6 c4 e6 g3'],
  ['Benoni Defence', 'd4 Nf6 c4 c5'],
  ['Benko Gambit', 'd4 Nf6 c4 c5 d5 b5'],
  ['Budapest Gambit', 'd4 Nf6 c4 e5'],
  ['Trompowsky Attack', 'd4 Nf6 Bg5'],
  ['Dutch Defence', 'd4 f5'],
  ['Englund Gambit', 'd4 e5'],
  ['English Opening', 'c4'],
  ['English Opening, Symmetrical', 'c4 c5'],
  ['English Opening, Reversed Sicilian', 'c4 e5'],
  ['Zukertort Opening', 'Nf3'],
  ['Réti Opening', 'Nf3 d5 c4'],
  ['King’s Indian Attack', 'Nf3 d5 g3'],
  ['Bird’s Opening', 'f4'],
  ['Larsen’s Opening', 'b3'],
  ['Polish Opening', 'b4'],
  ['Grob Opening', 'g4'],
  ['Van ’t Kruijs Opening', 'e3'],
];

let index = null;
function build() {
  index = new Map();
  for (const [name, line] of TABLE) {
    const chess = new Chess();
    const sans = [];
    for (const san of line.split(' ')) sans.push(chess.move(san).san);
    index.set(sans.join(' '), { name, plies: sans.length });
  }
}

/** Name the opening of a game from its SAN moves (standard start only). */
export function nameOpening(sans, startFen) {
  if (startFen) return { name: 'Custom position', plies: 0 };
  if (!index) build();
  for (let n = Math.min(sans.length, 12); n > 0; n--) {
    const hit = index.get(sans.slice(0, n).join(' '));
    if (hit) return hit;
  }
  return { name: 'Unusual opening', plies: 0 };
}

export const OPENING_TABLE = TABLE;
