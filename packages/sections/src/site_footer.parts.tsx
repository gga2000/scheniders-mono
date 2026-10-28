"use client";

// Pieces shared by the site_footer layouts (info_panel, boutique): the social
// glyphs, the newsletter capture and the bilingual address ordering. Kept in
// their own module so each layout can import them without a client-module
// cycle through site_footer.client.

import { useState } from "react";
import { z } from "zod";
import type { LocaleCode } from "@scheniders/shared";
import { MaterialIcon } from "./helpers/primitives";
import { chromeString } from "./helpers/chrome-strings";

// ---------------------------------------------------------------------
// info_panel — social icon glyphs. Inline 24-viewBox paths rendered at
// ~20px in `currentColor` so the row inherits the panel's --bk-ink.
// Ordered array keeps a stable render order regardless of config keys.
// ---------------------------------------------------------------------

export type SocialKey = "tiktok" | "instagram" | "twitter" | "facebook";

export const SOCIAL_PLATFORMS: ReadonlyArray<{
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

export function InfoPanelNewsletterForm({
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
          className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-full px-6 py-2.5 font-label text-sm font-bold transition-opacity duration-bk-fast motion-reduce:transition-none hover:opacity-90 active:opacity-80 disabled:cursor-not-allowed disabled:opacity-70"
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

