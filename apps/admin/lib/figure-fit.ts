/**
 * A money figure on the Merchants card never cuts mid-number. Round 17 saw
 * "43,80…" and "250,00…": the figure and its unit shared one cut line in a
 * column 61 to 93 px wide. Now the figure keeps its full size while it fits,
 * and a longer one takes a smaller size, just enough to fit its column (the
 * nearest `@container`). It never goes under 13 px, the console's smallest
 * text. At 1280 px that holds 999,999 in the 61 px fees column and 9,999,999
 * in the 73 px balance column. A longer figure is still whole, and runs a
 * few pixels into the stat box's own padding instead.
 */

/**
 * Width of a digit and of a separator, in em. Measured live at weight 900:
 * 0.645 and 0.269. These keep about 5% to spare for other system fonts.
 */
const DIGIT_EM = 0.68;
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
