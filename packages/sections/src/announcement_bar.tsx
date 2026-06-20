// =====================================================================
// Section — announcement_bar
// =====================================================================
// Slim top-of-page announcement marquee. Distinct from `marquee_strip`
// (a mid-page band with full section padding): this is the thin promo
// bar that sits flush at the very top of every storefront page, in the
// `promo_bar` global slot. Chunky ink bottom border, a horizontally
// scrolling list of short offer messages. It is the single most-present
// chrome element in the Candy Bento design — so it ships by DEFAULT for
// every tenant via DEFAULT_SLOT_SECTION (see storefront-globals).
// =====================================================================

import { z } from "zod";
import { resolveI18n } from "@scheniders/shared";
import { i18nStringSchema } from "./_schema";
import { registerSection } from "./_registry";
import type { SectionDefinition, SectionRenderContext } from "./_types";

const barBg = z.enum(["butter", "mint", "pink", "lilac", "sky", "ink"]);
const speedScale = z.enum(["slow", "normal", "fast"]);

const schema = z.object({
  messages_i18n: z.array(i18nStringSchema),
  bg: barBg,
  speed: speedScale,
});

type Props = z.infer<typeof schema>;

const defaultProps: Props = {
  messages_i18n: [
    { en: "Delivery in 24 hours", ar: "التوصيل خلال ٢٤ ساعة" },
    { en: "Cash on delivery", ar: "الدفع عند الاستلام" },
    { en: "15% off your first order", ar: "خصم ١٥٪ على أول طلب" },
  ],
  bg: "butter",
  speed: "normal",
};

/** Background reads the candy tokens (fixed mint/lilac/sky, themeable
 *  accent/primary/ink) so the bar stays on-palette per tenant. */
const BAR_BG: Record<z.infer<typeof barBg>, string> = {
  butter: "var(--bk-accent, #ffd84a)",
  mint: "var(--bk-mint, #7cf0bd)",
  pink: "var(--bk-primary, #ff5a8a)",
  lilac: "var(--bk-lilac, #c5b6ff)",
  sky: "var(--bk-sky, #9ad8ff)",
  ink: "var(--bk-ink, #1a1a1a)",
};

function AnnouncementBar({
  props,
  ctx,
}: {
  props: Props;
  ctx: SectionRenderContext;
}) {
  const locale = ctx.runtime.locale;
  const messages = props.messages_i18n
    .map((m) => resolveI18n(m, locale))
    .filter((m) => m.length > 0);

  if (!messages.length) return null;

  const durationSec =
    props.speed === "slow" ? 32 : props.speed === "fast" ? 14 : 20;
  // Pink and ink backgrounds want light text; the pastels stay on ink.
  const onDark = props.bg === "ink" || props.bg === "pink";

  // Render the message list twice so the translateX(-50%) marquee loop
  // (see tailwind keyframes.marquee) seams invisibly at any viewport width.
  const series = (
    <span className="inline-flex items-center">
      {messages.map((m, i) => (
        <span key={i} className="inline-flex items-center">
          <span className="font-label font-bold text-[11px] sm:text-xs uppercase tracking-[0.18em] px-4">
            {m}
          </span>
          <span aria-hidden="true" className="opacity-50 text-[10px]">
            ✦
          </span>
        </span>
      ))}
    </span>
  );

  return (
    <div
      className="overflow-hidden relative z-30 py-1.5"
      style={{
        backgroundColor: BAR_BG[props.bg],
        color: onDark ? "#ffffff" : "var(--bk-ink, #1a1a1a)",
        borderBottom:
          "var(--bk-border-thickness, 3px) solid var(--bk-ink, #1a1a1a)",
      }}
      role="region"
      aria-label={locale !== "en" ? "إعلان" : "Announcement"}
    >
      <div
        className="inline-flex whitespace-nowrap animate-marquee will-change-transform motion-reduce:animate-none"
        style={{ animationDuration: `${durationSec}s` }}
      >
        {series}
        {series}
      </div>
    </div>
  );
}

const definition: SectionDefinition<Props> = {
  type: "announcement_bar",
  category: "content",
  name: { en: "Announcement bar", ar: "شريط الإعلان" },
  description: {
    en: "Slim scrolling promo bar pinned at the top of every page.",
    ar: "شريط إعلاني متحرّك رفيع يظهر أعلى كل صفحة.",
  },
  thumbnail: "/sections/marquee_strip.svg",
  valid_on: ["home", "category", "product", "cart", "checkout", "about", "faq"],
  schema,
  defaultProps,
  render: AnnouncementBar,
};

registerSection(definition);
export default definition;
