// =====================================================================
// Section — faq_contact_split
// =====================================================================
// Two-column FAQ band: an accordion of questions (60%) beside a contact
// card with a WhatsApp CTA (40%); stacked on mobile. Centered eyebrow
// chip + title + optional sub line above. Accordion behavior mirrors
// `faq_accordion` (client component, single-open useState). The
// WhatsApp number resolves through the canonical tenant contact helper
// with an optional per-section override, and the CTA follows the
// site-wide WhatsApp button convention (`--bk-mint` + WhatsAppIcon).
// =====================================================================

"use client";

import Image from "next/image";
import { useState } from "react";
import { z } from "zod";
import { resolveI18n } from "@scheniders/shared";
import { cn } from "./helpers/utils";
import { MaterialIcon, Section, WhatsAppIcon } from "./helpers/primitives";
import { resolveTenantWhatsapp, whatsappDigits } from "./helpers/whatsapp";
import { i18nStringSchema, i18nStringOptional } from "./_schema";
import { registerSection } from "./_registry";
import type { SectionDefinition, SectionRenderContext } from "./_types";

const schema = z.object({
  eyebrow_i18n: i18nStringSchema,
  eyebrow_icon_url: z.string().describe("image").optional(),
  title_i18n: i18nStringSchema,
  sub_i18n: i18nStringOptional,
  /** Small icon rendered at the start of every accordion row. */
  row_icon_url: z.string().describe("image").optional(),
  items: z
    .array(
      z.object({
        q_i18n: i18nStringSchema,
        a_i18n: i18nStringSchema,
      }),
    )
    .min(1)
    .max(10),
  contact: z.object({
    icon_url: z.string().describe("image").optional(),
    title_i18n: i18nStringSchema,
    sub_i18n: i18nStringSchema,
    cta_label_i18n: i18nStringSchema,
    /** Explicit WhatsApp number for this card. Empty = inherit the
     *  store-wide `store_config.contact.whatsapp_number`. */
    whatsapp_number: z.string(),
  }),
});

type Props = z.infer<typeof schema>;

const defaultProps: Props = {
  eyebrow_i18n: { en: "Questions & answers", ar: "أسئلة وأجوبة" },
  eyebrow_icon_url: undefined,
  title_i18n: {
    en: "Frequently asked questions",
    ar: "الأسئلة الأكثر شيوعاً",
  },
  sub_i18n: {
    en: "Answers to the questions our team hears the most.",
    ar: "أجوبة لأسئلتكم المشهورة من فريقنا",
  },
  row_icon_url: undefined,
  items: [
    {
      q_i18n: {
        en: "Can I pay on delivery?",
        ar: "هل يمكن الدفع عند الاستلام؟",
      },
      a_i18n: {
        en: "Yes — cash on delivery is available across all of Iraq.",
        ar: "نعم — الدفع عند الاستلام متاح في جميع محافظات العراق.",
      },
    },
    {
      q_i18n: {
        en: "How long does shipping take?",
        ar: "شكد يطول التوصيل؟",
      },
      a_i18n: {
        en: "Orders inside Baghdad arrive within 24 hours; other governorates take 2–3 days.",
        ar: "الطلبات داخل بغداد توصل خلال 24 ساعة، وباقي المحافظات خلال 2-3 أيام.",
      },
    },
    {
      q_i18n: {
        en: "Can I exchange or return my order?",
        ar: "هل أقدر أستبدل أو أرجع الطلب؟",
      },
      a_i18n: {
        en: "Yes — contact us within 7 days of receiving your order and we'll arrange it.",
        ar: "نعم — تواصل معنا خلال 7 أيام من استلام الطلب ونرتبها لك.",
      },
    },
  ],
  contact: {
    icon_url: undefined,
    title_i18n: { en: "Have a question?", ar: "عندك استفسار؟" },
    sub_i18n: {
      en: "Message us on WhatsApp and we'll get right back to you.",
      ar: "راسلنا على الواتساب ونجاوبك بأسرع وقت",
    },
    cta_label_i18n: { en: "Chat on WhatsApp", ar: "التواصل على واتساب" },
    whatsapp_number: "",
  },
};

