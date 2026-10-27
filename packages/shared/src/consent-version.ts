// =====================================================================
// consent-version: the fingerprint of a WhatsApp consent line
// =====================================================================
// abandoned_carts.consent_text_version records WHICH consent line a buyer
// saw when they typed their phone. Two sides compute it and must agree:
//   * the storefront capture endpoint, from the line the PDP sent;
//   * the reminder sweep, from the line the store's config renders, before
//     it may message a capture (only a matching version counts as consent).
// Both import this function, so the normalization (trim, then NFC) cannot
// drift between them.
//
// Subpath export only (`@scheniders/shared/consent-version`), never the
// barrel: node:crypto behind `export *` gets polyfilled into every client
// route that imports anything from @scheniders/shared.
// =====================================================================

import { createHash } from "node:crypto";

/** "sha256:" + the first 16 hex of SHA-256 over the trimmed, NFC-normalized
 *  consent line. */
export function consentVersion(text: string): string {
  const canonical = text.trim().normalize("NFC");
  return `sha256:${createHash("sha256").update(canonical).digest("hex").slice(0, 16)}`;
}
