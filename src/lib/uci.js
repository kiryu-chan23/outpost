// UCI text parsing and score maths shared by the browser engine wrapper and
// the Node content scripts.

/** Parse an "info … pv …" line. Returns null for lines without a principal variation. */
export function parseInfo(line) {
  if (!line.startsWith('info') || !line.includes(' pv ')) return null;
  const tok = line.split(/\s+/);
  const out = { multipv: 1, depth: 0, cp: null, mate: null, pv: [], bound: null };
  for (let i = 1; i < tok.length; i++) {
    const t = tok[i];
    if (t === 'depth') out.depth = +tok[++i];
    else if (t === 'multipv') out.multipv = +tok[++i];
    else if (t === 'score') {
      const kind = tok[++i];
      const val = +tok[++i];
      if (kind === 'cp') out.cp = val;
      else if (kind === 'mate') out.mate = val;
      if (tok[i + 1] === 'lowerbound' || tok[i + 1] === 'upperbound') out.bound = tok[++i];
    } else if (t === 'pv') {
      out.pv = tok.slice(i + 1);
      break;
    }
  }
  return out;
}

/** Collapse a score to centipawns for comparisons. Mates map to large values that still order by distance. */
export function scoreToCp(s) {
  if (!s) return 0;
  if (s.mate != null) return s.mate > 0 ? 10000 - s.mate * 10 : -10000 - s.mate * 10;
  return s.cp ?? 0;
}

/** Expected score (0–100) for the side the score belongs to. Logistic fit commonly used for engine centipawns. */
export function winPct(s) {
  if (!s) return 50;
  if (s.mate != null) return s.mate > 0 ? 100 : 0;
  const cp = Math.max(-1500, Math.min(1500, s.cp ?? 0));
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
}

export const flipScore = (s) => (s ? { cp: s.cp == null ? null : -s.cp, mate: s.mate == null ? null : -s.mate } : s);

/** "+1.4", "−0.3", "M3", "−M2" from White's point of view. */
export function formatScore(s) {
  if (!s) return '–';
  if (s.mate != null) return (s.mate < 0 ? '−' : '') + 'M' + Math.abs(s.mate);
  const v = (s.cp ?? 0) / 100;
  if (Math.abs(v) < 0.05) return '0.0';
  return (v > 0 ? '+' : '−') + Math.abs(v).toFixed(1);
}
