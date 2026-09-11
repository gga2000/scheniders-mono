// =====================================================================
// Section — countdown_announcement
// =====================================================================
// Slim dark countdown bar for the promo_bar slot: flame glyph + short
// label + ticking HH:MM:SS digits in small rounded boxes with tiny unit
// labels beneath. Three modes:
//   - "daily_reset"       — evergreen; counts down to the next LOCAL
//     midnight and restarts every day (never expires).
//   - "fixed_end"         — counts down to an explicit ISO datetime,
//     clamping at 00:00:00 once it passes.
//   - "evergreen_minutes" — loops on a fixed wall-clock cycle.
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

export const barBg = z.enum(["secondary", "ink"]);
const modeSchema = z.enum(["daily_reset", "fixed_end", "evergreen_minutes"]);

const schema = z.object({
  label_i18n: i18nStringSchema,
  mode: modeSchema,
  /** ISO datetime the countdown targets — only read when mode is "fixed_end". */
  ends_at: z.string().describe("datetime").optional(),
  /** Loop length for "evergreen_minutes": the bar counts down this many
   *  minutes on a fixed wall-clock cycle (classic funnel urgency loop). */
  duration_minutes: z.number().int().min(1).max(1440).optional(),
  bg: barBg,
  show_flame: z.boolean(),
});

export type Props = z.infer<typeof schema>;

const defaultProps: Props = {
  label_i18n: {
    ar: "ينتهي عرض الخصم خلال:",
    en: "Discount offer ends in:",
  },
  mode: "daily_reset",
  bg: "secondary",
  show_flame: true,
};

const definition: SectionDefinition<Props> = {
  type: "countdown_announcement",
  category: "conversion",
  name: { en: "Countdown announcement", ar: "شريط عدّاد تنازلي" },
  description: {
    en: "Slim dark top bar with a live HH:MM:SS offer countdown (daily reset, fixed end, or evergreen loop).",
    ar: "شريط علوي داكن رفيع مع عدّاد تنازلي مباشر للعرض (يتجدد يومياً أو بتاريخ محدد أو دورة متكررة).",
  },
  thumbnail: "/sections/countdown_card.svg",
  valid_on: ["home", "category", "product", "cart", "checkout", "about", "faq"],
  schema,
  defaultProps,
  render: CountdownAnnouncement,
};

registerSection(definition);
export default definition;
