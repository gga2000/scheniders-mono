// =====================================================================
// The chrome string tables — one list, read by every copy guard
// =====================================================================
// Each file here holds one `STRINGS` / `<PREFIX>_STRINGS` table of
// shopper-facing chrome with ar, en and ku on every entry.
// `_kurdish-coverage.test.ts` checks every entry has `ku`; the Arabic copy
// lint (slice 1f) reads the same list. New chrome strings go ONLY into a
// file on this list, and a new table file is added here in the same commit
// that creates it (1d: image_gallery.strings.ts, 1e:
// faq_contact_split.strings.ts, 1f: sticky_cta_bar.strings.ts).
//
// `helpers/chrome-strings.ts` is deliberately NOT on the list: four of its
// entries (company_legal_name_label, business_license_label, made_in_iraq,
// newsletter_success) have no `ku` by design (`ChromeEntry.ku` is
// optional), so it would fail the coverage check. Do not add new strings
// there.
//
// Paths are relative to packages/sections/src.
// =====================================================================

export const STRING_TABLE_FILES: readonly string[] = [
  "cart_line_items.client.tsx",
  "checkout_form.client.tsx",
  "order_confirmation_call_card.client.tsx",
  "order_tracker.client.tsx",
  "pdp_direct_order.client.tsx",
  "pdp_express/strings.ts",
  "product_reviews/strings.ts",
  "search_results_grid.client.tsx",
  "helpers/vcard.ts",
  "image_gallery.strings.ts",
  "faq_contact_split.strings.ts",
];
