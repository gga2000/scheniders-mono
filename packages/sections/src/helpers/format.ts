/**
 * Schneiders price format: "85,000 د.ع"
 * - Latin digits with thousands separator (per design files)
 * - Short Arabic IQD suffix
 */
export function formatPrice(amount: number): string {
  const n = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.max(0, Math.round(amount)));
  return `${n} د.ع`;
}

export function formatSavings(original: number, current: number): string | null {
  if (!original || original <= current) return null;
  return formatPrice(original - current);
}
