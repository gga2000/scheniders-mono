// =====================================================================
// Section — newsletter_inline
// =====================================================================
// Inline newsletter signup (not a modal). Posts to `/api/newsletter`
// with the tenant id, visitor's locale + email. The endpoint is owned
// by the storefront app; this section only renders the form.
// =====================================================================
// Client half of `newsletter_inline` — the component (hooks / browser APIs). The
// schema, defaults and registry entry live in `./newsletter_inline.tsx` so the
// definition is server-safe; only this module ships to the browser.
// =====================================================================

"use client";

import { useState } from "react";
import { z } from "zod";
import { resolveI18n } from "@scheniders/shared";
import {
  BentoCard,
  ChunkyButton,
  MaterialIcon,
  ScribbleHeading,
  Section,
  Sticker,
} from "./helpers/primitives";
import type { SectionRenderContext } from "./_types";
import type { Props } from "./newsletter_inline";

/** Client-side email validation for the inline signup field. */
const emailSchema = z.email();
const isValidEmail = (value: string): boolean =>
  emailSchema.safeParse(value.trim()).success;

export function NewsletterInlineRender({
  props,
  ctx,
}: {
  props: Props;
  ctx: SectionRenderContext;
}) {
  const locale = ctx.runtime.locale;
  const heading = resolveI18n(props.heading_i18n, locale);
  const body = resolveI18n(props.body_i18n, locale);
  const placeholder = resolveI18n(props.placeholder_i18n, locale);
  const ctaLabel = resolveI18n(props.cta_label_i18n, locale);

  const [status, setStatus] = useState<"idle" | "submitting" | "ok" | "error">(
    "idle",
  );
  const [email, setEmail] = useState("");
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
        body: JSON.stringify({
          tenant_id: ctx.tenant.id,
          email: email.trim(),
          locale,
        }),
      });
      setStatus(res.ok ? "ok" : "error");
      if (res.ok) {
        setEmail("");
        setTouched(false);
      }
    } catch {
      setStatus("error");
    }
  }

  // The input border turns danger-red when the email is invalid (after touch)
  // or the last submit errored; otherwise it stays the brand ink border.
  const inputErrored = showInvalid || status === "error";

  return (
    <Section>
      <BentoCard bg={props.bg ?? "butter"} size="md" className="p-bk-lg sm:p-bk-xl relative">
        <div className="absolute -top-3 -right-3">
          <Sticker bg="pink" rotate={6} size="sm">
            {locale !== "en" ? "✱ النشرة" : "✱ news"}
          </Sticker>
        </div>
        <div className="max-w-xl">
          <ScribbleHeading color="lilac" className="mb-bk-2xs">
            {heading}
          </ScribbleHeading>
          {body && (
            <p className="font-body text-sm sm:text-base text-bk-ink-soft mb-bk-sm">
              {body}
            </p>
          )}
          <form onSubmit={onSubmit} className="flex flex-col sm:flex-row gap-bk-xs">
            <label className="sr-only" htmlFor="newsletter-email-input">
              {placeholder}
            </label>
            <input
              id="newsletter-email-input"
              type="email"
              required
              autoComplete="email"
              inputMode="email"
              placeholder={placeholder}
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                // Clear a prior server error as soon as the visitor edits.
                if (status === "error") setStatus("idle");
              }}
              onBlur={() => setTouched(true)}
              aria-invalid={inputErrored || undefined}
              className="flex-1 bg-bk-surface-alt px-4 py-3 font-body text-base placeholder:text-bk-ink-faint focus:outline-none focus:ring-0"
              style={{
                border: `var(--bk-border-thickness, 3px) solid ${
                  inputErrored
                    ? "var(--bk-danger, #e5484d)"
                    : "var(--bk-ink, #1a1a1a)"
                }`,
                borderRadius: "var(--bk-radius-input, 0.75rem)",
                color: "var(--bk-ink, #1a1a1a)",
                fontFamily: "var(--bk-font-body, inherit)",
              }}
              disabled={submitting}
            />
            <ChunkyButton
              type="submit"
              bg="pink"
              size="md"
              disabled={submitting}
              aria-busy={submitting || undefined}
              style={
                submitting
                  ? {
                      backgroundColor:
                        "var(--bk-primary-disabled, var(--bk-primary, #ff5a8a))",
                      cursor: "not-allowed",
                    }
                  : undefined
              }
            >
              {submitting ? (
                <MaterialIcon name="progress_activity" className="animate-spin" />
              ) : status === "ok" ? (
                <>
                  <MaterialIcon name="check" />
                  {ctaLabel}
                </>
              ) : (
                ctaLabel
              )}
            </ChunkyButton>
          </form>
          {status === "ok" && (
            <p className="mt-bk-xs font-label font-bold text-sm text-bk-ink">
              {locale !== "en" ? "تم! تحقق من بريدك." : "You're in — check your inbox."}
            </p>
          )}
          {status === "error" && (
            <p className="mt-bk-xs font-label font-bold text-sm text-bk-danger">
              {locale !== "en" ? "حدث خطأ. حاول مرة أخرى." : "Something went wrong. Try again."}
            </p>
          )}
        </div>
      </BentoCard>
    </Section>
  );
}
