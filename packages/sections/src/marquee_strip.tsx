// =====================================================================
// Section — marquee_strip
// =====================================================================
// Slim mid-page scrolling text strip. Distinct from `hero_marquee` —
// this one is a thin horizontal band suitable between sections, or
// stacked on top of the cart / checkout. Accepts multiple messages
// separated by a star glyph in the ticker.
// =====================================================================

import { z } from "zod";
import { resolveI18n } from "@scheniders/shared";
import { Section } from "./helpers/primitives";
import { i18nStringSchema } from "./_schema";
import { registerSection } from "./_registry";
import type { SectionDefinition } from "./_types";

const stripBg = z.enum([
  "white",
  "mint",
  "butter",
  "lilac",
  "sky",
  "pink",
  "cream",
]);

const speedScale = z.enum(["slow", "normal", "fast"]);

const schema = z.object({
  messages_i18n: z.array(i18nStringSchema),
  bg: stripBg,
  speed: speedScale,
});

type Props = z.infer<typeof schema>;

/**
 * Defaults must never assert a merchant fact — see trust_strip for the full
 * reasoning. "Free delivery in Baghdad" is a price the per-governorate
 * shipping engine decides, and "Same-day shipping" a speed this package
 * cannot know. A marquee repeats its messages endlessly, which makes a
 * false one louder than anywhere else on the page.
 */
const defaultProps: Props = {
  messages_i18n: [
    { en: "Cash on delivery", ar: "الدفع عند الاستلام" },
    { en: "Delivery across Iraq", ar: "توصيل لكل المحافظات" },
  ],
  bg: "butter",
  speed: "normal",
};

const BG_CLASS: Record<z.infer<typeof stripBg>, string> = {
  // Enum keys are schema values; "white" means the kit's card surface,
  // which is dark on a dark kit — so it pins ink, never literal white.
  white: "bg-bk-surface-alt text-bk-ink",
  mint: "bg-bk-secondary",
  butter: "bg-bk-accent",
  lilac: "bg-bk-decor-b",
  sky: "bg-bk-decor-c",
  pink: "bg-bk-primary text-bk-on-primary",
  cream: "bg-bk-surface",
};

function MarqueeStrip({
  props,
  ctx,
}: {
  props: Props;
  ctx: import("./_types").SectionRenderContext;
}) {
  const locale = ctx.runtime.locale;
  const messages = props.messages_i18n
    .map((m) => resolveI18n(m, locale))
    .filter((m) => m.length > 0);

  if (!messages.length) return null;

  const durationSec =
    props.speed === "slow" ? 36 : props.speed === "fast" ? 14 : 22;

  // Render the message list twice so the animation loop seam stays
  // invisible regardless of viewport width.
  const series = (
    <span className="inline-flex items-center gap-6 px-6">
      {messages.map((m, i) => (
        <span key={i} className="inline-flex items-center gap-6">
          <span className="font-label font-bold text-xs sm:text-sm uppercase tracking-[0.2em]">
            {m}
          </span>
          <span aria-hidden="true" className="text-bk-primary">
            ★
          </span>
        </span>
      ))}
    </span>
  );

  return (
    <Section
      bleed
      density="dense"
      className={`${BG_CLASS[props.bg]} border-y-[3px] border-bk-ink overflow-hidden`}
    >
      <div
        className="inline-flex whitespace-nowrap animate-marquee"
        style={{ animationDuration: `${durationSec}s` }}
      >
        {series}
        {series}
      </div>
    </Section>
  );
}

const definition: SectionDefinition<Props> = {
  type: "marquee_strip",
  category: "content",
  name: { en: "Marquee strip", ar: "شريط متحرّك" },
  description: {
    en: "Slim mid-page scrolling text band for offers and promises.",
    ar: "شريط نصي متحرك ضيق بين الأقسام للعروض والوعود.",
  },
  thumbnail: "/sections/marquee_strip.svg",
  valid_on: ["home", "cart", "checkout", "product"],
  schema,
  defaultProps,
  render: MarqueeStrip,
};

registerSection(definition);
export default definition;
