// =====================================================================
// Section — countdown_card
// =====================================================================
// Standalone countdown timer card. No promo copy — just the heading and
// the big ticking digits. After the target ISO passes, swaps in an
// "expired" label (optional). Client component because the timer ticks
// every second in the browser.
// =====================================================================

import { z } from "zod";
import { i18nStringSchema, i18nStringOptional } from "./_schema";
import { registerSection } from "./_registry";
import type { SectionDefinition } from "./_types";
import { CountdownCard } from "./countdown_card.client";

const schema = z.object({
  heading_i18n: i18nStringSchema,
  target_iso: z.string().describe("datetime"),
  expired_label_i18n: i18nStringOptional,
});

export type Props = z.infer<typeof schema>;

const defaultProps: Props = {
  heading_i18n: { en: "Drop closes in", ar: "ينتهي العرض خلال" },
  target_iso: new Date(Date.now() + 1000 * 60 * 60 * 48).toISOString(),
  expired_label_i18n: { en: "This drop has closed.", ar: "انتهى هذا العرض." },
};

const definition: SectionDefinition<Props> = {
  type: "countdown_card",
  category: "conversion",
  name: { en: "Countdown card", ar: "بطاقة عدّاد تنازلي" },
  description: {
    en: "Standalone live countdown timer with optional expired label.",
    ar: "عدّاد تنازلي مباشر مستقل مع نص انتهاء اختياري.",
  },
  thumbnail: "/sections/countdown_card.svg",
  valid_on: ["home", "product", "cart"],
  schema,
  defaultProps,
  render: CountdownCard,
};

registerSection(definition);
export default definition;
