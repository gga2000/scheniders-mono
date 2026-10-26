// =====================================================================
// Section — site_footer  (global)
// =====================================================================
// Persistent storefront footer: wordmark + tagline, link columns
// (shop / help / policies), a COD reassurance badge, and copyright.
// Lives in globals.footer. Rendered by default on every V2 page when a
// tenant has not configured one (see StorefrontGlobals). Dark "anchor"
// surface in the candy/bento language.
// =====================================================================
// Client half of `site_footer` — the component (hooks / browser APIs). The
// schema, defaults and registry entry live in `./site_footer.tsx` so the
// definition is server-safe; only this module ships to the browser.
// =====================================================================

"use client";

import { formatIraqiPhoneDisplay, resolveI18n } from "@scheniders/shared";
import { cn } from "./helpers/utils";
import { BrandMark, MaterialIcon, TrustPill } from "./helpers/primitives";
import { StoreLink } from "./helpers/store-context";
import { chromeString } from "./helpers/chrome-strings";
import { resolveTenantPhone, whatsappDigits } from "./helpers/whatsapp";
import type { SectionRenderContext } from "./_types";
import type { Props } from "./site_footer";
import {
  InfoPanelNewsletterForm,
  SOCIAL_PLATFORMS,
  addressLinesFor,
} from "./site_footer.parts";
import { BoutiqueFooter } from "./site_footer.boutique";

export { addressLinesFor } from "./site_footer.parts";

