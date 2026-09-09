// =====================================================================
// Section — delivery_promise
// =====================================================================
// Per-governorate delivery promise card. Surfaces Baghdad lead time,
// provinces lead time, the set of covered governorates, and an optional
// "free inspection on delivery" line. Highlights the visitor's own
// governorate (from `ctx.runtime.governorate`) when known.
// =====================================================================

import type { CSSProperties } from "react";
import { z } from "zod";
import {
  IRAQ_GOVERNORATES,
  etaForGovernorate,
  formatHours,
  governorateLabel,
  resolveI18n,
  type GovernorateCode,
  type StoreConfigV2,
} from "@scheniders/shared";
import {
  BentoCard,
  MaterialIcon,
  ScribbleHeading,
  Section,
  Sticker,
} from "./helpers/primitives";
import { i18nStringSchema, i18nStringOptional } from "./_schema";
import { registerSection } from "./_registry";
import type { SectionDefinition } from "./_types";

const schema = z.object({
  heading_i18n: i18nStringSchema,
  baghdad_hours: z.number().int().positive(),
  provinces_hours: z.number().int().positive(),
  governorates_covered: z.array(z.string()),
  inspection_text_i18n: i18nStringOptional,
});

type Props = z.infer<typeof schema>;

const defaultProps: Props = {
  heading_i18n: { en: "Delivery promise", ar: "وعد التوصيل" },
  baghdad_hours: 6,
  provinces_hours: 48,
  governorates_covered: [
    "Baghdad",
    "Basra",
    "Erbil",
    "Sulaymaniyah",
    "Duhok",
    "Najaf",
    "Karbala",
    "Babil",
    "Anbar",
    "Ninawa",
    "Kirkuk",
    "Diwaniyah",
    "Wasit",
    "Maysan",
    "Dhi Qar",
    "Muthanna",
    "Saladin",
    "Diyala",
  ],
  inspection_text_i18n: {
    en: "Free inspection on delivery — pay only if you're happy.",
    ar: "فحص مجاني عند الاستلام — لا تدفع إلا إذا أعجبتك القطعة.",
  },
};

