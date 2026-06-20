// =====================================================================
// Section — site_footer  (global)
// =====================================================================
// Persistent storefront footer: wordmark + tagline, link columns
// (shop / help / policies), a COD reassurance badge, and copyright.
// Lives in globals.footer. Rendered by default on every V2 page when a
// tenant has not configured one (see StorefrontGlobals). Dark "anchor"
// surface in the candy/bento language.
// =====================================================================

"use client";

import { z } from "zod";
import { resolveI18n } from "@scheniders/shared";
import { cn } from "./helpers/utils";
import { BrandMark, MaterialIcon, TrustPill } from "./helpers/primitives";
import { StoreLink } from "./helpers/store-context";
import { i18nStringSchema, i18nStringOptional } from "./_schema";
import { registerSection } from "./_registry";
import type { SectionDefinition, SectionRenderContext } from "./_types";

const navLinkSchema = z.object({
  label_i18n: i18nStringSchema,
  href: z.string(),
});

const columnSchema = z.object({
  heading_i18n: i18nStringSchema,
  links: z.array(navLinkSchema),
});

const schema = z.object({
  tagline_i18n: i18nStringOptional,
  columns: z.array(columnSchema),
  show_cod_badge: z.boolean(),
});

type Props = z.infer<typeof schema>;

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

function SiteFooterRender({
  props,
  ctx,
}: {
  props: Props;
  ctx: SectionRenderContext;
}) {
  const locale = ctx.runtime.locale;
  const t = locale !== "en";
  const name = ctx.tenant.business_name;
  const logo = ctx.tenant.branding?.logo_url ?? null;
  const tagline = props.tagline_i18n
    ? resolveI18n(props.tagline_i18n, locale)
    : null;
  const year = new Date().getFullYear();

  return (
    <footer
      style={{
        backgroundColor: "var(--bk-ink, #1a1a1a)",
        color: "#ffffff",
        borderTop: "var(--bk-border-thickness, 3px) solid var(--bk-ink, #1a1a1a)",
      }}
    >
      <div className="mx-auto max-w-6xl px-4 py-12">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          {/* Brand block */}
          <div className="space-y-4 lg:col-span-1 sm:col-span-2">
            {/* On the dark ink surface, force the wordmark + square border to
                white via the BrandMark `--bm-*` override vars so the lockup
                stays legible (preserves the footer's original white-on-ink
                styling) without changing BrandMark's API. */}
            <BrandMark
              logoUrl={logo}
              name={name}
              size="sm"
              className="[--bm-ink:#ffffff] [--bm-mark-border:#ffffff]"
            />
            {tagline && (
              <p className="font-body text-sm text-white/70 max-w-xs">{tagline}</p>
            )}
            {props.show_cod_badge && (
              <TrustPill icon={<MaterialIcon name="payments" className="text-lg" />} bg="mint">
                {t ? "الدفع عند الاستلام" : "Cash on delivery"}
              </TrustPill>
            )}
          </div>

          {/* Link columns. The last column (Policies by default) is the
              least-critical, so on small screens it drops to the end of the
              flow; `lg:order-none` restores the natural grid order on the
              4-col desktop layout so nothing shifts there. */}
          {props.columns.map((col, ci) => (
            <div
              key={`col-${ci}`}
              className={cn(
                "space-y-3",
                ci === props.columns.length - 1 && "order-last lg:order-none",
              )}
            >
              <h3
                className="font-label font-bold text-xs uppercase tracking-[0.2em]"
                style={{ color: "var(--bk-accent, #ffd84a)" }}
              >
                {resolveI18n(col.heading_i18n, locale)}
              </h3>
              <ul className="space-y-0.5">
                {col.links.map((l) => (
                  <li key={`${l.href}-ci${ci}`}>
                    <StoreLink
                      href={l.href}
                      className="inline-flex min-h-[44px] items-center font-body text-sm text-white/75 transition-colors hover:text-white hover:underline underline-offset-4"
                    >
                      {resolveI18n(l.label_i18n, locale)}
                    </StoreLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-10 flex flex-col gap-2 border-t border-white/15 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="font-body text-xs text-white/60">
            © {year} {name}
          </p>
          <p className="font-label font-bold text-[11px] uppercase tracking-[0.2em] text-white/60">
            {t ? "صُنع بحب في العراق 🇮🇶" : "Made with love in Iraq 🇮🇶"}
          </p>
        </div>
      </div>
    </footer>
  );
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
  render: SiteFooterRender,
};

registerSection(definition);
export default definition;
