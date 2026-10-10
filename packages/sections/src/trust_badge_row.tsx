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

import type { CSSProperties } from "react";
import { z } from "zod";
import { resolveI18n } from "@scheniders/shared";
import { Section } from "./helpers/primitives";
import { i18nStringSchema, urlString } from "./_schema";
import { registerSection } from "./_registry";
import { cn } from "./helpers/utils";
import { formatCompactCount } from "./helpers/compact-count";
import type { SectionDefinition, SectionRenderContext } from "./_types";

const schema = z.object({
  items: z
    .array(
      z.object({
        icon_url: urlString.describe("image"),
        label_i18n: i18nStringSchema,
        /**
         * Turns the slot into a live proof figure. The label becomes the
         * unit under the number. Unset renders exactly as before — a
         * static icon + label, which is what the cart, product and
         * contact pages still want.
         */
        metric: z
          .enum(["completed_orders", "customers", "governorates"])
          .optional(),
      }),
    )
    // A merchant trimming to one badge must not lose the whole section.
    .min(1)
    .max(6),
  /**
   * "tinted" lays the band on the brand accent at 12% opacity.
   * "ledge" is the proof-strip treatment: a `--bk-surface-alt` band with
   * hairline dividers, so the row reads as one object the hero sits on
   * instead of four things adrift in white.
   */
  band_style: z.enum(["plain", "tinted", "ledge"]).optional(),
});

type Props = z.infer<typeof schema>;

/**
 * Defaults must never assert a merchant fact — see trust_strip for the full
 * reasoning. "Fast delivery" and "Quality guarantee" were claims this
 * package cannot know to be true for the store rendering them.
 */
const defaultProps: Props = {
  band_style: "plain",
  items: [
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

  const band = props.band_style ?? "plain";

  const stats = ctx.public_stats;
  const metricValue = (metric?: Props["items"][number]["metric"]) => {
    if (!metric || !stats) return null;
    if (metric === "completed_orders") return formatCompactCount(stats.completed_orders);
    if (metric === "customers") return formatCompactCount(stats.customers);
    return formatCompactCount(stats.governorates_served);
  };

  return (
    <Section
      density="dense"
      bleed
      className="text-bk-ink"
      style={
        band === "tinted"
          ? {
              backgroundColor:
                "color-mix(in srgb, var(--bk-accent, #ffd84a) 12%, transparent)",
            }
          : band === "ledge"
            ? { backgroundColor: "var(--bk-surface-alt, #f8efdf)" }
            : undefined
      }
    >
      {/* Gutter OUTSIDE the measure, the way `Section` does it — with
          `px-4` inside `max-w-6xl` this row came out 1120px wide against
          every other section's 1152, so nothing on the page lined up. */}
      <div className="px-4">
        <div className="mx-auto max-w-6xl">
        <div
          className={cn(
            "grid grid-cols-2 gap-x-4 gap-y-5 sm:flex sm:flex-wrap sm:items-center sm:justify-evenly sm:gap-6",
            band === "ledge" &&
              "sm:divide-x sm:[&>*]:px-6 sm:[&>*:first-child]:ps-0 sm:[&>*:last-child]:pe-0",
          )}
          style={
            band === "ledge"
              ? ({ "--tw-divide-opacity": "1", borderColor: "var(--bk-divider)" } as CSSProperties)
              : undefined
          }
        >
          {props.items.map((item, i) => {
            const label = resolveI18n(item.label_i18n, locale);
            const figure = metricValue(item.metric);
            // A declared metric with no figure has nothing true to say.
            // Dropping the slot beats rendering a bare unit or a zero.
            if (item.metric && figure === null) return null;

            if (figure !== null) {
              return (
                <div
                  key={`${i}-${label}`}
                  className="flex flex-col items-start justify-center"
                >
                  <span
                    className="font-display font-black text-bk-h3 leading-none"
                    style={{
                      color: "var(--bk-ink, #1a1a1a)",
                      fontFamily: "var(--bk-font-display, inherit)",
                    }}
                  >
                    <bdi>{figure}</bdi>
                  </span>
                  <span
                    data-i18n-field={`items[${i}].label_i18n`}
                    className="mt-1 font-body text-sm"
                    style={{
                      color: "var(--bk-ink-soft, rgba(26,26,26,0.7))",
                      fontFamily: "var(--bk-font-body, inherit)",
                    }}
                  >
                    {label}
                  </span>
                </div>
              );
            }

            return (
              <div
                key={`${i}-${label}`}
                // Start-aligned, not centred: in the 2x2 mobile grid each
                // cell centring its own content put the four discs at four
                // different x positions (38/222/34/207 at 390px), because
                // the labels differ in width. Repeated rows share an edge.
                className="flex items-center justify-start gap-3"
              >
                {/* Merchant icons arrive as unrelated SVGs — different
                    stroke weights, different optical sizes — so four of
                    them in a row read as clipart rather than a set. The
                    tinted disc is what makes them one object: identical
                    size, identical ground, whatever the artwork does. */}
                <span
                  aria-hidden="true"
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
                  style={{
                    backgroundColor:
                      "color-mix(in srgb, var(--bk-accent, #ffd84a) 14%, transparent)",
                  }}
                >
                  {item.icon_url && (
                    /* eslint-disable-next-line @next/next/no-img-element -- merchant-supplied icon URLs (usually SVG) aren't next/image remote-pattern candidates */
                    /* Eager: this row sits under the hero, above the fold. */
                    <img
                      src={item.icon_url}
                      alt=""
                      className="h-6 w-6 object-contain"
                    />
                  )}
                </span>
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
  valid_on: ["home", "category", "product", "cart", "about", "checkout_success", "contact"],
  schema,
  defaultProps,
  render: TrustBadgeRowRender,
};

registerSection(definition);
export default definition;
