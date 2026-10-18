// =====================================================================
// Section — feature_grid
// =====================================================================
// 3- or 4-up grid of feature blocks: icon + title + body. Typical use
// is "Why us" on home or about pages. Icons reference Material
// Symbols names.
// =====================================================================

import { z } from "zod";
import { resolveI18n } from "@scheniders/shared";
import {
  BentoCard,
  MaterialIcon,
  Section,
  SectionHeader,
} from "./helpers/primitives";
import { i18nStringSchema, i18nStringOptional } from "./_schema";
import { registerSection } from "./_registry";
import type { SectionDefinition, SectionRenderContext } from "./_types";

const schema = z.object({
  heading_i18n: i18nStringOptional,
  items: z.array(
    z.object({
      icon: z.string(),
      title_i18n: i18nStringSchema,
      body_i18n: i18nStringSchema,
    }),
  ),
  columns: z.union([z.literal(2), z.literal(3), z.literal(4)]),
});

type Props = z.infer<typeof schema>;

/**
 * Defaults must never assert a merchant fact — see trust_strip for the full
 * reasoning. "Order before 4pm and we ship the same day" and "Every piece is
 * checked before it leaves the warehouse" are claims about an operation this
 * package knows nothing about.
 *
 * What survives is what the platform itself guarantees: the checkout is cash
 * on delivery, and it serves Iraq. A merchant fills the rest in with things
 * they can stand behind.
 */
const defaultProps: Props = {
  heading_i18n: { en: "Why shop with us", ar: "لماذا تتسوّق معنا" },
  columns: 3,
  items: [
    {
      icon: "payments",
      title_i18n: { en: "Cash on delivery", ar: "الدفع عند الاستلام" },
      body_i18n: {
        en: "Pay only after you've inspected the product.",
        ar: "ادفع بعد فحص المنتج فقط.",
      },
    },
    {
      icon: "local_shipping",
      title_i18n: { en: "Delivery across Iraq", ar: "توصيل لكل المحافظات" },
      body_i18n: { en: "", ar: "" },
    },
  ],
};

function FeatureGridRender({
  props,
  ctx,
}: {
  props: Props;
  ctx: SectionRenderContext;
}) {
  const locale = ctx.runtime.locale;
  const heading = resolveI18n(props.heading_i18n, locale);
  if (props.items.length === 0) return null;

  const colsClass =
    props.columns === 2
      ? "sm:grid-cols-2"
      : props.columns === 4
        ? "sm:grid-cols-2 lg:grid-cols-4"
        : "sm:grid-cols-2 lg:grid-cols-3";

  const tints = ["mint", "butter", "lilac", "sky"] as const;

  return (
    <Section>
      {heading && <SectionHeader title={heading} color="pink" />}
      <div className={`grid grid-cols-1 ${colsClass} gap-bk-md`}>
        {props.items.map((item, i) => {
          const title = resolveI18n(item.title_i18n, locale);
          const body = resolveI18n(item.body_i18n, locale);
          const tint = tints[i % tints.length];
          return (
            <BentoCard
              key={`${i}-${title}`}
              bg={tint}
              size="sm"
              rotate={i % 2 === 0 ? -0.5 : 0.5}
              className="p-5 sm:p-6"
            >
              <div className="w-12 h-12 rounded-bk-input border-bk border-bk-ink bg-white flex items-center justify-center mb-bk-sm">
                <MaterialIcon name={item.icon} className="text-2xl" />
              </div>
              <h3 className="font-display font-black text-lg uppercase leading-tight">
                {title}
              </h3>
              <p className="mt-bk-xs font-body text-sm text-bk-ink-soft leading-relaxed">
                {body}
              </p>
            </BentoCard>
          );
        })}
      </div>
    </Section>
  );
}

const definition: SectionDefinition<Props> = {
  type: "feature_grid",
  category: "content",
  name: { en: "Feature grid", ar: "شبكة ميزات" },
  description: {
    en: "3- or 4-up feature blocks with icon, title, and body copy.",
    ar: "كتل ميزات 3 أو 4 أعمدة مع أيقونة وعنوان ووصف.",
  },
  thumbnail: "/sections/feature_grid.svg",
  valid_on: ["home", "about", "product"],
  schema,
  defaultProps,
  render: FeatureGridRender,
};

registerSection(definition);
export default definition;
