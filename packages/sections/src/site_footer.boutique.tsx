"use client";

// =====================================================================
// site_footer — "boutique" layout (opt-in)
// =====================================================================
// A dark closing panel that ends the page the way a boutique's last
// shelf does: the house name, the two ways to reach a person (WhatsApp,
// a call) as real buttons, the pages people look for as clean rows, the
// contact facts with a map link, the social accounts, and the legal fine
// print last. Reads the same props as info_panel; every line renders only
// when the merchant has the data.
// =====================================================================

import Image from "next/image";
import {
  cn,
  formatIraqiPhoneDisplay,
  resolveI18n,
} from "@scheniders/shared";
import type { LocaleCode } from "@scheniders/shared";
import { MaterialIcon, WhatsAppIcon } from "./helpers/primitives";
import { StoreLink } from "./helpers/store-context";
import { isOptimizableImageHost } from "./helpers/image";
import {
  resolveTenantPhone,
  resolveTenantWhatsapp,
  whatsappDigits,
} from "./helpers/whatsapp";
import type { SectionRenderContext } from "./_types";
import type { Props } from "./site_footer";
import {
  InfoPanelNewsletterForm,
  SOCIAL_PLATFORMS,
  addressLinesFor,
} from "./site_footer.parts";
import { chromeString } from "./helpers/chrome-strings";

/** Chrome strings for the boutique footer (every entry carries ku). */
const STRINGS = {
  reachUs: { en: "Talk to us", ar: "تحب تحچي ويانا؟", ku: "دەتەوێت قسە لەگەڵمان بکەیت؟" },
  whatsapp: { en: "WhatsApp", ar: "واتساب", ku: "واتسئاپ" },
  call: { en: "Call us", ar: "اتصل بينا", ku: "پەیوەندیمان پێوە بکە" },
  address: { en: "Address", ar: "العنوان", ku: "ناونیشان" },
  map: { en: "Open in maps", ar: "افتح بالخريطة", ku: "لە نەخشەدا بیکەرەوە" },
  follow: { en: "Follow us", ar: "تابعنا", ku: "فۆڵۆمان بکە" },
  cod: { en: "Cash on delivery", ar: "الدفع كاش عند الاستلام", ku: "پارەدان لە کاتی گەیاندن" },
  legalName: { en: "Legal name", ar: "الاسم القانوني", ku: "ناوی یاسایی" },
  license: { en: "Trade licence", ar: "رقم الإجازة التجارية", ku: "ژمارەی مۆڵەتی بازرگانی" },
} as const;

type StringKey = keyof typeof STRINGS;
const t = (k: StringKey, locale: LocaleCode) => resolveI18n(STRINGS[k], locale);

/** A maps search for the address the merchant typed — no coordinates are
 *  invented; the map app resolves the text. */