export function SiteFooterRender({
  props,
  ctx,
}: {
  props: Props;
  ctx: SectionRenderContext;
}) {
  const locale = ctx.runtime.locale;
  const name = ctx.tenant.business_name;
  // Opt-in shop name for the lockup. The copyright keeps `name`: that line
  // is a legal statement, not branding.
  const wordmark = props.wordmark_i18n
    ? resolveI18n(props.wordmark_i18n, locale)
    : "";
  const logo = ctx.tenant.branding?.logo_url ?? null;
  const tagline = props.tagline_i18n
    ? resolveI18n(props.tagline_i18n, locale)
    : null;
  const year = new Date().getFullYear();

  if (props.layout === "boutique") {
    return <BoutiqueFooter props={props} ctx={ctx} />;
  }

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
    const addressLines = addressLinesFor(props.contact?.address_i18n, locale);
    // Social icons: only platforms with a non-empty URL render.
    const socials = SOCIAL_PLATFORMS.filter(({ key }) =>
      Boolean(props.social_links?.[key]?.trim()),
    );
    const newsletter = props.newsletter;

    return (
      <footer className="px-3 pb-6 pt-2 sm:px-6">
        <div
          className="mx-auto max-w-6xl px-6 py-10 sm:px-10"
          style={{
            borderRadius: "var(--bk-radius-card, 24px)",
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
                {...(wordmark ? { "data-i18n-field": "wordmark_i18n" } : {})}
              >
                {wordmark || name}
              </p>
              {tagline && (
                <p className="max-w-xs font-body text-sm opacity-70">
                  {tagline}
                </p>
              )}
              {socials.length > 0 && (
                <div className="flex items-center gap-2 pt-1">
                  {socials.map(({ key, label, path }) => (
                    <a
                      key={key}
                      // Filtered above on a non-empty value, so the URL is
                      // always defined here.
                      href={props.social_links?.[key] ?? "#"}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={label}
                      className="inline-flex h-11 w-11 items-center justify-center rounded-full transition-opacity duration-bk-fast motion-reduce:transition-none hover:opacity-70 active:opacity-60"
                      style={{
                        backgroundColor:
                          "color-mix(in srgb, var(--bk-ink, #1a1a1a) 8%, transparent)",
                        color: "var(--bk-ink, #1a1a1a)",
                      }}
                    >
                      <svg
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                        aria-hidden="true"
                      >
                        <path d={path} />
                      </svg>
                    </a>
                  ))}
                </div>
              )}
            </div>

            {/* Link list — flattened from the existing columns prop */}
            <div className="space-y-3">
              {linksHeading && (
                <h3 className="font-label text-base font-bold">
                  {linksHeading}
                </h3>
              )}
              {/* Two columns below `sm`. Each row is a 44px tap target and
                  has to stay one — so the height comes off the number of
                  rows, not their size. Eight policy links stacked full width
                  cost 368px of a 390px screen; paired, they cost half that
                  and the targets are untouched. One column from `sm` up,
                  where the footer already sits in a three-column grid. */}
              <ul className="grid grid-cols-2 gap-x-4 sm:block sm:space-y-0.5">
                {links.map((l, i) => (
                  <li key={`${l.href}-${i}`}>
                    <StoreLink
                      href={l.href}
                      className="inline-flex min-h-11 items-center font-body text-sm opacity-75 transition-opacity duration-bk-fast motion-reduce:transition-none underline-offset-4 hover:opacity-100 hover:underline active:opacity-60"
                    >
                      {resolveI18n(l.label_i18n, locale)}
                    </StoreLink>
                  </li>
                ))}
              </ul>
            </div>

            {/* Contact + legal — small muted lines. The phone resolves
                through the canonical tenant contact helper so a merchant
                updating their number in store settings is never shadowed
                by a stale per-section override. */}
            {(() => {
              const phone = resolveTenantPhone(ctx.tenant, props.contact?.phone);
              // P2-19: show the number the way Iraqis read it (0777 970
              // 3832) and dial the E.164 form; never the raw stored string.
              const phoneDisplay = phone ? formatIraqiPhoneDisplay(phone) : null;
              const phoneHref = phone ? `tel:+${whatsappDigits(phone)}` : null;
              return (
                (phone ||
                  addressLines.length > 0 ||
                  props.legal?.company_name ||
                  props.legal?.business_license) && (
              <div className="space-y-2 font-body text-sm opacity-70">
                {phoneDisplay && phoneHref && (
                  <p>
                    <span className="font-bold">
                      {chromeString("phone_label", locale)}
                    </span>{" "}
                    <a
                      href={phoneHref}
                      className="inline-flex min-h-11 items-center px-1 -mx-1 underline-offset-4 hover:underline active:opacity-60 tabular-nums"
                    >
                      {phoneDisplay}
                    </a>
                  </p>
                )}
                {addressLines.map((line, i) => (
                  <p key={line}>
                    {i === 0 && (
                      <>
                        <span className="font-bold">
                          {chromeString("address_label", locale)}
                        </span>{" "}
                      </>
                    )}
                    {line}
                  </p>
                ))}
                {props.legal?.company_name && (
                  <p>
                    <span className="font-bold">
                      {chromeString("company_legal_name_label", locale)}
                    </span>{" "}
                    {props.legal.company_name}
                  </p>
                )}
                {props.legal?.business_license && (
                  <p>
                    <span className="font-bold">
                      {chromeString("business_license_label", locale)}
                    </span>{" "}
                    {props.legal.business_license}
                  </p>
                )}
              </div>
                )
              );
            })()}
          </div>

          {/* Newsletter email capture — above the rights line */}
          {newsletter?.enabled && (
            <InfoPanelNewsletterForm
              locale={locale}
              copy={
                newsletter.copy_i18n
                  ? resolveI18n(newsletter.copy_i18n, locale)
                  : null
              }
              placeholder={
                newsletter.placeholder_i18n
                  ? resolveI18n(newsletter.placeholder_i18n, locale)
                  : chromeString("newsletter_placeholder", locale)
              }
              buttonLabel={
                newsletter.button_i18n
                  ? resolveI18n(newsletter.button_i18n, locale)
                  : chromeString("newsletter_button", locale)
              }
              tenantId={ctx.tenant.id}
            />
          )}

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
        color: "var(--bk-surface, #ffffff)",
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
              name={wordmark || name}
              size="sm"
              className="[--bm-ink:var(--bk-surface,#ffffff)] [--bm-mark-border:var(--bk-surface,#ffffff)]"
            />
            {tagline && (
              <p className="font-body text-sm text-bk-surface/70 max-w-xs">{tagline}</p>
            )}
            {props.show_cod_badge && (
              <TrustPill icon={<MaterialIcon name="payments" className="text-lg" />} bg="mint">
                {chromeString("cash_on_delivery", locale)}
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
                className="font-label font-bold text-xs bk-caps tracking-[0.2em]"
                style={{ color: "var(--bk-accent, #ffd84a)" }}
              >
                {resolveI18n(col.heading_i18n, locale)}
              </h3>
              <ul className="space-y-0.5">
                {col.links.map((l) => (
                  <li key={`${l.href}-ci${ci}`}>
                    <StoreLink
                      href={l.href}
                      className="inline-flex min-h-11 items-center font-body text-sm text-bk-surface/75 transition-colors duration-bk-fast motion-reduce:transition-none hover:text-bk-surface hover:underline underline-offset-4 active:opacity-60"
                    >
                      {resolveI18n(l.label_i18n, locale)}
                    </StoreLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-10 flex flex-col gap-2 border-t border-bk-surface/15 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="font-body text-xs text-bk-surface/60">
            © {year} {name}
          </p>
          <p className="font-label font-bold text-[11px] bk-caps tracking-[0.2em] text-bk-surface/60">
            {chromeString("made_in_iraq", locale)}
          </p>
        </div>
      </div>
    </footer>
  );
}
