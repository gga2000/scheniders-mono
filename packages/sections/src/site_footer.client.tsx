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

import { useState } from "react";
import { z } from "zod";
import { formatIraqiPhoneDisplay, resolveI18n } from "@scheniders/shared";
import type { LocaleCode } from "@scheniders/shared";
import { cn } from "./helpers/utils";
import { BrandMark, MaterialIcon, TrustPill } from "./helpers/primitives";
import { StoreLink } from "./helpers/store-context";
import { chromeString } from "./helpers/chrome-strings";
import { resolveTenantPhone, whatsappDigits } from "./helpers/whatsapp";
import type { SectionRenderContext } from "./_types";
import type { Props } from "./site_footer";

// ---------------------------------------------------------------------
// info_panel — social icon glyphs. Inline 24-viewBox paths rendered at
// ~20px in `currentColor` so the row inherits the panel's --bk-ink.
// Ordered array keeps a stable render order regardless of config keys.
// ---------------------------------------------------------------------

type SocialKey = "tiktok" | "instagram" | "twitter" | "facebook";

const SOCIAL_PLATFORMS: ReadonlyArray<{
  key: SocialKey;
  label: string;
  path: string;
}> = [
  {
    key: "tiktok",
    label: "TikTok",
    path: "M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z",
  },
  {
    key: "instagram",
    label: "Instagram",
    path: "M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zm0 10.162a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z",
  },
  {
    key: "twitter",
    label: "Twitter",
    path: "M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z",
  },
  {
    key: "facebook",
    label: "Facebook",
    path: "M22 12.06C22 6.505 17.523 2 12 2S2 6.505 2 12.06c0 5.022 3.657 9.184 8.438 9.94v-7.03H7.898v-2.91h2.54V9.845c0-2.522 1.492-3.915 3.777-3.915 1.094 0 2.238.197 2.238.197v2.476h-1.26c-1.243 0-1.63.775-1.63 1.57v1.887h2.773l-.443 2.91h-2.33V22c4.78-.756 8.437-4.918 8.437-9.94z",
  },
];

// ---------------------------------------------------------------------
// info_panel — newsletter email capture. Same request contract as the
// `newsletter_inline` section: client-validated email, POST to
// `/api/newsletter` with { email, locale }, idle/submitting/ok/error
// states. Isolated in its own component so the hooks stay scoped to the
// enabled case (the whole file is already a client component).
// ---------------------------------------------------------------------

/** Client-side email validation for the footer signup field. */
const emailSchema = z.email();
const isValidEmail = (value: string): boolean =>
  emailSchema.safeParse(value.trim()).success;

