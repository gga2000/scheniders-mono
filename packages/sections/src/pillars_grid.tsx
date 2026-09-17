// =====================================================================
// Section — pillars_grid
// =====================================================================
// "Why us" pillars: centered header (small eyebrow chip with an
// optional icon image, then a display-font title) above a grid of
// soft cards — icon image top, bold title, long muted body. 3 columns
// on desktop, 1 on mobile. Cards sit on `--bk-surface` with the
// brand-kit card radius + shadow; icons are merchant image URLs.
// =====================================================================

import { z } from "zod";
import { resolveI18n } from "@scheniders/shared";
import { CenteredSectionHeader, Section } from "./helpers/primitives";
import { i18nStringSchema, i18nStringOptional, urlString } from "./_schema";
import { registerSection } from "./_registry";
import type { SectionDefinition, SectionRenderContext } from "./_types";

const schema = z.object({
  eyebrow_i18n: i18nStringOptional,
  eyebrow_icon_url: urlString.describe("image").optional(),
  title_i18n: i18nStringSchema,
  /**
   * "ledger" drops the three-box grid for numbered rows with a rule
   * between them. Unset keeps the card grid byte-identical.
   */
  layout: z.enum(["cards", "ledger"]).optional(),
  items: z
    .array(
      z.object({
        icon_url: urlString.describe("image"),
        title_i18n: i18nStringSchema,
        body_i18n: i18nStringSchema,
        /**
         * A customer's own words backing this claim, and who said them.
         * Only ever set where a real review says it — a claim nobody has
         * confirmed carries no receipt, and inventing one would make the
         * whole section worth less.
         */
        proof_i18n: i18nStringOptional,
        proof_name_i18n: i18nStringOptional,
      }),
    )
    // A merchant trimming to one pillar must not lose the whole section.
    .min(1)
    .max(6),
});

type Props = z.infer<typeof schema>;

const defaultProps: Props = {
  eyebrow_i18n: { en: "Our promise", ar: "ميزاتنا" },
  eyebrow_icon_url: undefined,
  title_i18n: { en: "Why choose us?", ar: "ليش تختارنا؟" },
  items: [
    {
      icon_url: "",
      title_i18n: { en: "Outstanding quality", ar: "الجودة الفائقة" },
      body_i18n: {
        en: "Every product is hand-checked before it ships, so what arrives at your door matches what you saw — no surprises, no compromises.",
        ar: "كل منتج يخضع للفحص قبل الشحن، حتى يوصلك بالضبط مثل ما شفته — بدون مفاجآت وبدون تنازلات.",
      },
    },
    {
      icon_url: "",
      title_i18n: { en: "Real value", ar: "القيمة مقابل السعر" },
      body_i18n: {
        en: "Fair prices for genuine products. We keep our margins honest so you get the best of both: quality you can trust at a price that makes sense.",
        ar: "أسعار عادلة لمنتجات أصلية. نحافظ على أسعار منطقية حتى تحصل على جودة تعتمد عليها بسعر يناسبك.",
      },
    },
    {
      icon_url: "",
      title_i18n: { en: "Service you can rely on", ar: "خدمة تعتمد عليها" },
      body_i18n: {
        en: "From the moment you order to the moment it arrives, our team follows up with you — fast answers, easy returns, and delivery all over Iraq.",
        ar: "من لحظة الطلب إلى لحظة الاستلام، فريقنا يتابع معك — رد سريع، إرجاع سهل، وتوصيل لكل محافظات العراق.",
      },
    },
  ],
};

