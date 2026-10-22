// =====================================================================
// Section — accordion_richtext
// =====================================================================
// Generic accordion for long-form rich-text content — shipping, terms,
// privacy, returns, sizing, etc. Different from `faq_accordion` which
// is Q&A; here each panel is a titled section with a multi-paragraph
// body. Renders paragraphs split on blank lines. Panels are native
// `<details>` so closed bodies stay in the DOM (crawlable, find-in-page)
// and the section ships no client JS; `allow_multiple: false` uses a
// shared `name` for exclusive-open.
// Opt-in `layout: "quiet"` swaps the cards for a hairline list with
// height-animated panels — a small client island in
// `./accordion_richtext.client.tsx`. Unset (every existing config) keeps
// the zero-JS cards render byte-identical. Opt-in `call_row` (quiet only)
// ends the list with a tap-to-call row on the store's call number.
// =====================================================================

import { useId } from "react";
import { z } from "zod";
import {
  formatIraqiPhoneDisplay,
  parseStoreContact,
  resolveI18n,
} from "@scheniders/shared";
import type { LocaleCode } from "@scheniders/shared";
import {
  BentoCard,
  CenteredSectionHeader,
  MaterialIcon,
  Section,
} from "./helpers/primitives";
import { whatsappDigits } from "./helpers/whatsapp";
import { i18nStringSchema, i18nStringOptional } from "./_schema";
import { registerSection } from "./_registry";
import type { SectionDefinition, SectionRenderContext } from "./_types";
import { readsRtl } from "./pdp_express/text";
import { AccordionRichtextQuiet } from "./accordion_richtext.client";
import type { QuietCallRow } from "./accordion_richtext.client";

const schema = z.object({
  heading_i18n: i18nStringOptional,
  allow_multiple: z.boolean(),
  items: z.array(
    z.object({
      title_i18n: i18nStringSchema,
      body_i18n: i18nStringSchema,
    }),
  ),
  /**
   * "cards" (the default, and what every existing config renders) = bordered bento plates with a tinted +/x chip per row.
   * "quiet" = one hairline-ruled list with a single ink chevron and height-animated panels (client island). It is opt-in so the shared default stays byte-identical.
   */
  layout: z.enum(["cards", "quiet"]).optional().catch(undefined),
  /**
   * Quiet layout only: one tinted row after the list — the merchant's prompt
   * over the store's call number, and a tap-to-call pill. The number is
   * `commerce.contact.call_number`, read through `parseStoreContact` (the
   * resolver behind the PDP "who contacts you" line and the thank-you call
   * card), so the three can never disagree. No valid Iraqi mobile there, or
   * an empty prompt or action → no row. Ignored by the cards layout. Unset
   * (every existing config) renders exactly as before; a malformed value
   * parses to undefined.
   */
  call_row: z
    .object({
      prompt_i18n: i18nStringSchema,
      action_i18n: i18nStringSchema,
    })
    .optional()
    .catch(undefined),
});

export type Props = z.infer<typeof schema>;

const defaultProps: Props = {
  heading_i18n: { en: "Details", ar: "التفاصيل" },
  allow_multiple: false,
  items: [
    {
      title_i18n: { en: "Shipping", ar: "الشحن" },
      body_i18n: {
        en: "Same-day delivery in Baghdad on orders placed before 4pm.\n\nOther governorates ship in 1–3 working days.",
        ar: "توصيل بنفس اليوم في بغداد للطلبات قبل الرابعة عصراً.\n\nبقية المحافظات خلال 1-3 أيام عمل.",
      },
    },
    {
      title_i18n: { en: "Returns", ar: "الإرجاع" },
      body_i18n: {
        en: "14-day free returns on unopened items.\n\nContact support to start a return.",
        ar: "إرجاع مجاني خلال 14 يوماً للمنتجات غير المفتوحة.\n\nتواصل مع الدعم لبدء عملية الإرجاع.",
      },
    },
  ],
};

/** Icon-box tint rotation, derived from the tenant's own palette rather
 *  than the `--bk-decor-a/b/c` decorative surfaces: those are
 *  deliberately un-themeable, so on a cream-and-yellow store they were the
 *  one off-palette thing on the product page. Soft mixes keep the rotation
 *  legible against `--bk-ink` on every kit. (A dynamic `bg-candy-${tint}`
 *  class was purged by Tailwind and rendered nothing — hence inline.) */
const ICON_TINTS = [
  "color-mix(in srgb, var(--bk-accent, #ffd84a) 55%, var(--bk-surface, #fff))",
  "color-mix(in srgb, var(--bk-primary, #ff5a8a) 22%, var(--bk-surface, #fff))",
  "color-mix(in srgb, var(--bk-success, #25d366) 28%, var(--bk-surface, #fff))",
  "color-mix(in srgb, var(--bk-secondary, #3e3129) 18%, var(--bk-surface, #fff))",
  "var(--bk-surface-alt, #fff7ed)",
] as const;

