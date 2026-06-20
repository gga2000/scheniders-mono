// =====================================================================
// Iraqi mobile number — validate + normalize (EC23)
// =====================================================================
// COD only works if we can call the customer. The checkout server used to
// accept any string with ≥10 characters, so landlines, `0000000000`, and
// punctuation-laden junk became unconfirmable, undeliverable orders. This is
// the single source of truth for "is this a reachable Iraqi mobile" — usable
// by the storefront checkout now and the admin leads/orders later.
//
// An Iraqi mobile is country code 964 + a 10-digit national significant number
// beginning with 7 (locally written 07XX XXX XXXX). We accept the common ways a
// customer types it — with +964 / 00964, with or without the national leading
// 0, and with spaces, dashes, or parens — and reject everything else.
// =====================================================================

/**
 * Normalize an Iraqi mobile to canonical local form `07XXXXXXXXX` (11 digits),
 * or return null when the input is not a valid Iraqi mobile.
 */
export function normalizeIraqiMobile(
  raw: string | null | undefined,
): string | null {
  if (!raw) return null;
  let d = raw.replace(/\D/g, "");
  if (d.startsWith("00964")) d = d.slice(5);
  else if (d.startsWith("964")) d = d.slice(3);
  if (d.startsWith("0")) d = d.slice(1);
  // National significant number: 7 followed by 9 digits (10 total).
  if (!/^7\d{9}$/.test(d)) return null;
  return `0${d}`;
}

/** True when `raw` is a reachable Iraqi mobile number. */
export function isValidIraqiMobile(raw: string | null | undefined): boolean {
  return normalizeIraqiMobile(raw) !== null;
}