/** Soft-fallback card shadow — the brand kit's `--bk-shadow-card` wins. */
const CARD_SHADOW =
  "var(--bk-shadow-card, 0 16px 40px -20px rgb(26 26 26 / 0.18))";

function FaqContactSplit({
  props,
  ctx,
}: {
  props: Props;
  ctx: SectionRenderContext;
}) {
  const locale = ctx.runtime.locale;
  const [openIdx, setOpenIdx] = useState<number | null>(0);

  const eyebrow = resolveI18n(props.eyebrow_i18n, locale);
  const title = resolveI18n(props.title_i18n, locale);
  const sub = resolveI18n(props.sub_i18n, locale);
  const contactTitle = resolveI18n(props.contact.title_i18n, locale);
  const contactSub = resolveI18n(props.contact.sub_i18n, locale);
  const ctaLabel = resolveI18n(props.contact.cta_label_i18n, locale);

  // Explicit per-section number wins when plausible; otherwise fall back
  // to the store-wide tenant WhatsApp contact (same resolver as every
  // other WhatsApp CTA). No usable number → no button.
  const waNumber = resolveTenantWhatsapp(
    ctx.tenant,
    props.contact.whatsapp_number,
  );
  const waHref = waNumber ? `https://wa.me/${whatsappDigits(waNumber)}` : null;

  if (!props.items.length) return null;

  return (
    <Section>
      {/* Centered header — eyebrow chip + title + sub. */}
      <div className="mb-bk-lg flex flex-col items-center gap-3 text-center">
        {eyebrow && (
          <span
            data-i18n-field="eyebrow_i18n"
            className="inline-flex items-center gap-1.5 px-4 py-1.5 font-label font-bold text-xs sm:text-sm"
            style={{
              backgroundColor: "var(--bk-surface-alt, #fff1d6)",
              color: "var(--bk-ink, #1a1a1a)",
              borderRadius: "9999px",
              fontFamily: "var(--bk-font-body, inherit)",
            }}
          >
            {props.eyebrow_icon_url && (
              <Image
                src={props.eyebrow_icon_url}
                alt=""
                width={16}
                height={16}
                unoptimized
                className="h-4 w-4 object-contain"
              />
            )}
            {eyebrow}
          </span>
        )}
        {title && (
          <h2
            data-i18n-field="title_i18n"
            className="font-display font-black text-3xl leading-tight tracking-tight sm:text-4xl"
            style={{
              color: "var(--bk-ink, #1a1a1a)",
              fontFamily: "var(--bk-font-display, inherit)",
            }}
          >
            {title}
          </h2>
        )}
        {sub && (
          <p
            data-i18n-field="sub_i18n"
            className="font-body text-sm sm:text-base"
            style={{
              color: "var(--bk-ink-soft, rgb(26 26 26 / 0.65))",
              fontFamily: "var(--bk-font-body, inherit)",
            }}
          >
            {sub}
          </p>
        )}
      </div>

      {/* 60/40 split on desktop, stacked on mobile. */}
      <div className="mx-auto grid max-w-5xl grid-cols-1 items-start gap-bk-md lg:grid-cols-5 lg:gap-bk-lg">
        {/* Accordion column. */}
        <div className="space-y-bk-sm lg:col-span-3">
          {props.items.map((item, i) => {
            const q = resolveI18n(item.q_i18n, locale);
            const a = resolveI18n(item.a_i18n, locale);
            const open = openIdx === i;
            return (
              <div
                key={`${i}-${q}`}
                className="overflow-hidden"
                style={{
                  backgroundColor: "var(--bk-surface, #ffffff)",
                  borderRadius: "var(--bk-radius-card, 1rem)",
                  boxShadow: CARD_SHADOW,
                }}
              >
                <button
                  type="button"
                  onClick={() => setOpenIdx(open ? null : i)}
                  aria-expanded={open}
                  className="flex w-full items-center gap-3 px-5 py-4 text-start"
                >
                  {props.row_icon_url ? (
                    <Image
                      src={props.row_icon_url}
                      alt=""
                      width={20}
                      height={20}
                      unoptimized
                      className="h-5 w-5 shrink-0 object-contain"
                    />
                  ) : (
                    <span
                      aria-hidden="true"
                      className="h-5 w-1.5 shrink-0 rounded-full"
                      style={{
                        backgroundColor: "var(--bk-accent, #ffd84a)",
                      }}
                    />
                  )}
                  <span
                    data-i18n-field={`items[${i}].q_i18n`}
                    className="flex-1 font-display text-base font-bold leading-tight"
                    style={{
                      color: "var(--bk-ink, #1a1a1a)",
                      fontFamily: "var(--bk-font-display, inherit)",
                    }}
                  >
                    {q}
                  </span>
                  <MaterialIcon
                    name="expand_more"
                    className={cn(
                      "shrink-0 text-xl transition-transform",
                      open && "rotate-180",
                    )}
                  />
                </button>
                {open && (
                  <div
                    data-i18n-field={`items[${i}].a_i18n`}
                    className="px-5 pb-5 font-body text-sm leading-relaxed sm:text-base"
                    style={{
                      color: "var(--bk-ink-soft, rgb(26 26 26 / 0.65))",
                      fontFamily: "var(--bk-font-body, inherit)",
                    }}
                  >
                    {a}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Contact card column. */}
        <div className="pt-5 lg:col-span-2 lg:sticky lg:top-24">
          <div
            className="relative flex flex-col items-center gap-3 px-6 pb-8 pt-10 text-center"
            style={{
              backgroundColor: "var(--bk-surface, #ffffff)",
              borderRadius: "var(--bk-radius-card, 1.25rem)",
              boxShadow: CARD_SHADOW,
            }}
          >
            {/* CSS "pin" hanging over the card's top edge. */}
            <span
              aria-hidden="true"
              className="absolute -top-4 left-1/2 h-10 w-4 -translate-x-1/2 rounded-full"
              style={{ backgroundColor: "var(--bk-accent, #ffd84a)" }}
            />
            {props.contact.icon_url && (
              <Image
                src={props.contact.icon_url}
                alt=""
                width={40}
                height={40}
                unoptimized
                className="h-10 w-10 object-contain"
              />
            )}
            {contactTitle && (
              <div
                data-i18n-field="contact.title_i18n"
                className="font-display text-2xl font-black"
                style={{
                  color: "var(--bk-ink, #1a1a1a)",
                  fontFamily: "var(--bk-font-display, inherit)",
                }}
              >
                {contactTitle}
              </div>
            )}
            {contactSub && (
              <p
                data-i18n-field="contact.sub_i18n"
                className="font-body text-sm leading-relaxed sm:text-base"
                style={{
                  color: "var(--bk-ink-soft, rgb(26 26 26 / 0.65))",
                  fontFamily: "var(--bk-font-body, inherit)",
                }}
              >
                {contactSub}
              </p>
            )}
            {waHref && ctaLabel && (
              <a
                href={waHref}
                target="_blank"
                rel="noopener noreferrer"
                data-i18n-field="contact.cta_label_i18n"
                className="mt-2 inline-flex items-center justify-center gap-2 px-6 py-3 font-display text-sm font-black uppercase tracking-wide sm:text-base"
                style={{
                  backgroundColor: "var(--bk-mint, #7cf0bd)",
                  color: "var(--bk-ink, #1a1a1a)",
                  border:
                    "var(--bk-border-thickness, 3px) solid var(--bk-ink, #1a1a1a)",
                  borderRadius: "9999px",
                  boxShadow:
                    "var(--bk-shadow-button, 2px 2px 0px 0px #1a1a1a)",
                  fontFamily: "var(--bk-font-display, inherit)",
                }}
              >
                <WhatsAppIcon className="h-5 w-5" />
                {ctaLabel}
              </a>
            )}
          </div>
        </div>
      </div>
    </Section>
  );
}

const definition: SectionDefinition<Props> = {
  type: "faq_contact_split",
  category: "content",
  name: { en: "FAQ + contact split", ar: "أسئلة شائعة مع بطاقة تواصل" },
  description: {
    en: "Two-column FAQ accordion beside a WhatsApp contact card.",
    ar: "عمودان: أكورديون أسئلة شائعة بجانب بطاقة تواصل واتساب.",
  },
  thumbnail: "/sections/faq_contact_split.svg",
  valid_on: ["home", "faq", "about", "product"],
  schema,
  defaultProps,
  render: FaqContactSplit,
};

registerSection(definition);
export default definition;