/** The quiet layout's call row, resolved — or null when any part is
 *  missing (no opt-in, no valid call number, an empty string). */
export function resolveCallRow(
  callRow: Props["call_row"],
  contact: unknown,
  locale: LocaleCode,
): QuietCallRow | null {
  if (!callRow) return null;
  const prompt = resolveI18n(callRow.prompt_i18n, locale);
  const action = resolveI18n(callRow.action_i18n, locale);
  const dial = parseStoreContact(contact)?.call_number;
  if (!prompt || !action || !dial) return null;
  return {
    prompt,
    action,
    number: formatIraqiPhoneDisplay(dial),
    href: `tel:+${whatsappDigits(dial)}`,
  };
}

function renderParagraphs(text: string): React.ReactNode {
  return text.split(/\n{2,}/).map((p, i) => (
    <p
      key={i}
      className="mb-3 last:mb-0 font-body text-sm leading-relaxed text-pretty"
    >
      {p.split(/\n/).map((line, j, arr) => (
        <span key={j}>
          {line}
          {j < arr.length - 1 && <br />}
        </span>
      ))}
    </p>
  ));
}

function AccordionRichtextRender({
  props,
  ctx,
}: {
  props: Props;
  ctx: SectionRenderContext;
}) {
  const locale = ctx.runtime.locale;
  // Exclusive-open group per section instance (only when one-at-a-time).
  const groupName = `accordion-${useId()}`;

  if (props.items.length === 0) return null;

  const heading = resolveI18n(props.heading_i18n, locale);

  if (props.layout === "quiet") {
    return (
      <AccordionRichtextQuiet
        heading={heading}
        items={props.items.map((it) => ({
          title: resolveI18n(it.title_i18n, locale),
          body: resolveI18n(it.body_i18n, locale),
        }))}
        exclusive={!props.allow_multiple}
        rtl={readsRtl(locale)}
        call={resolveCallRow(
          props.call_row,
          ctx.tenant.store_config_v2?.commerce?.contact,
          locale,
        )}
      />
    );
  }

  return (
    <Section>
      {heading && (
        <CenteredSectionHeader
          title={heading}
          align="start"
          titleField="heading_i18n"
        />
      )}
      <div className="space-y-bk-sm">
        {props.items.map((item, i) => {
          const title = resolveI18n(item.title_i18n, locale);
          const body = resolveI18n(item.body_i18n, locale);
          const tint = ICON_TINTS[i % ICON_TINTS.length];
          return (
            <BentoCard
              key={`${i}-${title}`}
              bg="white"
              className="p-0 overflow-hidden"
              style={{ borderRadius: "var(--bk-radius-card, 1.25rem)" }}
            >
              <details
                className="group"
                name={props.allow_multiple ? undefined : groupName}
                open={i === 0}
              >
                <summary className="flex w-full cursor-pointer list-none items-center justify-between gap-3 px-4 py-4 text-start transition-opacity duration-bk-fast motion-reduce:transition-none active:opacity-70 [&::-webkit-details-marker]:hidden">
                  <span className="flex-1 font-display font-black text-base sm:text-lg bk-caps leading-tight text-balance">
                    {title}
                  </span>
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center transition-transform duration-bk-base motion-reduce:transition-none group-open:rotate-45"
                    style={{
                      backgroundColor: tint,
                      color: "var(--bk-ink, #1a1a1a)",
                      border:
                        "var(--bk-border-thickness, 3px) solid var(--bk-ink, #1a1a1a)",
                      borderRadius: "var(--bk-radius-input, 0.75rem)",
                    }}
                  >
                    <MaterialIcon name="add" className="text-xl" />
                  </span>
                </summary>
                <div
                  className="px-4 pb-4 pt-3 text-bk-ink-soft"
                  style={{
                    borderTop:
                      "var(--bk-border-thickness, 3px) dashed color-mix(in srgb, var(--bk-ink, #1a1a1a) 10%, transparent)",
                  }}
                >
                  {renderParagraphs(body)}
                </div>
              </details>
            </BentoCard>
          );
        })}
      </div>
    </Section>
  );
}

const definition: SectionDefinition<Props> = {
  type: "accordion_richtext",
  category: "content",
  name: { en: "Rich-text accordion", ar: "أكوردين نص غني" },
  description: {
    en: "Accordion with rich-text bodies for terms, shipping, returns, etc.",
    ar: "أكوردين بمحتوى نصّي غني للسياسات والشحن والإرجاع.",
  },
  thumbnail: "/sections/accordion_richtext.svg",
  valid_on: [
    "home",
    "about",
    "faq",
    "policy_shipping",
    "policy_returns",
    "policy_privacy",
    "policy_terms",
    "product",
  ],
  schema,
  defaultProps,
  render: AccordionRichtextRender,
};

registerSection(definition);
export default definition;