function DeliveryPromise({
  props,
  ctx,
}: {
  props: Props;
  ctx: import("./_types").SectionRenderContext;
}) {
  const locale = ctx.runtime.locale;
  const heading = resolveI18n(props.heading_i18n, locale);
  const inspection = resolveI18n(props.inspection_text_i18n, locale);

  // The merchant's shipping config is the truth when it carries one. The
  // section's own hours and list are the fallback for tenants who never set
  // it — never the other way round, or a merchant who sets a 12h Baghdad ETA
  // would keep seeing the 6h this file shipped with.
  const shipping = (
    ctx.tenant as { store_config_v2?: Pick<StoreConfigV2, "commerce"> | null } | undefined
  )?.store_config_v2?.commerce?.shipping;
  const baghdadHours = etaForGovernorate(shipping, "BG") ?? props.baghdad_hours;
  const provincesHours = (() => {
    if (!shipping) return props.provinces_hours;
    const others = (Object.keys(shipping.rates ?? {}) as GovernorateCode[])
      .filter((c) => c !== "BG")
      .map((c) => etaForGovernorate(shipping, c))
      .filter((h): h is number => h !== null);
    const fallback = etaForGovernorate(shipping, null);
    const pool = others.length ? others : fallback !== null ? [fallback] : [];
    return pool.length ? Math.max(...pool) : props.provinces_hours;
  })();
  // Coverage: with a default rate every governorate is served; with only
  // overrides, exactly those; with no config, whatever the section says.
  const covered: string[] = shipping
    ? shipping.default_rate
      ? IRAQ_GOVERNORATES.map((g) => governorateLabel(g.code, locale))
      : (Object.keys(shipping.rates ?? {}) as GovernorateCode[]).map((c) => governorateLabel(c, locale))
    : props.governorates_covered;

  const visitorGov = ctx.runtime.governorate
    ? String(ctx.runtime.governorate)
    : undefined;
  const visitorIsBaghdad =
    visitorGov?.toLowerCase().includes("baghdad") ||
    visitorGov?.toLowerCase() === "bg";

  const statCardStyle: CSSProperties = {
    border: "var(--bk-border-thickness,3px) solid var(--bk-ink,#1a1a1a)",
    borderRadius: "var(--bk-radius-card,1rem)",
  };

  return (
    <Section>
      <BentoCard bg="mint" size="md" className="p-6 sm:p-8">
        <div data-i18n-field="heading_i18n">
          <ScribbleHeading color="pink" className="mb-5">
            {heading}
          </ScribbleHeading>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
          <div
            className={
              "relative bg-white p-5 shadow-bk-button " +
              (visitorIsBaghdad ? "ring-4 ring-bk-primary/40" : "")
            }
            style={statCardStyle}
          >
            {visitorIsBaghdad && (
              <div className="absolute -top-3 -right-3 animate-sticker-pop motion-reduce:animate-none">
                <Sticker bg="pink" rotate={6} size="xs">
                  {locale !== "en" ? "أنت هنا" : "You're here"}
                </Sticker>
              </div>
            )}
            <div className="flex items-center gap-2 mb-1">
              <MaterialIcon name="local_shipping" className="text-xl" />
              <span className="font-label font-bold text-xs uppercase tracking-[0.2em] text-bk-ink-soft">
                {locale !== "en" ? "بغداد" : "Baghdad"}
              </span>
            </div>
            <div className="font-display font-black text-3xl uppercase">
              {formatHours(baghdadHours, locale)}
            </div>
          </div>
          <div
            className={
              "relative bg-white p-5 shadow-bk-button " +
              (visitorGov && !visitorIsBaghdad ? "ring-4 ring-bk-primary/40" : "")
            }
            style={statCardStyle}
          >
            {visitorGov && !visitorIsBaghdad && (
              <div className="absolute -top-3 -right-3 animate-sticker-pop motion-reduce:animate-none">
                <Sticker bg="pink" rotate={6} size="xs">
                  {locale !== "en" ? "أنت هنا" : "You're here"}
                </Sticker>
              </div>
            )}
            <div className="flex items-center gap-2 mb-1">
              <MaterialIcon name="map" className="text-xl" />
              <span className="font-label font-bold text-xs uppercase tracking-[0.2em] text-bk-ink-soft">
                {locale !== "en" ? "بقية المحافظات" : "Other governorates"}
              </span>
            </div>
            <div className="font-display font-black text-3xl uppercase">
              {formatHours(provincesHours, locale)}
            </div>
          </div>
        </div>
        {covered.length > 0 && (
          <div className="mt-5">
            <p className="font-label font-bold text-xs uppercase tracking-[0.2em] text-bk-ink-soft mb-2">
              {locale !== "en" ? "نوصل إلى" : "We ship to"}
            </p>
            <div className="flex flex-wrap gap-2">
              {covered.map((g) => (
                <span
                  key={g}
                  className="inline-flex items-center font-label font-bold text-[11px] sm:text-xs uppercase tracking-[0.15em] bg-white border-bk border-bk-ink rounded-full px-3 py-1"
                >
                  {governorateLabel(g, locale)}
                </span>
              ))}
            </div>
          </div>
        )}
        {inspection && (
          <p
            data-i18n-field="inspection_text_i18n"
            className="mt-5 font-body text-sm sm:text-base text-bk-ink-soft inline-flex items-center gap-2"
          >
            <MaterialIcon name="verified" className="text-xl text-bk-primary" />
            {inspection}
          </p>
        )}
      </BentoCard>
    </Section>
  );
}

const definition: SectionDefinition<Props> = {
  type: "delivery_promise",
  category: "conversion",
  name: { en: "Delivery promise", ar: "وعد التوصيل" },
  description: {
    en: "Per-governorate delivery lead times with inspection-on-delivery callout.",
    ar: "أوقات توصيل لكل محافظة مع ميزة الفحص عند الاستلام.",
  },
  thumbnail: "/sections/delivery_promise.svg",
  valid_on: ["product", "cart", "home", "policy_shipping"],
  schema,
  defaultProps,
  render: DeliveryPromise,
};

registerSection(definition);
export default definition;
