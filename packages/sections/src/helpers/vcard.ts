// =====================================================================
// vCard 3.0 — "save this number" for the thank-you call card
// =====================================================================
// A buyer who has saved the store's calling number picks up a call that
// would otherwise look like a stranger's. The card offers a one-tap save:
// the vCard travels as a data: URL, so nothing is fetched and no file is
// hosted. RFC 2426: CRLF line endings; `\` `,` `;` and newlines escaped
// in text values.
// =====================================================================

import { resolveI18n } from "@scheniders/shared";
import type { I18nString, LocaleCode } from "@scheniders/shared";
import { storeDisplayName } from "./store-name";

/** Chrome strings (ar / en / ku — guarded by _kurdish-coverage through
 *  _string-tables). `{store}` = `storeDisplayName`. */
export const VCARD_STRINGS = {
  contactName: { en: "{store} — order confirmation", ar: "{store} — تأكيد الطلبات", ku: "{store} — پشتڕاستکردنەوەی داواکاری" },
} satisfies Record<string, I18nString>;

/** The name the store's number is saved under, from every surface that
 *  offers the save (the thank-you call card, the PDP promise band). */
export function vcardContactName(tenant: unknown, locale: LocaleCode): string {
  return resolveI18n(VCARD_STRINGS.contactName, locale)
    .split("{store}")
    .join(storeDisplayName(tenant, locale))
    .trim();
}

/** Escape a vCard TEXT value (RFC 2426 §4). Backslash first, so the
 *  escapes added after it are not themselves escaped. */
function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

export function buildVCard(input: { name: string; phoneE164: string }): string {
  const name = escapeText(input.name.trim());
  return [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `N:${name};;;;`,
    `FN:${name}`,
    `TEL;TYPE=CELL,VOICE:${input.phoneE164}`,
    "END:VCARD",
  ].join("\r\n");
}

export function vcardHref(vcard: string): string {
  return `data:text/vcard;charset=utf-8,${encodeURIComponent(vcard)}`;
}

/** Download name: the contact name without path or reserved characters. */
export function vcardFileName(name: string): string {
  const safe = name
    .replace(/[\\/:*?"<>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return `${safe || "contact"}.vcf`;
}
