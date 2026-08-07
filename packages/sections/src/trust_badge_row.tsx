// =====================================================================
// Section — trust_badge_row
// =====================================================================
// Static, evenly-spaced row of trust badges sitting on a full-width
// band (plain surface or accent-tinted). Each badge is an icon image
// (~40px) + a short semibold label. Unlike `trust_strip` (scrollable
// candy pills) this row is static: it spreads across the band on
// desktop and wraps into a 2×2 grid on mobile. Icons are merchant
// images (SVG/PNG URLs), not Material Symbols — everything is driven
// by `--bk-*` brand-kit tokens.
// =====================================================================

import { z } from "zod";
import { resolveI18n } from "@scheniders/shared";
import { Section } from "./helpers/primitives";
import { i18nStringSchema, urlString } from "./_schema";
import { registerSection } from "./_registry";
import type { SectionDefinition, SectionRenderContext } from "./_types";

const schema = z.object({
  items: z
    .array(
      z.object({
        icon_url: urlString.describe("image"),
        label_i18n: i18nStringSchema,
      }),
    )
    .min(2)
    .max(6),
  /** "tinted" lays the band on the brand accent at 12% opacity. */
  band_style: z.enum(["plain", "tinted"]).optional(),
});

type Props = z.infer<typeof schema>;

const defaultProps: Props = {
  band_style: "plain",
  items: [
    {
      icon_url: "",
      label_i18n: { en: "Fast delivery", ar: "توصيل سريع" },
    },
    {
      icon_url: "",
      label_i18n: { en: "Quality guarantee", ar: "ضمان الجودة" },
    },
    {
      icon_url: "",
      label_i18n: { en: "Available across Iraq", ar: "متوفر بالعراق" },
    },
    {
      icon_url: "",
      label_i18n: { en: "Cash on delivery", ar: "الدفع عند الاستلام" },
    },
  ],
};

function TrustBadgeRowRender({
  props,
  ctx,
}: {
  props: Props;
  ctx: SectionRenderContext;
}) {
  const locale = ctx.runtime.locale;
  if (props.items.length === 0) return null;

  const tinted = props.band_style === "tinted";

  return (
    <Section
      density="dense"
      bleed
      className="text-bk-ink"
      style={
        tinted
          ? {
              backgroundColor:
                "color-mix(in srgb, var(--bk-accent, #ffd84a) 12%, transparent)",
            }
          : undefined
      }
    >
      <div className="mx-auto max-w-6xl px-4">
        <div className="grid grid-cols-2 gap-x-4 gap-y-5 sm:flex sm:flex-wrap sm:items-center sm:justify-evenly sm:gap-6">
          {props.items.map((item, i) => {
            const label = resolveI18n(item.label_i18n, locale);
            return (
              <div
                key={`${i}-${label}`}
                className="flex items-center justify-center gap-3"
              >
                {item.icon_url ? (
                  /* eslint-disable-next-line @next/next/no-img-element -- merchant-supplied icon URLs (usually SVG) aren't next/image remote-pattern candidates */
                  <img
                    src={item.icon_url}
                    alt=""
                    loading="lazy"
                    className="h-10 w-10 shrink-0 object-contain"
                  />
                ) : (
                  /* Empty icon slot (editor placeholder) — keep the layout. */
                  <span
                    aria-hidden="true"
                    className="h-10 w-10 shrink-0 rounded-full"
                    style={{
                      backgroundColor:
                        "color-mix(in srgb, var(--bk-accent, #ffd84a) 24%, transparent)",
                    }}
                  />
                )}
                <span
                  data-i18n-field={`items[${i}].label_i18n`}
                  className="font-body text-sm font-semibold sm:text-base"
                  style={{
                    color: "var(--bk-ink, #1a1a1a)",
                    fontFamily: "var(--bk-font-body, inherit)",
                  }}
                >
                  {label}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </Section>
  );
}

const definition: SectionDefinition<Props> = {
  type: "trust_badge_row",
  category: "trust",
  name: { en: "Trust badge row", ar: "صف شارات الثقة" },
  description: {
    en: "Static evenly-spaced row of icon + label trust badges (2×2 on mobile).",
    ar: "صف ثابت موزع بالتساوي من شارات الثقة (أيقونة + عنوان).",
  },
  thumbnail: "/sections/trust_badge_row.svg",
  valid_on: ["home", "category", "product", "cart", "about", "checkout_success"],
  schema,
  defaultProps,
  render: TrustBadgeRowRender,
};

registerSection(definition);
export default definition;
