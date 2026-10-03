// =====================================================================
// Section — faq_contact_split
// =====================================================================
// Two-column FAQ band: an accordion of questions (60%) beside a contact
// card with a WhatsApp CTA (40%); stacked on mobile. Centered eyebrow
// chip + title + optional sub line above. The accordion is native
// `<details name="…">` — closed answers stay in the DOM (FAQ rich
// results, find-in-page), the shared `name` gives exclusive-open, and
// the section needs no client JS. The WhatsApp number resolves through
// the canonical tenant contact helper with an optional per-section
// override; the CTA is the shared `WhatsAppButton` primitive.
// =====================================================================

import Image from "next/image";
import { useId } from "react";
import { z } from "zod";
import { resolveI18n } from "@scheniders/shared";
import {
  CenteredSectionHeader,
  MaterialIcon,
  Section,
  WhatsAppButton,
} from "./helpers/primitives";
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
  /**
   * "cards" (the default, and what every existing config renders) gives each
   * question its own raised plate. "ledger" sets the questions as one
   * hairline-ruled editorial list — the same move the pillars took, for the
   * same reason: six identical floating plates read as a machine's output,
   * and a row that opens should feel like it belongs to a document.
   */
  layout: z.enum(["cards", "ledger"]).optional(),
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

/** The ledger's rule: ink at low opacity, so it tracks the brand kit. */
const HAIRLINE = "color-mix(in srgb, var(--bk-ink, #1a1a1a) 12%, transparent)";


