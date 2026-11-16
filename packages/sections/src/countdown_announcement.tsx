// =====================================================================
// Section — countdown_announcement
// =====================================================================
// Slim dark countdown bar for the promo_bar slot: flame glyph + short
// label + ticking HH:MM:SS digits in small rounded boxes with tiny unit
// labels beneath. The clock counts to the end time the merchant set
// ("fixed_end"); once that passes, the bar is gone. Without a date it is a
// plain bar. "daily_reset" and "evergreen_minutes" restart on their own,
// so they draw no clock (helpers/countdown.ts) — a stored loop only with the
// explicit `evergreen_clock` opt-in.
// Hydration-safe: the server and the first client render both show
// "--" placeholders; the real clock only starts ticking after mount, so
// SSR and hydration always agree regardless of server/client timezone
// skew — and nobody sees a fake "00:00:00" before the first tick.
// =====================================================================

import { z } from "zod";
import { i18nStringSchema } from "./_schema";
import { registerSection } from "./_registry";
import type { SectionDefinition } from "./_types";
import { CountdownAnnouncement } from "./countdown_announcement.client";
import { COUNTDOWN_MODES } from "./helpers/countdown";

export const barBg = z.enum(["secondary", "ink"]);

const schema = z.object({
  label_i18n: i18nStringSchema,
  mode: z.enum(COUNTDOWN_MODES),
  /** ISO datetime the countdown targets — only read when mode is "fixed_end".
   *  No date, no clock. */
  ends_at: z.string().describe("datetime").optional(),
  /** Loop length of a stored "evergreen_minutes" clock. */
  duration_minutes: z.number().int().min(1).max(1440).optional(),
  bg: barBg,
  show_flame: z.boolean(),
  /** A stored "evergreen_minutes" clock draws only with this opt-in
   *  (a deadline that restarts for every visitor); absent = no clock. */
  evergreen_clock: z.boolean().optional().catch(undefined),
});

export type Props = z.infer<typeof schema>;

const defaultProps: Props = {
  label_i18n: {
    ar: "ينتهي عرض الخصم خلال:",
    en: "Discount offer ends in:",
  },
  // No clock until the merchant sets the offer's real end time.
  mode: "fixed_end",
  bg: "secondary",
  show_flame: true,
};

const definition: SectionDefinition<Props> = {
  type: "countdown_announcement",
  category: "conversion",
  name: { en: "Countdown announcement", ar: "شريط عدّاد تنازلي" },
  description: {
    en: "Slim dark top bar with a live HH:MM:SS countdown to the end time you set for an offer.",
    ar: "شريط علوي داكن رفيع مع عدّاد تنازلي مباشر حتى وقت انتهاء العرض الذي تحدده.",
  },
  thumbnail: "/sections/countdown_card.svg",
  valid_on: ["home", "category", "product", "cart", "checkout", "about", "faq"],
  schema,
  defaultProps,
  render: CountdownAnnouncement,
};

registerSection(definition);
export default definition;
