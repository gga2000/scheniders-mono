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

/**
 * Display form of an Iraqi mobile for storefront chrome (footer, contact
 * cards): `0777 970 3832` — the national `07XX XXX XXXX` grouping Iraqi
 * readers expect, never raw E.164. Anything that is not an Iraqi mobile
 * (a landline, a foreign number) is returned trimmed and untouched, so the
 * caller can still render it.
 */
export function formatIraqiPhoneDisplay(raw: string): string {
  const local = normalizeIraqiMobile(raw);
  if (!local) return raw.trim();
  return `${local.slice(0, 4)} ${local.slice(4, 7)} ${local.slice(7)}`;
}

/**
 * The buyer's own number echoed back without exposing it whole: the
 * operator prefix and the last four digits stay readable (`0770 ••• 4567`)
 * so the buyer recognises it, the middle three are hidden so a screenshot
 * or a shoulder-surfer does not carry the full number. Null when the input
 * is not an Iraqi mobile — the caller then shows nothing.
 */
export function maskIraqiMobile(raw: string | null | undefined): string | null {
  const local = normalizeIraqiMobile(raw);
  if (!local) return null;
  return `${local.slice(0, 4)} ••• ${local.slice(7)}`;
}
