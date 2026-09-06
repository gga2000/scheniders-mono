// =====================================================================
// Section — testimonial_cards
// =====================================================================
// Static band of testimonial cards under a centered eyebrow chip +
// title. Each card sits on `--bk-surface` with a soft shadow and a small
// CSS "pin" (accent rounded rectangle) hanging over its top edge — no
// avatars, no carousel. Optional decorative side images flank the band
// on large screens. Fully brand-kit-token driven; no hardcoded content.
// =====================================================================

import Image from "next/image";
import { z } from "zod";
import { resolveI18n } from "@scheniders/shared";
import { CenteredSectionHeader, Section } from "./helpers/primitives";
import { i18nStringSchema } from "./_schema";
import { registerSection } from "./_registry";
import type { SectionDefinition, SectionRenderContext } from "./_types";

const schema = z.object({
  eyebrow_i18n: i18nStringSchema,
  eyebrow_icon_url: z.string().describe("image").optional(),
  title_i18n: i18nStringSchema,
  /** Decorative art hugging the band edges on large screens. */
  side_image_left_url: z.string().describe("image").optional(),
  side_image_right_url: z.string().describe("image").optional(),
  items: z
    .array(
      z.object({
        name_i18n: i18nStringSchema,
        quote_i18n: i18nStringSchema,
      }),
    )
    .min(1)
    .max(6),
});

type Props = z.infer<typeof schema>;

const defaultProps: Props = {
  eyebrow_i18n: { en: "Customer reviews", ar: "آراء زبائننا" },
  eyebrow_icon_url: undefined,
  title_i18n: {
    en: "Why customers love us",
    ar: "ليش الناس تحب منتجاتنا",
  },
  side_image_left_url: undefined,
  side_image_right_url: undefined,
  items: [
    {
      name_i18n: { en: "Mohammed Ali", ar: "محمد علي" },
      quote_i18n: {
        en: "Honestly, the products and the packaging are amazing.",
        ar: "المنتجات والتغليف يفوزون صراحة.",
      },
    },
    {
      name_i18n: { en: "Zahraa Kareem", ar: "زهراء كريم" },
      quote_i18n: {
        en: "Exactly as described — arrived fast and the quality is rare to find.",
        ar: "نفس الوصف بالضبط، وصلني بسرعة والجودة نادرة كلش. شكراً",
      },
    },
    {
      name_i18n: { en: "Noreen", ar: "نورين" },
      quote_i18n: {
        en: "This is my second order — the quality and packaging are unlike anything I've seen.",
        ar: "هاي ثاني مرة اشتري منكم، النوعية والتغليف ما شفت مثلهم بحياتي.",
      },
    },
  ],
};

/** Soft-fallback card shadow — the brand kit's `--bk-shadow-card` wins
 *  when set (hard offset for chunky kits, soft blur for soft kits). */
const CARD_SHADOW =
  "var(--bk-shadow-card, 0 16px 40px -20px rgb(26 26 26 / 0.18))";

function TestimonialCards({
  props,
  ctx,
}: {
  props: Props;
  ctx: SectionRenderContext;
}) {
  const locale = ctx.runtime.locale;
  const eyebrow = resolveI18n(props.eyebrow_i18n, locale);
  const title = resolveI18n(props.title_i18n, locale);

  if (!props.items.length) return null;

  return (
    <Section className="relative">
      {/* Decorative side art — band edges, large screens only. */}
      {props.side_image_left_url && (
        <Image
          src={props.side_image_left_url}
          alt=""
          width={64}
          height={64}
          unoptimized
          aria-hidden="true"
          className="pointer-events-none absolute left-2 top-1/2 hidden w-12 -translate-y-1/2 object-contain lg:block xl:w-16"
        />
      )}
      {props.side_image_right_url && (
        <Image
          src={props.side_image_right_url}
          alt=""
          width={64}
          height={64}
          unoptimized
          aria-hidden="true"
          className="pointer-events-none absolute right-2 top-1/2 hidden w-12 -translate-y-1/2 object-contain lg:block xl:w-16"
        />
      )}

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
        title={title}
        eyebrowField="eyebrow_i18n"
        titleField="title_i18n"
      />

      {/* Cards — 3-up desktop, stacked mobile. `pt` clears the pins. */}
      <div className="mx-auto grid max-w-5xl grid-cols-1 gap-bk-md pt-5 md:grid-cols-3 md:gap-bk-lg">
        {props.items.map((item, i) => {
          const name = resolveI18n(item.name_i18n, locale);
          const quote = resolveI18n(item.quote_i18n, locale);
          return (
            <figure
              key={`${i}-${name}`}
              className="relative flex flex-col items-center gap-2 px-6 pb-8 pt-9 text-center"
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
              <figcaption
                data-i18n-field={`items[${i}].name_i18n`}
                className="font-display text-lg font-black"
                style={{
                  color: "var(--bk-ink, #1a1a1a)",
                  fontFamily: "var(--bk-font-display, inherit)",
                }}
              >
                {name}
              </figcaption>
              <blockquote
                data-i18n-field={`items[${i}].quote_i18n`}
                className="font-body text-sm leading-relaxed text-pretty sm:text-base"
                style={{
                  color: "var(--bk-ink-soft, rgb(26 26 26 / 0.65))",
                  fontFamily: "var(--bk-font-body, inherit)",
                }}
              >
                {quote}
              </blockquote>
            </figure>
          );
        })}
      </div>
    </Section>
  );
}

const definition: SectionDefinition<Props> = {
  type: "testimonial_cards",
  category: "content",
  name: { en: "Testimonial cards", ar: "بطاقات آراء الزبائن" },
  description: {
    en: "Static testimonial cards with a pin decoration — eyebrow chip, title, name + quote.",
    ar: "بطاقات ثابتة لآراء الزبائن مع دبوس زخرفي — شارة، عنوان، اسم واقتباس.",
  },
  thumbnail: "/sections/testimonial_cards.svg",
  valid_on: ["home", "about", "product"],
  schema,
  defaultProps,
  render: TestimonialCards,
};

registerSection(definition);
export default definition;
