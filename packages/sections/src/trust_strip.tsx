// =====================================================================
// Section — trust_strip
// =====================================================================
// Horizontal, scrollable row of trust pills (e.g. "Cash on delivery",
// "Same-day Baghdad", "1-year warranty"). Each pill carries its own
// background colour + optional Material Symbols icon name.
// =====================================================================

import { z } from "zod";
import { resolveI18n } from "@scheniders/shared";
import {
  TrustPill,
  MaterialIcon,
} from "./helpers/primitives";
import { i18nStringSchema } from "./_schema";
import { registerSection } from "./_registry";
import type { SectionDefinition } from "./_types";

const pillBg = z.enum(["mint", "butter", "sky", "lilac", "pink"]);

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

const defaultProps: Props = {
  pills: [
    {
      label_i18n: { en: "Cash on delivery", ar: "الدفع عند الاستلام" },
      icon: "payments",
      bg: "mint",
    },
    {
      label_i18n: { en: "Same-day Baghdad", ar: "توصيل بغداد بنفس اليوم" },
      icon: "local_shipping",
      bg: "butter",
    },
    {
      label_i18n: { en: "1-year warranty", ar: "ضمان سنة" },
      icon: "verified",
      bg: "sky",
    },
    {
      label_i18n: { en: "Free returns", ar: "إرجاع مجاني" },
      icon: "undo",
      bg: "lilac",
    },
  ],
};

function TrustStripRender({
  props,
  ctx,
}: {
  props: Props;
  ctx: { runtime: { locale: "ar" | "en" | "ku" } };
}) {
  const locale = ctx.runtime.locale;
  return (
    <section className="py-4">
      <div className="flex gap-3 overflow-x-auto px-4 scrollbar-none [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {props.pills.map((pill, i) => (
          <span
            key={`${i}-${resolveI18n(pill.label_i18n, "en")}`}
            data-i18n-field={`pills[${i}].label_i18n`}
            className="inline-flex"
          >
            <TrustPill
              bg={pill.bg ?? "mint"}
              rotate={i % 2 === 0 ? -1 : 1}
              icon={
                pill.icon ? (
                  <MaterialIcon name={pill.icon} className="text-base" />
                ) : undefined
              }
            >
              {resolveI18n(pill.label_i18n, locale)}
            </TrustPill>
          </span>
        ))}
      </div>
    </section>
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
