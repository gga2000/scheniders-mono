// =====================================================================
// Section — site_header  (global)
// =====================================================================
// Persistent storefront header in the Candy Bento lockup: a circular
// bento menu/back button, a centered butter "logo chip" wordmark, and a
// mint cart pill with a live item count. Lives in globals.header and
// ships by default on every V2 page (see StorefrontGlobals). On sub-pages
// the left control becomes a circular back button; on the home page it is
// the menu toggle that opens the mobile category/nav drawer.
//
// The header also owns the language switcher (P1-6): a segmented control
// in the desktop bar and a row in the mobile menu sheet, fed by the
// store's `enabled_locales` (read off the tenant in ctx) and the runtime
// locale. Single-locale stores render no switcher.
// =====================================================================

import { z } from "zod";
import { i18nStringSchema, i18nStringOptional } from "./_schema";
import { registerSection } from "./_registry";
import type { SectionDefinition } from "./_types";
import { SiteHeaderRender } from "./site_header.client";

const navLinkSchema = z.object({
  label_i18n: i18nStringSchema,
  href: z.string(),
});

const schema = z.object({
  /** Header lockup: "bento" = classic Candy Bento bar (default, unchanged
   *  for existing stores); "floating_pill" = fully-rounded surface pill
   *  floating with a margin from the page edges. */
  layout: z.enum(["bento", "floating_pill"]).optional(),
  /** Override the store name shown as the wordmark (defaults to business_name). */
  wordmark_i18n: i18nStringOptional,
  /** "pill" = butter logo chip (default); "plain" = square + wordmark. */
  wordmark_style: z.enum(["pill", "plain"]).optional(),
  /** Logo image for the floating_pill lockup (falls back to tenant branding). */
  logo_image_url: z.string().describe("image").optional(),
  nav_links: z.array(navLinkSchema),
  show_search: z.boolean(),
  show_cart: z.boolean(),
  /** Stick to the top of the viewport on scroll. */
  sticky: z.boolean(),
});

export type Props = z.infer<typeof schema>;

const defaultProps: Props = {
  wordmark_style: "pill",
  nav_links: [
    { label_i18n: { ar: "الرئيسية", en: "Home" }, href: "/" },
    { label_i18n: { ar: "المنتجات", en: "Shop" }, href: "/products" },
    { label_i18n: { ar: "تتبّع الطلب", en: "Track order" }, href: "/track" },
  ],
  show_search: true,
  show_cart: true,
  sticky: true,
};

const definition: SectionDefinition<Props> = {
  type: "site_header",
  category: "page",
  name: { en: "Site header", ar: "ترويسة المتجر" },
  description: {
    en: "Persistent header: logo / store name, nav, search and cart.",
    ar: "ترويسة ثابتة: الشعار أو اسم المتجر، التنقّل، البحث والسلة.",
  },
  thumbnail: "/sections/site_header.svg",
  // Global section — lives in globals.header, never placed on a page.
  valid_on: [],
  schema,
  defaultProps,
  render: SiteHeaderRender,
};

registerSection(definition);
export default definition;
