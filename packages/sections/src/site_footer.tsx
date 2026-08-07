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

const contactSchema = z.object({
  phone: z.string().optional(),
  address_i18n: i18nStringOptional,
});

const legalSchema = z.object({
  company_name: z.string().optional(),
  business_license: z.string().optional(),
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

  // -------------------------------------------------------------------
  // info_panel — large light rounded panel on --bk-surface-alt with a
  // 3-column grid (brand+tagline / link list / contact+legal) and a
  // bottom rights line. The classic dark bento footer below stays
  // byte-identical for existing stores.
  // -------------------------------------------------------------------
  if ((props.layout ?? "bento") === "info_panel") {
    const links = props.columns.flatMap((col) => col.links);
    const linksHeading = props.links_heading_i18n
      ? resolveI18n(props.links_heading_i18n, locale)
      : props.columns[0]
        ? resolveI18n(props.columns[0].heading_i18n, locale)
        : "";
    const rights = props.rights_i18n
      ? resolveI18n(props.rights_i18n, locale)
      : `© ${year} ${name}`;
    const address = props.contact?.address_i18n;
    // The legal address is often bilingual — show every provided
    // translation as its own line (deduped), matching Iraqi business
    // footers that print the address in both Arabic and English.
    const addressLines = address
      ? [
          ...new Set(
            [address.en, address.ar, address.ku].filter(
              (line): line is string => Boolean(line && line.trim()),
            ),
          ),
        ]
      : [];

    return (
      <footer className="px-3 pb-6 pt-2 sm:px-6">
        <div
          className="mx-auto max-w-6xl rounded-[24px] px-6 py-10 sm:px-10"
          style={{
            backgroundColor: "var(--bk-surface-alt, #f4ede1)",
            color: "var(--bk-ink, #1a1a1a)",
          }}
        >
          <div className="grid gap-10 md:grid-cols-3">
            {/* Brand: wordmark + tagline */}
            <div className="space-y-3">
              <p
                className="font-display text-2xl font-black tracking-tight"
                style={{ fontFamily: "var(--bk-font-display, inherit)" }}
              >
                {name}
              </p>
              {tagline && (
                <p className="max-w-xs font-body text-sm opacity-70">
                  {tagline}
                </p>
              )}
            </div>

            {/* Link list — flattened from the existing columns prop */}
            <div className="space-y-3">
              {linksHeading && (
                <h3 className="font-label text-base font-bold">
                  {linksHeading}
                </h3>
              )}
              <ul className="space-y-0.5">
                {links.map((l, i) => (
                  <li key={`${l.href}-${i}`}>
                    <StoreLink
                      href={l.href}
                      className="inline-flex min-h-9 items-center font-body text-sm opacity-75 transition-opacity underline-offset-4 hover:opacity-100 hover:underline"
                    >
                      {resolveI18n(l.label_i18n, locale)}
                    </StoreLink>
                  </li>
                ))}
              </ul>
            </div>

            {/* Contact + legal — small muted lines */}
            {(props.contact?.phone ||
              addressLines.length > 0 ||
              props.legal?.company_name ||
              props.legal?.business_license) && (
              <div className="space-y-2 font-body text-sm opacity-70">
                {props.contact?.phone && (
                  <p>
                    <span className="font-bold">
                      {t ? "رقم الهاتف:" : "Phone:"}
                    </span>{" "}
                    <a
                      href={`tel:${props.contact.phone}`}
                      className="underline-offset-4 hover:underline"
                    >
                      {props.contact.phone}
                    </a>
                  </p>
                )}
                {addressLines.map((line, i) => (
                  <p key={line}>
                    {i === 0 && (
                      <>
                        <span className="font-bold">
                          {t ? "العنوان:" : "Address:"}
                        </span>{" "}
                      </>
                    )}
                    {line}
                  </p>
                ))}
                {props.legal?.company_name && (
                  <p>
                    <span className="font-bold">
                      {t ? "الاسم القانوني للشركة:" : "Company legal name:"}
                    </span>{" "}
                    {props.legal.company_name}
                  </p>
                )}
                {props.legal?.business_license && (
                  <p>
                    <span className="font-bold">
                      {t ? "رقم الإجازة التجارية:" : "Business license:"}
                    </span>{" "}
                    {props.legal.business_license}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Bottom rights line */}
          <div
            className="mt-8 border-t pt-5 text-center"
            style={{
              borderColor:
                "color-mix(in srgb, var(--bk-ink, #1a1a1a) 12%, transparent)",
            }}
          >
            <p className="font-body text-xs opacity-60">{rights}</p>
          </div>
        </div>
      </footer>
    );
  }

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
