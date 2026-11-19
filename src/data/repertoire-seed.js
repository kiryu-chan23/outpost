// Starter repertoire lines so rehearsal works on day one. Notes are original.
// Notes are keyed by ply index (0 = White's first move).
export const SEED_LINES = [
  {
    id: 'seed-italian',
    color: 'w',
    name: 'Italian Game — quiet build-up',
    moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'c3', 'Nf6', 'd3', 'd6', 'O-O', 'O-O', 'Re1', 'a6', 'Bb3'],
    notes: {
      4: 'The bishop eyes f7, the weakest square in Black’s camp.',
      6: 'c3 prepares d4 one day and gives the bishop a retreat on c2.',
      8: 'd3 holds e4 calmly. No need to open the centre before castling.',
      12: 'The rook backs up e4 and gets ready for a later d4.',
      14: 'Tucks the bishop away before …Na5 can hit it.',
    },
  },
  {
    id: 'seed-alapin',
    color: 'w',
    name: 'Against the Sicilian: Alapin c3',
    moves: ['e4', 'c5', 'c3', 'Nf6', 'e5', 'Nd5', 'd4', 'cxd4', 'Nf3', 'Nc6', 'cxd4', 'd6', 'Bc4'],
    notes: {
      2: 'c3 prepares d4 so you get a full pawn centre without Open Sicilian theory.',
      4: 'Kick the knight; it has to find a square in the centre.',
      8: 'Develop first — the d4 pawn can be recaptured with the c-pawn.',
      12: 'The bishop puts pressure on the knight on d5.',
    },
  },
  {
    id: 'seed-caro',
    color: 'b',
    name: 'Caro-Kann — Advance Variation',
    moves: ['e4', 'c6', 'd4', 'd5', 'e5', 'Bf5', 'Nf3', 'e6', 'Be2', 'c5'],
    notes: {
      1: 'c6 prepares …d5 with a pawn ready to recapture.',
      3: 'Strike the centre at once.',
      5: 'Develop the light-squared bishop before …e6 locks it in.',
      7: 'Solid: now every black pawn sits on a light square, away from the bishop.',
      9: 'Hit the white centre from the side — the standard counterplay.',
    },
  },
  {
    id: 'seed-qgd',
    color: 'b',
    name: 'Queen’s Gambit Declined',
    moves: ['d4', 'd5', 'c4', 'e6', 'Nc3', 'Nf6', 'Bg5', 'Be7', 'e3', 'O-O', 'Nf3', 'h6'],
    notes: {
      3: 'e6 keeps the d5 pawn firmly protected.',
      7: 'Breaks the pin on the knight so the queen is no longer a target.',
      9: 'Castle early; the centre is closed enough to wait.',
      11: 'Ask the bishop a question before deciding how to free your game.',
    },
  },
];
