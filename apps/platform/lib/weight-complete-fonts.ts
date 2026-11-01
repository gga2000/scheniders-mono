/**
 * Google Fonts families confirmed to serve 400, 500, 600 and 700, the
 * weights body copy, labels and headings use. Checked against the live css2
 * endpoint with a browser user-agent, one weight per request (a request for
 * a single missing weight is a 400; a multi-weight request answers 200 and
 * silently leaves the missing faces out). Latin entries checked 2026-10-19,
 * re-checked with the Arabic entries 2026-10-20; every Arabic entry also
 * ships an `arabic` subset.
 *
 * The storefront fetches most families through the multi-weight css2 URL
 * that buildBrandKitFontsUrl (packages/shared) builds. Because that request
 * still answers 200, nothing fails loudly when a family lacks a weight: the
 * browser falls back to the nearest face (or synthesises one), so 500
 * renders as 400 and 600 as 700 and the type hierarchy collapses. Almarai
 * (300/400/700/800), Tajawal (no 600) and Amiri (400/700) were caught this
 * way. Verify a family the same way before adding it here.
 *
 * This list only says what Google serves. The families in
 * SELF_HOSTED_FONT_VARS (Bricolage Grotesque, DM Sans, Cairo, Noto Sans
 * Arabic, IBM Plex Sans Arabic, Readex Pro) are left out of that URL and served by next/font in the storefront
 * root layout, so the weights a store actually gets for them are whatever
 * that layout loads. A self-hosted family on this list is only complete on
 * the storefront when the layout loads it variable or with 400-700.
 *
 * Presets (store templates, brand themes) are checked against this list by
 * their tests; merchants can still pick any family in the editor.
 */
export const WEIGHT_COMPLETE_FONTS: ReadonlySet<string> = new Set([
    // Latin
    "Bricolage Grotesque",
    "DM Sans",
    "Inter Tight",
    "Jost",
    "Manrope",
    "Outfit",
    "Playfair Display",
    "Space Grotesk",
    // Arabic
    "Alexandria",
    "Baloo Bhaijaan 2",
    "Cairo",
    "Changa",
    "El Messiri",
    "IBM Plex Sans Arabic",
    "Noto Kufi Arabic",
    "Noto Naskh Arabic",
    "Noto Sans Arabic",
    "Readex Pro",
    "Reem Kufi",
    "Rubik",
]);
