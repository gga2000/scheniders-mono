// =====================================================================
// Section — trust_strip
// =====================================================================
// Horizontal, scrollable row of trust pills (e.g. "Cash on delivery",
// "Same-day Baghdad", "1-year warranty"). Each pill carries an optional
// Material Symbols icon name and a tint. Tints map onto brand-kit
// semantic tokens (not the Candy palette) so any kit renders the strip
// as its own; the legacy `bg` values are kept so stored configs parse.
// =====================================================================

import type { CSSProperties } from "react";
import { z } from "zod";
import { resolveI18n } from "@scheniders/shared";
import { Section, MaterialIcon } from "./helpers/primitives";
import { i18nStringSchema } from "./_schema";
import { registerSection } from "./_registry";
import type { SectionDefinition } from "./_types";

const pillBg = z.enum(["mint", "butter", "sky", "lilac", "pink"]);

type PillBg = z.infer<typeof pillBg>;

/**
 * Legacy Candy tint → semantic token. Soft `color-mix` tints (not solid
 * fills) keep ink text readable on every kit — a calm kit's `--bk-success`
 * is a dark green that would fail contrast under ink at full strength.
 */
const PILL_TINT: Record<PillBg, string> = {
  mint: "color-mix(in srgb, var(--bk-success, #7cf0bd) 18%, transparent)",
  butter: "color-mix(in srgb, var(--bk-accent, #ffd84a) 18%, transparent)",
  sky: "var(--bk-surface-alt, #f7f4ee)",
  lilac: "var(--bk-surface-alt, #f7f4ee)",
  pink: "color-mix(in srgb, var(--bk-primary, #ff5a8a) 14%, transparent)",
};

const schema = z.object({
  pills: z.array(
    z.object({
      label_i18n: i18nStringSchema,
      icon: z.string().optional(),
      bg: pillBg.optional(),
    }),
  ),
});

type Props = z.infer<typeof schema>;

/**
 * Defaults must never assert a merchant fact.
 *
 * These shipped as "Same-day Baghdad", "1-year warranty" and "Free returns"
 * — specific, checkable promises baked into a shared package. A merchant who
 * drops the section in without editing it publishes four commitments they
 * never made, and on a checkout page that is where a customer decides to
 * buy. One live store was doing exactly that.
 *
 * What is left is what the platform itself guarantees: the checkout is cash
 * on delivery, and the platform serves Iraq. Anything about speed, warranty
 * or the cost of a return is the merchant's to state, because only they know
 * whether it is true.
 */
const defaultProps: Props = {
  pills: [
    {
      label_i18n: { en: "Cash on delivery", ar: "الدفع عند الاستلام" },
      icon: "payments",
      bg: "mint",
    },
    {
      label_i18n: { en: "Delivery across Iraq", ar: "توصيل لكل المحافظات" },
      icon: "local_shipping",
      bg: "butter",
    },
  ],
};

function pillStyle(bg: PillBg): CSSProperties {
  return {
    backgroundColor: PILL_TINT[bg],
    color: "var(--bk-ink, #1a1a1a)",
    border: "var(--bk-border-thickness, 3px) solid var(--bk-ink, #1a1a1a)",
    borderRadius: "var(--bk-radius-pill, 9999px)",
    boxShadow: "var(--bk-shadow-button, 2px 2px 0px 0px #1a1a1a)",
  };
}

function TrustStripRender({
  props,
  ctx,
}: {
  props: Props;
  ctx: { runtime: { locale: "ar" | "en" | "ku" } };
}) {
  const locale = ctx.runtime.locale;
  return (
    <Section density="dense" bleed className="text-bk-ink">
      <div className="relative">
        <ul className="flex gap-3 overflow-x-auto px-4 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {props.pills.map((pill, i) => (
            // Pills are informational, not tappable — no press feedback.
            <li
              key={`${i}-${resolveI18n(pill.label_i18n, "en")}`}
              data-i18n-field={`pills[${i}].label_i18n`}
              className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap px-4 py-2 font-label text-xs font-bold bk-caps sm:text-sm"
              style={pillStyle(pill.bg ?? "mint")}
            >
              {pill.icon ? (
                <MaterialIcon name={pill.icon} className="text-base" />
              ) : null}
              {resolveI18n(pill.label_i18n, locale)}
            </li>
          ))}
        </ul>
        {/* Right-edge scroll-fade affordance — signals more pills to the right. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-0 w-8"
          style={{
            background:
              "linear-gradient(to right, transparent, var(--bk-surface, #fff7ed))",
          }}
        />
      </div>
    </Section>
  );
}

const def: SectionDefinition<Props> = {
  type: "trust_strip",
  category: "trust",
  name: { en: "Trust strip", ar: "شريط الثقة" },
  description: {
    en: "Horizontal scrolling row of trust badges (COD, delivery, warranty).",
    ar: "شريط أفقي قابل للتمرير من شارات الثقة.",
  },
  thumbnail: "/sections/trust_strip.svg",
  valid_on: ["home", "category", "product", "cart", "checkout"],
  schema,
  defaultProps,
  render: TrustStripRender,
};

registerSection(def);
export default def;
