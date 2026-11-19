/**
 * A money figure on the Merchants card never cuts mid-number. Round 17 saw
 * "43,80…" and "250,00…": the figure and its unit shared one cut line in a
 * column 61 to 93 px wide. Now the figure keeps its full size while it fits,
 * and a longer one takes a smaller size, just enough to fit its column (the
 * nearest `@container`). It never goes under 13 px, the console's smallest
 * text; at that size a 61 px column still holds 9,999,999.
 */

/** Width of a digit and of a separator, in em, with room to spare for the console's fonts. */
const DIGIT_EM = 0.62;
const MARK_EM = 0.3;
const SMALLEST_REM = 0.8125;

/** About how wide `text` runs, in em of its own font size. */
export function figureWidthEm(text: string): number {
  return [...text].reduce((sum, char) => sum + (/\d/.test(char) ? DIGIT_EM : MARK_EM), 0);
}

/** The CSS font size that fits `text` into its container, at most `largestRem`. */
export function fittedFontSize(text: string, largestRem: number): string {
  const perEm = 100 / Math.max(figureWidthEm(text), 1);
  return `clamp(${SMALLEST_REM}rem, ${Number(perEm.toFixed(2))}cqi, ${largestRem}rem)`;
}