function FaqContactSplit({
  props,
  ctx,
}: {
  props: Props;
  ctx: SectionRenderContext;
}) {
  const locale = ctx.runtime.locale;
  // One `name` per section instance so two FAQ blocks on a page don't
  // collapse each other's rows.
  const groupName = `faq-${useId()}`;

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

  const rows = props.items.map((item) => ({
    question: resolveI18n(item.q_i18n, locale),
    answer: resolveI18n(item.a_i18n, locale),
  }));
  const ledger = props.layout === "ledger";

  return (
    <Section>
      <CenteredSectionHeader
        eyebrow={
          eyebrow ? (
            <>
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
            </>
          ) : undefined
        }
        glyph={props.eyebrow_icon_url ? "none" : "sparkle"}
        // On /faq and /contact this section leads the page and owns its h1.
        as={
          ctx.runtime.page_id === "faq" || ctx.runtime.page_id === "contact"
            ? "h1"
            : "h2"
        }
        title={title}
        subtitle={sub}
        eyebrowField="eyebrow_i18n"
        titleField="title_i18n"
        subtitleField="sub_i18n"
      />

      {/* 60/40 split on desktop, stacked on mobile. */}
      <div className="mx-auto grid max-w-5xl grid-cols-1 items-start gap-bk-md lg:grid-cols-5 lg:gap-bk-lg">
        {/* Accordion column. */}
        <div
          className={
            ledger ? "lg:col-span-3" : "space-y-bk-sm lg:col-span-3"
          }
          style={ledger ? { borderBottom: `1px solid ${HAIRLINE}` } : undefined}
        >
          {rows.map(({ question: q, answer: a }, i) => {
            if (ledger) {
              return (
                <details
                  key={`${i}-${q}`}
                  name={groupName}
                  open={i === 0}
                  className="group"
                  style={{ borderTop: `1px solid ${HAIRLINE}` }}
                >
                  <summary className="flex w-full cursor-pointer list-none items-baseline gap-4 py-5 text-start [&::-webkit-details-marker]:hidden">
                    {/* The rule grows when the row opens: the only moving
                        part, and it marks which row you are reading. */}
                    <span
                      aria-hidden="true"
                      className="mt-[0.6em] h-0.5 w-5 shrink-0 transition-[width] duration-200 group-open:w-9 motion-reduce:transition-none"
                      style={{ backgroundColor: "var(--bk-accent, #ffd84a)" }}
                    />
                    <span
                      data-i18n-field={`items[${i}].q_i18n`}
                      className="flex-1 font-display text-[1.0625rem] font-bold leading-snug text-balance sm:text-xl"
                      style={{
                        color: "var(--bk-ink, #1a1a1a)",
                        fontFamily: "var(--bk-font-display, inherit)",
                      }}
                    >
                      {q}
                    </span>
                    <MaterialIcon
                      name="expand_more"
                      className="shrink-0 text-xl transition-transform duration-200 motion-reduce:transition-none group-open:rotate-180"
                    />
                  </summary>
                  {/* Indented to the question's text column, and held to a
                      readable measure instead of the full 60% column. */}
                  <div
                    data-i18n-field={`items[${i}].a_i18n`}
                    className="max-w-[62ch] pb-6 ps-9 font-body text-sm leading-relaxed text-pretty sm:text-base"
                    style={{
                      color: "var(--bk-ink-soft, rgb(26 26 26 / 0.65))",
                      fontFamily: "var(--bk-font-body, inherit)",
                    }}
                  >
                    {a}
                  </div>
                </details>
              );
            }
            return (
              <details
                key={`${i}-${q}`}
                name={groupName}
                open={i === 0}
                className="group overflow-hidden"
                style={{
                  backgroundColor: "var(--bk-surface, #ffffff)",
                  borderRadius: "var(--bk-radius-card, 1rem)",
                  boxShadow: CARD_SHADOW,
                }}
              >
                <summary className="flex w-full cursor-pointer list-none items-center gap-3 px-5 py-4 text-start transition-opacity duration-150 motion-reduce:transition-none active:opacity-70 [&::-webkit-details-marker]:hidden">
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
                    className="flex-1 font-display text-base font-bold leading-tight text-balance"
                    style={{
                      color: "var(--bk-ink, #1a1a1a)",
                      fontFamily: "var(--bk-font-display, inherit)",
                    }}
                  >
                    {q}
                  </span>
                  <MaterialIcon
                    name="expand_more"
                    className="shrink-0 text-xl transition-transform duration-200 motion-reduce:transition-none group-open:rotate-180"
                  />
                </summary>
                <div
                  data-i18n-field={`items[${i}].a_i18n`}
                  className="px-5 pb-5 font-body text-sm leading-relaxed text-pretty sm:text-base"
                  style={{
                    color: "var(--bk-ink-soft, rgb(26 26 26 / 0.65))",
                    fontFamily: "var(--bk-font-body, inherit)",
                  }}
                >
                  {a}
                </div>
              </details>
            );
          })}
        </div>

        {/* Contact card column. */}
        <div
          className={
            ledger
              ? "lg:col-span-2 lg:sticky lg:top-24"
              : "pt-5 lg:col-span-2 lg:sticky lg:top-24"
          }
        >
          <div
            className={
              ledger
                ? "relative flex flex-col items-start gap-3 px-6 pb-8 pt-8 text-start"
                : "relative flex flex-col items-center gap-3 px-6 pb-8 pt-10 text-center"
            }
            style={
              ledger
                ? {
                    // Flush with the ledger: a tinted panel under a rule,
                    // not a plate floating over the page.
                    backgroundColor:
                      "color-mix(in srgb, var(--bk-accent, #ffd84a) 8%, var(--bk-surface-alt, #faf7f0))",
                    borderRadius: "var(--bk-radius-card, 1.25rem)",
                    borderTop: "2px solid var(--bk-accent, #ffd84a)",
                  }
                : {
                    backgroundColor: "var(--bk-surface, #ffffff)",
                    borderRadius: "var(--bk-radius-card, 1.25rem)",
                    boxShadow: CARD_SHADOW,
                  }
            }
          >
            {/* CSS "pin" hanging over the card's top edge — the cards
                layout's one piece of whimsy. The ledger carries a rule
                instead, so nothing overhangs the list's left edge. */}
            {!ledger && (
            <span
              aria-hidden="true"
              className="absolute -top-4 left-1/2 h-10 w-4 -translate-x-1/2 rounded-full"
              style={{ backgroundColor: "var(--bk-accent, #ffd84a)" }}
            />
            )}
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
              <h3
                data-i18n-field="contact.title_i18n"
                className="font-display text-bk-h3 font-black text-balance"
                style={{
                  color: "var(--bk-ink, #1a1a1a)",
                  fontFamily: "var(--bk-font-display, inherit)",
                }}
              >
                {contactTitle}
              </h3>
            )}
            {contactSub && (
              <p
                data-i18n-field="contact.sub_i18n"
                className="font-body text-sm leading-relaxed text-pretty sm:text-base"
                style={{
                  color: "var(--bk-ink-soft, rgb(26 26 26 / 0.65))",
                  fontFamily: "var(--bk-font-body, inherit)",
                }}
              >
                {contactSub}
              </p>
            )}
            {waHref && ctaLabel && (
              <WhatsAppButton
                href={waHref}
                tone="solid"
                className="mt-2"
                data-i18n-field="contact.cta_label_i18n"
              >
                {ctaLabel}
              </WhatsAppButton>
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
  valid_on: ["home", "faq", "about", "product", "contact"],
  schema,
  defaultProps,
  render: FaqContactSplit,
};

registerSection(definition);
export default definition;
