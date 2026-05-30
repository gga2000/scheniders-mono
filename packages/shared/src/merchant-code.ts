/**
 * Returns the canonical 6-digit merchant code.
 *
 * Prefers the real DB-backed `display_id` (collision-free, sequence-backed),
 * and falls back to a UUID hash so the function keeps working before the
 * migration runs. Once every tenant has a `display_id`, the hash branch is
 * never taken.
 *
 * Display as `#NNNNNN` or `NNNNNN`.
 */
export function getMerchantCode(
  idOrTenant: string | { id?: string; display_id?: number | string | null }
): string {
  if (!idOrTenant) return "000000";

  if (typeof idOrTenant === "object") {
    const dispId = idOrTenant.display_id;
    if (dispId !== null && dispId !== undefined && dispId !== "") {
      return String(dispId).padStart(6, "0");
    }
    return hashCode(idOrTenant.id ?? "");
  }

  return hashCode(idOrTenant);
}

function hashCode(id: string): string {
  if (!id) return "000000";
  let hash = 5381;
  for (let i = 0; i < id.length; i++) {
    hash = ((hash << 5) + hash) ^ id.charCodeAt(i);
  }
  const num = Math.abs(hash) % 1_000_000;
  return num.toString().padStart(6, "0");
}

/**
 * Returns true when the search query plausibly targets a merchant code.
 * Accepts an optional leading `#` and 1–6 digits.
 */
export function isMerchantCodeQuery(query: string): boolean {
  return /^#?\d{1,6}$/.test(query.trim());
}

/**
 * Normalises a code-style query for prefix matching.
 * "#000123" → "000123"; "23" → "23"; "  #42 " → "42".
 */
export function normalizeMerchantCodeQuery(query: string): string {
  return query.trim().replace(/^#/, "");
}
