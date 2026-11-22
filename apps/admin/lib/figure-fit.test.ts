import { describe, expect, it } from "vitest";
import { figureWidthEm, fittedFontSize } from "./figure-fit";

/*
 * Round 17 (Craft new 2): the Merchants card cut its money figures mid-number,
 * "43,80…" at 1280 px and "250,00…" at 1440. The columns measured live are
 * 61 px (fees, after its padding) and 73 px (balance) at 1280, and 81 and
 * 93 px at 1440. A tabular digit of the card's figure, as drawn live, is
 * 0.645 em wide and a comma 0.269 em (weight 900). A first try counted
 * 0.578 and 0.233 from a probe without the figure's own style, and live the
 * figures ran 1 to 14 px over.
 */

const DIGIT = 0.645;
const COMMA = 0.269;
const SMALLEST_PX = 13;
const LARGEST_PX = 18;

/** The size the browser gives `text` in a column `columnPx` wide. */
function sizeIn(text: string, columnPx: number): number {
  const css = fittedFontSize(text, LARGEST_PX / 16);
  const match = css.match(/^clamp\(([\d.]+)rem, ([\d.]+)cqi, ([\d.]+)rem\)$/);
  if (!match) throw new Error(`not a clamp: ${css}`);
  const [low, perCent, high] = [Number(match[1]) * 16, Number(match[2]), Number(match[3]) * 16];
  return Math.min(high, Math.max(low, (columnPx * perCent) / 100));
}

/** How wide `text` is drawn at `px`. */
function drawnWidth(text: string, px: number): number {
  return [...text].reduce((sum, char) => sum + (/\d/.test(char) ? DIGIT : COMMA), 0) * px;
}

describe("a money figure on the Merchants card", () => {
  it.each([
    ["0", 61],
    ["43,800", 61],
    ["250,000", 61],
    ["999,999", 61],
    ["250,000", 73],
    ["9,999,999", 73],
    ["2,475,000", 81],
    ["12,475,000", 81],
    ["12,475,000", 93],
  ])("%s fits whole in a %i px column", (figure, column) => {
    expect(drawnWidth(figure, sizeIn(figure, column))).toBeLessThanOrEqual(column);
  });

  it("keeps the full size while the figure fits", () => {
    expect(sizeIn("43,800", 73)).toBe(LARGEST_PX);
    expect(sizeIn("250,000", 93)).toBe(LARGEST_PX);
    expect(sizeIn("43,800", 61)).toBeGreaterThan(16);
  });

  it("never goes under 13 px, where a longer figure runs into the box's padding, whole", () => {
    expect(sizeIn("1,250,000", 61)).toBe(SMALLEST_PX);
    expect(drawnWidth("1,250,000", SMALLEST_PX) - 61).toBeLessThan(14);
    expect(sizeIn("125,000,000", 61)).toBe(SMALLEST_PX);
  });

  it("counts digits wider than separators", () => {
    expect(figureWidthEm("00")).toBeGreaterThan(figureWidthEm(",,"));
    expect(figureWidthEm("1,000")).toBeLessThan(figureWidthEm("10000"));
  });
});
