// Iraqi mobile entry for the express form: the shopper sees their number
// grouped the way it is read aloud ("0780 230 1677") while typing, and gets
// a specific reason when it cannot be a reachable Iraqi mobile — too short,
// too long, not starting 07, or not an operator range. The submitted value
// still goes through the shared normalizeIraqiMobile, so the server
// contract is unchanged.

/** Iraqi mobile operator ranges after the leading 07: Korek 075, Asiacell
 *  077, Zain 078 / 079. Deliberately stricter than the shared
 *  normalizeIraqiMobile (which accepts any 07X): the merchant asked for the
 *  Iraqi-standard guard, so the express form refuses to post a number
 *  outside these ranges and says why (see the submit guard in
 *  express-view.tsx). */
const OPERATOR_DIGITS = new Set(["5", "7", "8", "9"]);
/** National format length: 07XX XXX XXXX. */
export const IRAQI_MOBILE_DIGITS = 11;

const ARABIC_INDIC = "٠١٢٣٤٥٦٧٨٩";
const EASTERN_ARABIC = "۰۱۲۳۴۵۶۷۸۹";

/** Digits only, Arabic-Indic numerals mapped to Latin, and an international
 *  prefix (+964 / 00964 / 964) rewritten to the national leading 0 — with
 *  the trunk 0 some people keep after it ("+964 0770…") dropped first,
 *  exactly as normalizeIraqiMobile does. */
export function phoneDigits(raw: string): string {
  let d = "";
  for (const ch of raw) {
    const a = ARABIC_INDIC.indexOf(ch);
    const e = EASTERN_ARABIC.indexOf(ch);
    if (a >= 0) d += String(a);
    else if (e >= 0) d += String(e);
    else if (ch >= "0" && ch <= "9") d += ch;
  }
  if (d.startsWith("00964")) return national(d.slice(5));
  if (d.startsWith("964") && d.length > 3) return national(d.slice(3));
  if (d.startsWith("7")) return `0${d}`;
  return d;
}

/** The national form of what follows a stripped +964: one trunk 0 is
 *  dropped (normalizeIraqiMobile does the same), then the 0 is restored. */
function national(rest: string): string {
  return `0${rest.startsWith("0") ? rest.slice(1) : rest}`;
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

/** The grouped value and caret after one edit of a grouped phone input. */
export interface PhoneEdit {
  value: string;
  caret: number;
}

/**
 * Apply one edit to a grouped phone value. `prev` is the value before the
 * edit, `raw` what the browser produced, `caret` the browser's caret in
 * `raw` and `inputType` the InputEvent type when known.
 *
 * Deleting only a group space would be undone by the reformat — the caret
 * would hop and nothing would change — so a deletion that removed nothing
 * but a separator removes the digit beside it instead: the one before for
 * Backspace, the one after for Delete.
 */
export function applyPhoneEdit(
  prev: string,
  raw: string,
  caret: number,
  inputType?: string,
): PhoneEdit {
  let text = raw;
  let at = caret;
  const separatorOnly =
    raw.length === prev.length - 1 &&
    prev[caret] === " " &&
    raw === prev.slice(0, caret) + prev.slice(caret + 1);
  if (separatorOnly) {
    if (inputType === "deleteContentForward") {
      text = prev.slice(0, caret) + prev.slice(caret + 2);
    } else {
      text = prev.slice(0, Math.max(0, caret - 1)) + prev.slice(caret + 1);
      at = Math.max(0, caret - 1);
    }
  }
  const before = phoneDigits(text.slice(0, at)).length;
  const value = formatPhoneGroups(phoneDigits(text));
  return { value, caret: caretAfterDigits(value, before) };
}
