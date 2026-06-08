// =====================================================================
// Section — pdp_info_block
// =====================================================================
// PDP info header: product name + price + rating + sale badge + SKU
// + optional stock-urgency line.
// =====================================================================

import { z } from "zod";
import { resolveI18n } from "@scheniders/shared";
import {
  ScribbleHeading,
  Section,
  Sticker,
  MaterialIcon,
} from "./helpers/primitives";
import { formatPrice, formatSavings } from "./helpers/format";
import { i18nStringOptional } from "./_schema";
import { registerSection } from "./_registry";
import type { SectionDefinition, SectionRenderContext } from "./_types";

const schema = z.object({
  show_stock_urgency: z.boolean(),
  show_5_star_rating: z.boolean(),
  show_sku: z.boolean(),
  sale_sticker_label_i18n: i18nStringOptional,
});

type Props = z.infer<typeof schema>;

const defaultProps: Props = {
  show_stock_urgency: true,
  show_5_star_rating: true,
  show_sku: false,
  sale_sticker_label_i18n: { en: "On sale", ar: "تخفيض" },
};

function PdpInfoBlockRender({
  props,
  ctx,
}: {
  props: Props;
  ctx: SectionRenderContext;
}) {
  const product = ctx.product;
  if (!product) return null;
  const locale = ctx.runtime.locale;
  const saleLabel = resolveI18n(props.sale_sticker_label_i18n, locale);

  const onSale =
    product.compare_at_price != null && product.compare_at_price > product.price;
  const savings = onSale
    ? formatSavings(product.compare_at_price ?? 0, product.price)
    : null;

  // Stock urgency uses BaseProduct's stock_quantity / reserved_quantity.
  const available = Math.max(
    0,
    (product.stock_quantity ?? 0) - (product.reserved_quantity ?? 0),
  );
  const lowStock = available > 0 && available <= 5 ? available : null;

  return (
    <Section>
      <div className="space-y-bk-sm">
        <div className="flex items-start gap-bk-sm flex-wrap">
          <ScribbleHeading color="pink" as="h1" className="flex-1 min-w-0">
            {product.name}
          </ScribbleHeading>
          {onSale && (
            <Sticker bg="pink" rotate={-4} size="md">
              {saleLabel}
            </Sticker>
          )}
        </div>
        {props.show_5_star_rating && (
          <div
            className="flex items-center gap-1 text-bk-primary"
            aria-label="5 star rating"
          >
            {[0, 1, 2, 3, 4].map((i) => (
              <MaterialIcon key={i} name="star" className="text-xl" />
            ))}
            <span className="ml-1 font-label font-bold text-xs uppercase tracking-[0.2em] text-bk-ink-soft">
              {locale === "ar" ? "5.0 من 5" : "5.0 / 5"}
            </span>
          </div>
        )}
        <div className="flex items-baseline gap-bk-sm flex-wrap">
          <span className="font-display font-black text-3xl sm:text-4xl text-bk-ink">
            {formatPrice(product.price)}
          </span>
          {onSale && product.compare_at_price != null && (
            <span className="font-body text-lg text-bk-ink-faint line-through">
              {formatPrice(product.compare_at_price)}
            </span>
          )}
          {savings && (
            <span className="font-label font-bold text-xs uppercase tracking-[0.2em] text-bk-primary">
              {locale === "ar"
                ? `وفّر ${savings}`
                : `Save ${savings}`}
            </span>
          )}
        </div>
        {props.show_stock_urgency && lowStock != null && (
          <p className="font-label font-bold text-sm uppercase tracking-[0.15em] text-bk-primary inline-flex items-center gap-bk-xs">
            <MaterialIcon name="local_fire_department" className="text-xl" />
            {locale === "ar"
              ? `بقي ${lowStock} فقط`
              : `Only ${lowStock} left`}
          </p>
        )}
        {props.show_sku && product.sku && (
          <p className="font-label text-xs uppercase tracking-[0.2em] text-bk-ink-soft">
            {locale === "ar" ? "الرمز" : "SKU"}: {product.sku}
          </p>
        )}
      </div>
    </Section>
  );
}

const definition: SectionDefinition<Props> = {
  type: "pdp_info_block",
  category: "page",
  name: { en: "Product info", ar: "تفاصيل المنتج" },
  description: {
    en: "Product name, price, rating, sale badge, and stock urgency.",
    ar: "اسم المنتج والسعر والتقييم وشارة التخفيض ومدى توفّر المخزون.",
  },
  thumbnail: "/sections/pdp_info_block.svg",
  valid_on: ["product"],
  schema,
  defaultProps,
  render: PdpInfoBlockRender,
};

registerSection(definition);
export default definition;
