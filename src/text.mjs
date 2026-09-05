// Deterministic text metrics. See spec/DSL.md §5.8.
// No DOM, no font loading — the same string always yields the same wrap.

const NARROW = new Set("ijlt.,:;|!'`".split(""));
const THIN   = new Set("fIr()[]{}/\\-".split(""));
const DIGIT  = new Set("0123456789".split(""));
const WIDE   = new Set("mw".split(""));
const XWIDE  = new Set("MW@".split(""));

const SAFETY = 1.06;

// Meaning-bearing glyphs get an exact advance instead of the 0.556em fallback.
// The severity marks on branch labels (D1) sit in marginal text, which is
// clamped to the exact gap before the next label and has none of the padding a
// box gives its text — so an advance that is 40% light here is a collision, not
// a rounding error. Measured in the real stack (ui-sans-serif / -apple-system)
// at 600 weight, the weight branch labels are drawn in:
//   ▲ 9.30px   ✗ 9.90px   ⓘ 11.79px   ✓ 10.75px   @ 12px
const GLYPH_EM = new Map([
  ["\u25B2", 0.775],   // ▲  warn
  ["\u2717", 0.825],   // ✗  error
  ["\u24D8", 0.983],   // ⓘ  info
  ["\u2713", 0.896],   // ✓  success
]);

/** Advance width of one character, in em units. */
export function charEm(ch) {
  if (ch === " ") return 0.278;
  const glyph = GLYPH_EM.get(ch);
  if (glyph !== undefined) return glyph;
  if (NARROW.has(ch)) return 0.300;
  if (THIN.has(ch)) return 0.340;
  if (DIGIT.has(ch)) return 0.556;
  if (WIDE.has(ch)) return 0.850;
  if (XWIDE.has(ch)) return 0.940;
  if (ch >= "A" && ch <= "Z") return 0.680;
  return 0.556;
}

/** Width of a string in px at the given font size. */
export function measure(str, size, bold = false) {
  let em = 0;
  for (const ch of String(str)) em += charEm(ch);
  // Bold faces run ~4% wider across this stack.
  return em * size * SAFETY * (bold ? 1.04 : 1);
}

/** Monospace advance is exact: every glyph is the same width. */
export function measureMono(str, size) {
  return String(str == null ? "" : str).length * 0.6 * size;
}

/**
 * Greedy word wrap to a pixel width. Tokens longer than the line are hard-broken.
 * Returns an array of lines. Always deterministic.
 */
export function wrap(str, maxWidth, size, bold = false) {
  const text = String(str == null ? "" : str).replace(/\s+/g, " ").trim();
  if (!text) return [];
  const words = text.split(" ");
  const lines = [];
  let line = "";

  const push = () => { if (line) { lines.push(line); line = ""; } };

  for (let word of words) {
    // Hard-break a token that cannot fit on a line of its own.
    while (measure(word, size, bold) > maxWidth) {
      let cut = 1;
      while (cut < word.length && measure(word.slice(0, cut + 1), size, bold) <= maxWidth) cut++;
      if (line) push();
      lines.push(word.slice(0, cut));
      word = word.slice(cut);
    }
    if (!word) continue;
    const candidate = line ? line + " " + word : word;
    if (measure(candidate, size, bold) <= maxWidth) line = candidate;
    else { push(); line = word; }
  }
  push();
  return lines;
}

/** Wrap, then truncate to maxLines with an ellipsis on the last line. */
export function wrapClamp(str, maxWidth, size, maxLines, bold = false) {
  const lines = wrap(str, maxWidth, size, bold);
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  let last = kept[maxLines - 1];
  while (last.length && measure(last + "…", size, bold) > maxWidth) last = last.slice(0, -1);
  kept[maxLines - 1] = last.replace(/\s+$/, "") + "…";
  return kept;
}