function PillarsGridRender({
  props,
  ctx,
}: {
  props: Props;
  ctx: SectionRenderContext;
}) {
  const locale = ctx.runtime.locale;
  const eyebrow = resolveI18n(props.eyebrow_i18n, locale);
  const title = resolveI18n(props.title_i18n, locale);
  if (props.items.length === 0) return null;

  return (
    <Section className="text-bk-ink">
      <div className="mx-auto max-w-6xl">
        <CenteredSectionHeader
          eyebrow={
            eyebrow ? (
              <>
                {props.eyebrow_icon_url && (
                  /* eslint-disable-next-line @next/next/no-img-element -- merchant-supplied icon URLs (usually SVG) aren't next/image remote-pattern candidates */
                  <img
                    src={props.eyebrow_icon_url}
                    alt=""
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

        {props.layout === "ledger" ? (
          /* A ledger, not a feature table. Three identical boxes is the
             most recognisable machine-built layout there is, and it gives
             every claim the same weight whether or not anything stands
             behind it. Numbered rows read as a position taken. */
          <ol data-pillar-ledger className="mx-auto max-w-3xl">
            {props.items.map((item, i) => {
              const itemTitle = resolveI18n(item.title_i18n, locale);
              const body = resolveI18n(item.body_i18n, locale);
              const proof = item.proof_i18n
                ? resolveI18n(item.proof_i18n, locale)
                : null;
              const proofName = item.proof_name_i18n
                ? resolveI18n(item.proof_name_i18n, locale)
                : null;
              return (
                <li
                  key={`${i}-${itemTitle}`}
                  data-pillar-row
                  className="flex gap-5 py-7 sm:gap-8"
                  style={
                    i === 0
                      ? undefined
                      : {
                          borderTop:
                            "1px solid var(--bk-divider, rgb(26 26 26 / 0.12))",
                        }
                  }
                >
                  <span
                    aria-hidden="true"
                    className="shrink-0 font-display text-2xl font-black leading-none tabular-nums sm:text-3xl"
                    style={{
                      color:
                        "color-mix(in srgb, var(--bk-accent, #fbb82e) 85%, var(--bk-ink, #1a1a1a))",
                      fontFamily: "var(--bk-font-display, inherit)",
                    }}
                  >
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <div className="min-w-0 text-start">
                    <h3
                      data-i18n-field={`items[${i}].title_i18n`}
                      className="font-display text-lg font-bold text-balance sm:text-xl"
                      style={{
                        color: "var(--bk-ink, #1a1a1a)",
                        fontFamily: "var(--bk-font-display, inherit)",
                      }}
                    >
                      {itemTitle}
                    </h3>
                    <p
                      data-i18n-field={`items[${i}].body_i18n`}
                      className="mt-1.5 font-body text-sm leading-relaxed text-pretty sm:text-base"
                      style={{
                        // The cards used ink at 0.6 alpha and measured
                        // 4.32:1 here; ink-soft at 0.7 only reached 4.44.
                        // Body copy at 16px regular needs the full 4.5, so
                        // this is mixed explicitly rather than borrowing a
                        // token whose alpha was chosen for other surfaces.
                        color:
                          "color-mix(in srgb, var(--bk-ink, #1a1a1a) 84%, transparent)",
                        fontFamily: "var(--bk-font-body, inherit)",
                      }}
                    >
                      {body}
                    </p>
                    {proof && (
                      /* A customer confirming the claim in their own words.
                         Rendered only where one exists. */
                      <p
                        data-pillar-proof
                        className="mt-3 border-s-2 ps-3 font-body text-sm italic leading-relaxed"
                        style={{
                          borderInlineStartColor:
                            "color-mix(in srgb, var(--bk-accent, #fbb82e) 55%, transparent)",
                          color: "var(--bk-ink, #1a1a1a)",
                          fontFamily: "var(--bk-font-body, inherit)",
                        }}
                      >
                        {proof}
                        {proofName && (
                          <span
                            data-pillar-proof-name
                            className="not-italic"
                            style={{
                              color: "var(--bk-ink-soft, rgb(26 26 26 / 0.7))",
                            }}
                          >
                            {" "}
                            — {proofName}
                          </span>
                        )}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        ) : (
        /* Pillar cards — 3-up desktop, 1-up mobile */
        <div className="grid grid-cols-1 gap-bk-md md:grid-cols-3">
          {props.items.map((item, i) => {
            const itemTitle = resolveI18n(item.title_i18n, locale);
            const body = resolveI18n(item.body_i18n, locale);
            return (
              <div
                key={`${i}-${itemTitle}`}
                className="flex flex-col items-center gap-bk-sm p-6 text-center sm:p-7"
                style={{
                  backgroundColor: "var(--bk-surface, #ffffff)",
                  borderRadius: "var(--bk-radius-card, 1rem)",
                  boxShadow:
                    "var(--bk-shadow-card, 0 8px 24px rgb(26 26 26 / 0.08))",
                }}
              >
                {item.icon_url ? (
                  /* eslint-disable-next-line @next/next/no-img-element -- merchant-supplied icon URLs (usually SVG) aren't next/image remote-pattern candidates */
                  <img
                    src={item.icon_url}
                    alt=""
                    loading="lazy"
                    className="h-12 w-12 object-contain"
                  />
                ) : (
                  /* Empty icon slot (editor placeholder) — keep the layout. */
                  <span
                    aria-hidden="true"
                    className="h-12 w-12 rounded-full"
                    style={{
                      backgroundColor:
                        "color-mix(in srgb, var(--bk-accent, #ffd84a) 24%, transparent)",
                    }}
                  />
                )}
                <h3
                  data-i18n-field={`items[${i}].title_i18n`}
                  className="text-bk-h3 font-bold text-balance"
                  style={{
                    color: "var(--bk-ink, #1a1a1a)",
                    fontFamily: "var(--bk-font-display, inherit)",
                  }}
                >
                  {itemTitle}
                </h3>
                <p
                  data-i18n-field={`items[${i}].body_i18n`}
                  className="font-body text-sm leading-relaxed text-pretty"
                  style={{
                    color: "var(--bk-ink-soft, rgb(26 26 26 / 0.6))",
                    fontFamily: "var(--bk-font-body, inherit)",
                  }}
                >
                  {body}
                </p>
              </div>
            );
          })}
        </div>
        )}
      </div>
    </Section>
  );
}

const definition: SectionDefinition<Props> = {
  type: "pillars_grid",
  category: "content",
  name: { en: "Pillars grid", ar: "شبكة الركائز" },
  description: {
    en: "Centered eyebrow chip + title above icon-image pillar cards (why-us grid).",
    ar: "عنوان مركزي مع شارة صغيرة فوق بطاقات ركائز بأيقونات (لماذا نحن).",
  },
  thumbnail: "/sections/pillars_grid.svg",
  valid_on: ["home", "about", "product"],
  schema,
  defaultProps,
  render: PillarsGridRender,
};

registerSection(definition);
export default definition;
