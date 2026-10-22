// =====================================================================
// vCard 3.0 — "save this number" for the thank-you call card
// =====================================================================
// A buyer who has saved the store's calling number picks up a call that
// would otherwise look like a stranger's. The card offers a one-tap save:
// the vCard travels as a data: URL, so nothing is fetched and no file is
// hosted. RFC 2426: CRLF line endings; `\` `,` `;` and newlines escaped
// in text values.
// =====================================================================

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