function mapsHref(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

export function BoutiqueFooter({
  props,
  ctx,
}: {
  props: Props;
  ctx: SectionRenderContext;
}) {
  const locale = ctx.runtime.locale;
  const rtl = locale !== "en";
  const text = rtl ? "text-right" : "text-left";
  const row = rtl ? "flex-row-reverse" : "";

  const wordmark = props.wordmark_i18n
    ? resolveI18n(props.wordmark_i18n, locale)
    : ctx.tenant.business_name;
  // `||`: an empty override falls back to the uploaded logo (as the header).
  const logo = props.logo_image_url || ctx.tenant.branding?.logo_url || null;
  const tagline = props.tagline_i18n ? resolveI18n(props.tagline_i18n, locale) : "";
  const links = props.columns.flatMap((col) => col.links);
  const linksHeading = props.links_heading_i18n
    ? resolveI18n(props.links_heading_i18n, locale)
    : props.columns[0]
      ? resolveI18n(props.columns[0].heading_i18n, locale)
      : "";
  const address = addressLinesFor(props.contact?.address_i18n, locale)[0] ?? null;
  const phone = resolveTenantPhone(ctx.tenant, props.contact?.phone);
  const wa = resolveTenantWhatsapp(ctx.tenant);
  const socials = SOCIAL_PLATFORMS.filter(({ key }) =>
    Boolean(props.social_links?.[key]?.trim()),
  );
  const year = new Date().getFullYear();
  const rights = props.rights_i18n
    ? resolveI18n(props.rights_i18n, locale)
    : `© ${year} ${ctx.tenant.business_name}`;
  const newsletter = props.newsletter;

  const actionCls =
    "flex min-h-12 items-center justify-center gap-2 rounded-bk-pill px-4 font-bk-body text-sm font-bold transition-transform duration-bk-fast active:scale-[0.98] motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bk-focus";

  return (
    <footer
      data-footer-layout="boutique"
      className="mt-bk-lg overflow-hidden rounded-t-bk-card bg-bk-secondary text-bk-on-secondary"
    >
      {/* The extra bottom space keeps the fine print clear of any fixed
          bottom bar (sticky CTA) and the home indicator. */}
      <div className="mx-auto max-w-6xl px-5 pb-[calc(7rem+env(safe-area-inset-bottom,0px))] pt-10 sm:pb-12">
        {/* House */}
        <div className={cn("flex flex-col gap-3", rtl ? "items-end" : "items-start", text)}>
          <div className={cn("flex items-center gap-3", row)}>
            {logo && (
              <Image
                src={logo}
                alt=""
                width={44}
                height={44}
                sizes="44px"
                unoptimized={!isOptimizableImageHost(logo)}
                className="h-11 w-11 rounded-bk-pill bg-bk-surface object-cover"
              />
            )}
            <p translate="no" className="font-bk-display text-[34px] font-black leading-none">
              {wordmark}
            </p>
          </div>
          {tagline && (
            <p className="max-w-sm font-bk-body text-sm leading-relaxed text-bk-on-secondary/70">
              {tagline}
            </p>
          )}
          {props.show_cod_badge && (
            <span className={cn("inline-flex h-8 items-center gap-1.5 rounded-bk-pill border-bk border-bk-on-secondary/20 px-3 font-bk-body text-xs font-bold", row)}>
              <MaterialIcon name="payments" className="text-base text-bk-primary" />
              {t("cod", locale)}
            </span>
          )}
        </div>

        {/* Reach a person */}
        {(wa || phone) && (
          <div className="mt-8">
            <p className={cn("mb-3 font-bk-display text-base font-black", text)}>
              {t("reachUs", locale)}
            </p>
            <div className={cn("grid gap-2", wa && phone ? "grid-cols-2" : "grid-cols-1")}>
              {wa && (
                <a
                  href={`https://wa.me/${whatsappDigits(wa)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(actionCls, "bg-bk-surface text-bk-ink", row)}
                >
                  <WhatsAppIcon className="h-5 w-5 text-bk-success" />
                  {t("whatsapp", locale)}
                </a>
              )}
              {phone && (
                <a
                  href={`tel:+${whatsappDigits(phone)}`}
                  className={cn(actionCls, "border-bk border-bk-on-secondary/30", row)}
                >
                  <MaterialIcon name="call" className="text-lg" />
                  <span className={cn("flex flex-col leading-tight", rtl ? "items-end" : "items-start")}>
                    {t("call", locale)}
                    <bdi className="text-[11px] font-medium tabular-nums opacity-70">
                      {formatIraqiPhoneDisplay(phone)}
                    </bdi>
                  </span>
                </a>
              )}
            </div>
          </div>
        )}

        {/* Pages */}
        {links.length > 0 && (
          <nav aria-label={linksHeading || undefined} className="mt-9">
            {linksHeading && (
              <p className={cn("mb-1 font-bk-display text-base font-black", text)}>
                {linksHeading}
              </p>
            )}
            {/* Two rows per line: seven links cost half the height and every
                row stays a 48px target. flex-wrap (not grid) so the first
                link sits on the reading side in Arabic. */}
            <ul className={cn("flex flex-wrap gap-x-5", rtl && "flex-row-reverse")}>
              {links.map((l) => (
                <li
                  key={`${l.href}-${resolveI18n(l.label_i18n, "en")}`}
                  className="w-[calc(50%-0.625rem)] border-b border-bk-on-secondary/10"
                >
                  <StoreLink
                    href={l.href}
                    className={cn(
                      "flex min-h-12 items-center justify-between gap-2 font-bk-body text-sm text-bk-on-secondary/90 transition-opacity duration-bk-fast hover:opacity-100 active:opacity-70 motion-reduce:transition-none",
                      row,
                    )}
                  >
                    <span>{resolveI18n(l.label_i18n, locale)}</span>
                    <MaterialIcon
                      name={rtl ? "chevron_left" : "chevron_right"}
                      className="text-lg text-bk-on-secondary/40"
                    />
                  </StoreLink>
                </li>
              ))}
            </ul>
          </nav>
        )}

        {/* Where we are — one address, in the reader's language (the
            number is on the call button above). */}
        {address && (
          <dl className={cn("mt-9 flex items-start gap-3", row)}>
            <MaterialIcon name="location_on" className="mt-0.5 text-xl text-bk-primary" />
            <div className={cn("min-w-0 flex-1", text)}>
              <dt className="font-bk-body text-xs font-bold text-bk-on-secondary/60">
                {t("address", locale)}
              </dt>
              <dd className="font-bk-body text-sm leading-relaxed">{address}</dd>
              <dd>
                <a
                  href={mapsHref(address)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn("mt-1 inline-flex min-h-11 items-center gap-1 font-bk-body text-xs font-bold text-bk-primary", row)}
                >
                  {t("map", locale)}
                  <MaterialIcon name="open_in_new" className="text-sm" />
                </a>
              </dd>
            </div>
          </dl>
        )}

        {/* Social */}
        {socials.length > 0 && (
          <div className="mt-9">
            <p className={cn("mb-3 font-bk-display text-base font-black", text)}>
              {t("follow", locale)}
            </p>
            <div className={cn("flex flex-wrap gap-2", rtl && "flex-row-reverse")}>
              {socials.map(({ key, label, path }) => (
                <a
                  key={key}
                  href={props.social_links?.[key] ?? undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={label}
                  className={cn("inline-flex h-11 items-center gap-2 rounded-bk-pill border-bk border-bk-on-secondary/25 px-4 font-bk-body text-sm font-bold", row)}
                >
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
                    <path d={path} />
                  </svg>
                  {label}
                </a>
              ))}
            </div>
          </div>
        )}

        {newsletter?.enabled && (
          <InfoPanelNewsletterForm
            locale={locale}
            copy={newsletter.copy_i18n ? resolveI18n(newsletter.copy_i18n, locale) : null}
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

        {/* Fine print */}
        <div className={cn("mt-10 space-y-1 border-t border-bk-on-secondary/10 pt-5 font-bk-body text-xs text-bk-on-secondary/55", text)}>
          {props.legal?.company_name && (
            <p>
              <bdi>
                {t("legalName", locale)}: <bdi>{props.legal.company_name}</bdi>
              </bdi>
            </p>
          )}
          {props.legal?.business_license && (
            <p>
              <bdi>
                {t("license", locale)}: <bdi className="tabular-nums">{props.legal.business_license}</bdi>
              </bdi>
            </p>
          )}
          <p>{rights}</p>
        </div>
      </div>
    </footer>
  );
}
