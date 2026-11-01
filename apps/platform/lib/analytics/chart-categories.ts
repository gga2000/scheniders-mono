/**
 * Category colours for the reports donuts, and the rule for how many get one.
 *
 * Categorical hues are assigned in a FIXED order and never cycled: a ninth reason
 * must not wrap round to the first colour. A donut keeps its top few categories and
 * folds the rest into one neutral "Other" slice, so the chart and its list always
 * show the same rows. Hues are the first five slots of the validated reference
 * palette (adjacent colour-blind separation checked there).
 */
export const SERIES_COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4"] as const;
export const OTHER_COLOR = "#8a8984";

/** Ordered (low -> high) single-hue ramp for ordinal buckets such as contact attempts. */
export const ORDINAL_BLUES = ["#b9d3f3", "#7fb0ec", "#2a78d6", "#1b4f93"] as const;

/**
 * Keep the first `keep` rows (input is already sorted by size) and fold the tail
 * into one row built by `merge`. Returns the rows untouched when the tail is at most
 * one row (folding a single row into "Other" would only rename it).
 */
export function foldTail<T>(rows: T[], keep: number, merge: (tail: T[]) => T): T[] {
    if (rows.length <= keep + 1) return rows;
    return [...rows.slice(0, keep), merge(rows.slice(keep))];
}

/** Colour for the row at `index` of a folded list: fixed slots, then neutral for "Other". */
export function seriesColor(index: number, total: number, hasOther: boolean): string {
    return hasOther && index === total - 1 ? OTHER_COLOR : SERIES_COLORS[index % SERIES_COLORS.length];
}
