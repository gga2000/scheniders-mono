// =====================================================================
// Section — newsletter_inline
// =====================================================================
// Inline newsletter signup (not a modal). Posts to `/api/newsletter`
// with the visitor's locale + email. The endpoint is owned elsewhere;
// this section only renders the form.
// =====================================================================

"use client";

import { useState } from "react";
import { z } from "zod";
import { resolveI18n } from "@scheniders/shared";
import {
  BentoCard,
  ChunkyButton,
  ScribbleHeading,
  Sticker,
} from "./helpers/primitives";
import { i18nStringSchema, i18nStringOptional } from "./_schema";
import { registerSection } from "./_registry";
import type { SectionDefinition } from "./_types";

const tint = z.enum(["white", "mint", "butter", "lilac", "sky", "pink"]);

const schema = z.object({
  heading_i18n: i18nStringSchema,
  body_i18n: i18nStringOptional,
  placeholder_i18n: i18nStringSchema,
  cta_label_i18n: i18nStringSchema,
  bg: tint.optional(),
});

type Props = z.infer<typeof schema>;

const defaultProps: Props = {
  heading_i18n: { en: "Get the drops first", ar: "كن أول من يعرف" },
  body_i18n: {
    en: "Subscribe for restocks and first-look launches.",
    ar: "اشترك ليصلك كل جديد وإعادة التوفير.",
  },
  placeholder_i18n: { en: "you@email.com", ar: "your@email.com" },
  cta_label_i18n: { en: "Sign me up", ar: "اشترك" },
  bg: "butter",
};

function NewsletterInlineRender({
  props,
  ctx,
}: {
  props: Props;
  ctx: { runtime: { locale: "ar" | "en" | "ku" } };
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

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!email || status === "submitting") return;
    setStatus("submitting");
    try {
      const res = await fetch("/api/newsletter", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, locale }),
      });
      setStatus(res.ok ? "ok" : "error");
      if (res.ok) setEmail("");
    } catch {
      setStatus("error");
    }
  }

  return (
    <section className="px-4 py-8">
      <BentoCard bg={props.bg ?? "butter"} size="md" className="p-6 sm:p-8 relative">
        <div className="absolute -top-3 -right-3">
          <Sticker bg="pink" rotate={6} size="sm">
            ✱ news
          </Sticker>
        </div>
        <div className="max-w-xl">
          <ScribbleHeading color="lilac" className="mb-2">
            {heading}
          </ScribbleHeading>
          {body && (
            <p className="font-body text-sm sm:text-base text-candy-ink/80 mb-4">
              {body}
            </p>
          )}
          <form onSubmit={onSubmit} className="flex flex-col sm:flex-row gap-3">
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
              onChange={(e) => setEmail(e.target.value)}
              className="flex-1 bg-white px-4 py-3 font-body text-base placeholder:text-candy-ink/40 focus:outline-none focus:ring-0"
              style={{
                border:
                  "var(--bk-border-thickness, 3px) solid var(--bk-ink, #1a1a1a)",
                borderRadius: "var(--bk-radius-input, 0.75rem)",
                color: "var(--bk-ink, #1a1a1a)",
                fontFamily: "var(--bk-font-body, inherit)",
              }}
              disabled={status === "submitting"}
            />
            <ChunkyButton
              type="submit"
              bg="pink"
              size="md"
              disabled={status === "submitting"}
            >
              {status === "submitting" ? "…" : ctaLabel}
            </ChunkyButton>
          </form>
          {status === "ok" && (
            <p className="mt-3 font-label font-bold text-sm text-candy-ink">
              {locale === "ar" ? "تم! تحقق من بريدك." : "You're in — check your inbox."}
            </p>
          )}
          {status === "error" && (
            <p className="mt-3 font-label font-bold text-sm text-candy-pink">
              {locale === "ar" ? "حدث خطأ. حاول مرة أخرى." : "Something went wrong. Try again."}
            </p>
          )}
        </div>
      </BentoCard>
    </section>
  );
}

const def: SectionDefinition<Props> = {
  type: "newsletter_inline",
  category: "conversion",
  name: { en: "Newsletter signup", ar: "اشتراك النشرة" },
  description: {
    en: "Inline newsletter email capture with chunky-card styling.",
    ar: "بطاقة اشتراك بريد إلكتروني داخل الصفحة.",
  },
  thumbnail: "/sections/newsletter_inline.svg",
  valid_on: ["home", "about", "category"],
  schema,
  defaultProps,
  render: NewsletterInlineRender,
};

registerSection(def);
export default def;
