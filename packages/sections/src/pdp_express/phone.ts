// Iraqi mobile entry for the express form: the shopper sees their number
// grouped the way it is read aloud ("0780 230 1677") while typing, and gets
// a specific reason when it cannot be a reachable Iraqi mobile — too short,
// too long, not starting 07, or not an operator range. The submitted value
// still goes through the shared normalizeIraqiMobile, so the server
// contract is unchanged.

/** Iraqi mobile operator ranges after the leading 07: Korek 075, Asiacell
 *  077, Zain 078 / 079. */
const OPERATOR_DIGITS = new Set(["5", "7", "8", "9"]);
/** National format length: 07XX XXX XXXX. */
export const IRAQI_MOBILE_DIGITS = 11;

const ARABIC_INDIC = "٠١٢٣٤٥٦٧٨٩";
const EASTERN_ARABIC = "۰۱۲۳۴۵۶۷۸۹";

/** Digits only, Arabic-Indic numerals mapped to Latin, and an international
 *  prefix (+964 / 00964 / 964) rewritten to the national leading 0. */
export function phoneDigits(raw: string): string {
  let d = "";
  for (const ch of raw) {
    const a = ARABIC_INDIC.indexOf(ch);
    const e = EASTERN_ARABIC.indexOf(ch);
    if (a >= 0) d += String(a);
    else if (e >= 0) d += String(e);
    else if (ch >= "0" && ch <= "9") d += ch;
  }
  if (d.startsWith("00964")) d = `0${d.slice(5)}`;
  else if (d.startsWith("964") && d.length > 3) d = `0${d.slice(3)}`;
  else if (d.startsWith("7")) d = `0${d}`;
  return d;
}

/** 4-3-4 grouping, applied progressively while typing. */
export function formatPhoneGroups(digits: string): string {
  const parts = [digits.slice(0, 4), digits.slice(4, 7), digits.slice(7)];
  return parts.filter(Boolean).join(" ");
}

export type PhoneIssue = "prefix" | "operator" | "long" | "short";

/** Why `digits` cannot be an Iraqi mobile, or null when it is one (or is
 *  still being typed validly — "short" is only reported when `final`). */
export function phoneIssue(digits: string, final: boolean): PhoneIssue | null {
  if (digits.length === 0) return null;
  if (!digits.startsWith("0") || (digits.length >= 2 && digits[1] !== "7")) {
    return "prefix";
  }
  if (digits.length >= 3 && !OPERATOR_DIGITS.has(digits[2] ?? "")) {
    return "operator";
  }
  if (digits.length > IRAQI_MOBILE_DIGITS) return "long";
  if (final && digits.length < IRAQI_MOBILE_DIGITS) return "short";
  return null;
}

/** Caret position in `formatted` just after its `n`-th digit. */
export function caretAfterDigits(formatted: string, n: number): number {
  if (n <= 0) return 0;
  let seen = 0;
  for (let i = 0; i < formatted.length; i++) {
    if (formatted[i] !== " ") seen++;
    if (seen === n) return i + 1;
  }
  return formatted.length;
}