function InfoPanelNewsletterForm({
  locale,
  copy,
  placeholder,
  buttonLabel,
  tenantId,
}: {
  locale: "ar" | "en" | "ku";
  copy: string | null;
  placeholder: string;
  buttonLabel: string;
  tenantId: string;
}) {
  const [status, setStatus] = useState<"idle" | "submitting" | "ok" | "error">(
    "idle",
  );
  const [email, setEmail] = useState("");
  // The merchant's confirmation line — which often carries the coupon the
  // signup was offered for — arrives with the success response. It is
  // deliberately NOT a prop: a prop would be serialized into the page
  // payload of every page the footer appears on, and anyone reading the
  // source could take the coupon without ever subscribing.
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  // Only surface the invalid state once the visitor has interacted with the
  // field (blurred or attempted submit) — avoids yelling at an empty input.
  const [touched, setTouched] = useState(false);

  const emailValid = isValidEmail(email);
  const showInvalid = touched && !emailValid;
  const submitting = status === "submitting";

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    // Gate the request on client-side validation; never POST a bad address.
    if (!emailValid) {
      setTouched(true);
      return;
    }
    setStatus("submitting");
    try {
      const res = await fetch("/api/newsletter", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tenant_id: tenantId, email: email.trim(), locale }),
      });
      setStatus(res.ok ? "ok" : "error");
      if (res.ok) {
        const body: unknown = await res.json().catch(() => null);
        const message =
          body && typeof body === "object" && "message" in body
            ? (body as { message?: unknown }).message
            : null;
        setSuccessMessage(typeof message === "string" && message ? message : null);
        setEmail("");
        setTouched(false);
      }
    } catch {
      setStatus("error");
    }
  }

  const inputErrored = showInvalid || status === "error";

  return (
    <div className="mt-8">
      {copy && (
        <p
          className="mb-2 font-body text-sm opacity-75"
          data-i18n-field="newsletter.copy_i18n"
        >
          {copy}
        </p>
      )}
      <form
        onSubmit={onSubmit}
        className="flex max-w-md flex-col gap-2 sm:flex-row"
      >
        <label className="sr-only" htmlFor="footer-newsletter-email">
          {placeholder}
        </label>
        <input
          id="footer-newsletter-email"
          type="email"
          required
          autoComplete="email"
          inputMode="email"
          placeholder={placeholder}
          data-i18n-field="newsletter.placeholder_i18n"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            // Clear a prior server error as soon as the visitor edits.
            if (status === "error") setStatus("idle");
          }}
          onBlur={() => setTouched(true)}
          aria-invalid={inputErrored || undefined}
          className="min-w-0 flex-1 rounded-full px-5 py-2.5 font-body text-sm focus-visible:outline-none focus-visible:ring-2 ring-bk-focus focus-visible:ring-offset-2"
          style={{
            backgroundColor: "var(--bk-surface, #ffffff)",
            border: `1px solid ${
              inputErrored
                ? "var(--bk-danger, #e5484d)"
                : "color-mix(in srgb, var(--bk-ink, #1a1a1a) 25%, transparent)"
            }`,
            color: "var(--bk-ink, #1a1a1a)",
            fontFamily: "var(--bk-font-body, inherit)",
          }}
          disabled={submitting}
        />
        <button
          type="submit"
          disabled={submitting}
          aria-busy={submitting || undefined}
          className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-full px-6 py-2.5 font-label text-sm font-bold transition-opacity duration-150 motion-reduce:transition-none hover:opacity-90 active:opacity-80 disabled:cursor-not-allowed disabled:opacity-70"
          style={{
            backgroundColor: "var(--bk-primary, #ff5a8a)",
            color: "var(--bk-on-primary, #fff)",
          }}
        >
          {submitting ? (
            <MaterialIcon
              name="progress_activity"
              className="animate-spin motion-reduce:animate-none"
            />
          ) : status === "ok" ? (
            <>
              <MaterialIcon name="check" />
              <span data-i18n-field="newsletter.button_i18n">{buttonLabel}</span>
            </>
          ) : (
            <span data-i18n-field="newsletter.button_i18n">{buttonLabel}</span>
          )}
        </button>
      </form>
      {/* Always-mounted live region so screen readers announce the outcome
          when it appears (a region inserted together with its text is not
          reliably announced). */}
      <div role="status" aria-live="polite">
        {status === "ok" && (
          <p
            className="mt-2 font-label text-sm font-bold"
            data-i18n-field="newsletter.success_i18n"
          >
            {successMessage ?? chromeString("newsletter_success", locale)}
          </p>
        )}
        {status === "error" && (
          <p
            className="mt-2 font-label text-sm font-bold"
            style={{ color: "var(--bk-danger, #e5484d)" }}
          >
            {chromeString("newsletter_error", locale)}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * The address lines a footer prints, the locale on screen first.
 *
 * The legal address is often bilingual, and Iraqi business footers do print
 * both — so every provided translation gets its own line, deduped. What the
 * order fixes: the label ("العنوان:") attaches to the first line only, and a
 * hardcoded en-ar order put it on the English address while the Arabic one
 * trailed unlabelled on an Arabic page. Seen live on scheniders-iraq.
 */
export function addressLinesFor(
  address: { en?: string; ar?: string; ku?: string } | null | undefined,
  locale: LocaleCode,
): string[] {
  if (!address) return [];
  const active = address[locale as keyof typeof address];
  const ordered = [active, address.ar, address.en, address.ku];
  return [
    ...new Set(
      ordered.filter((line): line is string => Boolean(line && line.trim())),
    ),
  ];
}

export function SiteFooterRender({
  props,
  ctx,
}: {
  props: Props;
  ctx: SectionRenderContext;
}) {
  const locale = ctx.runtime.locale;
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
              >
                {name}
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
                      className="inline-flex h-11 w-11 items-center justify-center rounded-full transition-opacity duration-150 motion-reduce:transition-none hover:opacity-70 active:opacity-60"
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
              <ul className="space-y-0.5">
                {links.map((l, i) => (
                  <li key={`${l.href}-${i}`}>
                    <StoreLink
                      href={l.href}
                      className="inline-flex min-h-11 items-center font-body text-sm opacity-75 transition-opacity duration-150 motion-reduce:transition-none underline-offset-4 hover:opacity-100 hover:underline active:opacity-60"
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
              name={name}
              size="sm"
              className="[--bm-ink:var(--bk-surface,#ffffff)] [--bm-mark-border:var(--bk-surface,#ffffff)]"
            />
            {tagline && (
              <p className="font-body text-sm text-white/70 max-w-xs">{tagline}</p>
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
                      className="inline-flex min-h-11 items-center font-body text-sm text-white/75 transition-colors duration-150 motion-reduce:transition-none hover:text-white hover:underline underline-offset-4 active:opacity-60"
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
          <p className="font-label font-bold text-[11px] bk-caps tracking-[0.2em] text-white/60">
            {chromeString("made_in_iraq", locale)}
          </p>
        </div>
      </div>
    </footer>
  );
}
