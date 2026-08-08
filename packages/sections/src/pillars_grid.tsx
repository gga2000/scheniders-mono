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
import { Section } from "./helpers/primitives";
import { i18nStringSchema, i18nStringOptional, urlString } from "./_schema";
import { registerSection } from "./_registry";
import type { SectionDefinition, SectionRenderContext } from "./_types";

const schema = z.object({
  eyebrow_i18n: i18nStringOptional,
  eyebrow_icon_url: urlString.describe("image").optional(),
  title_i18n: i18nStringSchema,
  items: z
    .array(
      z.object({
        icon_url: urlString.describe("image"),
        title_i18n: i18nStringSchema,
        body_i18n: i18nStringSchema,
      }),
    )
    .min(2)
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
        {/* Centered header: eyebrow chip + display title */}
        <div className="mb-bk-lg flex flex-col items-center gap-bk-sm text-center">
          {eyebrow && (
            <span
              data-i18n-field="eyebrow_i18n"
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold"
              style={{
                backgroundColor:
                  "color-mix(in srgb, var(--bk-accent, #ffd84a) 12%, transparent)",
                color: "var(--bk-ink, #1a1a1a)",
                fontFamily: "var(--bk-font-body, inherit)",
              }}
            >
              {props.eyebrow_icon_url && (
                /* eslint-disable-next-line @next/next/no-img-element -- merchant-supplied icon URLs (usually SVG) aren't next/image remote-pattern candidates */
                <img
                  src={props.eyebrow_icon_url}
                  alt=""
                  loading="lazy"
                  className="h-4 w-4 object-contain"
                />
              )}
              {eyebrow}
            </span>
          )}
          <h2
            data-i18n-field="title_i18n"
            className="text-3xl font-bold leading-tight tracking-tight sm:text-4xl"
            style={{
              color: "var(--bk-ink, #1a1a1a)",
              fontFamily: "var(--bk-font-display, inherit)",
            }}
          >
            {title}
          </h2>
        </div>

        {/* Pillar cards — 3-up desktop, 1-up mobile */}
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
                  className="text-lg font-bold leading-snug"
                  style={{
                    color: "var(--bk-ink, #1a1a1a)",
                    fontFamily: "var(--bk-font-display, inherit)",
                  }}
                >
                  {itemTitle}
                </h3>
                <p
                  data-i18n-field={`items[${i}].body_i18n`}
                  className="font-body text-sm leading-relaxed"
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
