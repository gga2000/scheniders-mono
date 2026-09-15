// =====================================================================
// Section — site_footer  (global)
// =====================================================================
// Persistent storefront footer: wordmark + tagline, link columns
// (shop / help / policies), a COD reassurance badge, and copyright.
// Lives in globals.footer. Rendered by default on every V2 page when a
// tenant has not configured one (see StorefrontGlobals). Dark "anchor"
// surface in the candy/bento language.
// =====================================================================

import { z } from "zod";
import { i18nStringSchema, i18nStringOptional } from "./_schema";
import { registerSection } from "./_registry";
import type { SectionDefinition, SectionRenderContext } from "./_types";
import { SiteFooterRender } from "./site_footer.client";

const navLinkSchema = z.object({
  label_i18n: i18nStringSchema,
  href: z.string(),
});

const columnSchema = z.object({
  heading_i18n: i18nStringSchema,
  links: z.array(navLinkSchema),
});

const contactSchema = z.object({
  phone: z.string().optional(),
  address_i18n: i18nStringOptional,
});

const legalSchema = z.object({
  company_name: z.string().optional(),
  business_license: z.string().optional(),
});

const socialLinksSchema = z.object({
  tiktok: z.string().optional(),
  instagram: z.string().optional(),
  twitter: z.string().optional(),
  facebook: z.string().optional(),
});

const newsletterSchema = z.object({
  enabled: z.boolean(),
  copy_i18n: i18nStringOptional,
  placeholder_i18n: i18nStringOptional,
  button_i18n: i18nStringOptional,
  /** Success line — the place to surface a promised coupon code. */
  success_i18n: i18nStringOptional,
});

const schema = z.object({
  /** Footer lockup: "bento" = classic dark anchor footer (default,
   *  unchanged for existing stores); "info_panel" = light rounded panel
   *  with brand / links / contact+legal columns and a rights line. */
  layout: z.enum(["bento", "info_panel"]).optional(),
  tagline_i18n: i18nStringOptional,
  columns: z.array(columnSchema),
  show_cod_badge: z.boolean(),
  /** info_panel: heading above the link list (falls back to the first
   *  column's heading). */
  links_heading_i18n: i18nStringOptional,
  /** info_panel: contact lines (phone + address, shown per locale). */
  contact: contactSchema.optional(),
  /** info_panel: legal identity lines. */
  legal: legalSchema.optional(),
  /** info_panel: bottom rights line (falls back to "© year name"). */
  rights_i18n: i18nStringOptional,
  /** info_panel: social profile URLs — only non-empty entries render. */
  social_links: socialLinksSchema.optional(),
  /** info_panel: email-capture row above the rights line. */
  newsletter: newsletterSchema.optional(),
});

export type Props = z.infer<typeof schema>;

const defaultProps: Props = {
  tagline_i18n: {
    ar: "تسوّق بثقة — الدفع عند الاستلام بكل العراق.",
    en: "Shop with confidence — cash on delivery across Iraq.",
  },
  columns: [
    {
      heading_i18n: { ar: "تسوّق", en: "Shop" },
      links: [
        { label_i18n: { ar: "كل المنتجات", en: "All products" }, href: "/products" },
        { label_i18n: { ar: "بحث", en: "Search" }, href: "/search" },
      ],
    },
    {
      heading_i18n: { ar: "المساعدة", en: "Help" },
      links: [
        { label_i18n: { ar: "تتبّع الطلب", en: "Track order" }, href: "/track" },
        { label_i18n: { ar: "الأسئلة الشائعة", en: "FAQ" }, href: "/faq" },
        { label_i18n: { ar: "تواصل معنا", en: "Contact" }, href: "/contact" },
      ],
    },
    {
      heading_i18n: { ar: "السياسات", en: "Policies" },
      links: [
        { label_i18n: { ar: "الشحن والتوصيل", en: "Shipping" }, href: "/policies/shipping" },
        { label_i18n: { ar: "الإرجاع والتبديل", en: "Returns" }, href: "/policies/returns" },
        { label_i18n: { ar: "الخصوصية", en: "Privacy" }, href: "/policies/privacy" },
        { label_i18n: { ar: "شروط الخدمة", en: "Terms" }, href: "/policies/terms" },
      ],
    },
  ],
  show_cod_badge: true,
};

/**
 * Server half: strips the newsletter's success line before the footer's
 * client component ever sees it.
 *
 * That line is where merchants put the reward the signup was offered for
 * ("your code is WELCOME15"). `SiteFooterRender` is a client component, so
 * every prop it receives is serialized into the RSC payload of every page
 * the footer appears on — the coupon was readable in the page source
 * without subscribing. The copy now travels back with the successful
 * `/api/newsletter` response instead.
 *
 * The field stays in the schema and in stored config: only the value is
 * withheld from the client. A merchant still edits it in the inspector,
 * but no longer by clicking the rendered line in the preview.
 */
export function withoutNewsletterReward(props: Props): Props {
  if (!props.newsletter?.success_i18n) return props;
  return {
    ...props,
    newsletter: { ...props.newsletter, success_i18n: undefined },
  };
}

function SiteFooterWithoutReward({
  props,
  ctx,
}: {
  props: Props;
  ctx: SectionRenderContext;
}) {
  return <SiteFooterRender props={withoutNewsletterReward(props)} ctx={ctx} />;
}

const definition: SectionDefinition<Props> = {
  type: "site_footer",
  category: "page",
  name: { en: "Site footer", ar: "تذييل المتجر" },
  description: {
    en: "Persistent footer: link columns, COD badge, copyright.",
    ar: "تذييل ثابت: أعمدة روابط، شارة الدفع عند الاستلام، حقوق النشر.",
  },
  thumbnail: "/sections/site_footer.svg",
  // Global section — lives in globals.footer, never placed on a page.
  valid_on: [],
  schema,
  defaultProps,
  render: SiteFooterWithoutReward,
};

registerSection(definition);
export default definition;
