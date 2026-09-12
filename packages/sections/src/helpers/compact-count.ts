// =====================================================================
// compact-count — the one place that decides how a proof number reads
// =====================================================================
// Public counts round DOWN, never up. A figure refreshed on a schedule
// is always a little stale, and a number that can only understate stays
// true between refreshes and as it grows. Rounding up would publish a
// claim the data does not support.
// =====================================================================

/**
 * Round down to two significant figures at or above 100; below that the
 * exact value (an exact 18 is a stronger claim than a vague "+10").
 * Non-finite or non-positive input means "no count", i.e. 0.
 */
export function roundDownCompact(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (value < 100) return Math.floor(value);
  const digits = Math.floor(Math.log10(value)) + 1;
  const step = 10 ** (digits - 2);
  return Math.floor(value / step) * step;
}

/**
 * Display form. The `+` appears ONLY when rounding actually dropped
 * something — on an exact figure it would make a complete fact look
 * like a partial one. Returns null when there is nothing true to show,
 * so callers drop the slot rather than render a bare unit.
 */
export function formatCompactCount(value?: number | null): string | null {
  if (value == null) return null;
  const rounded = roundDownCompact(value);
  if (rounded <= 0) return null;
  const prefix = rounded < value ? "+" : "";
  return `${prefix}${rounded}`;
}
