// =====================================================================
// Section — product_bundles ("frequently bought together")
// =====================================================================
// PDP AOV upsell: shows bundles that include the current product, with the
// combined price, the bundle saving, and an "add all to cart" button. Pricing
// uses the shared bundle engine; the server re-resolves + records the saving at
// checkout, so this is a faithful preview, never the source of truth.
// =====================================================================

import { z } from "zod";
import { i18nStringOptional } from "./_schema";
import { registerSection } from "./_registry";
import type { SectionDefinition } from "./_types";
import { ProductBundlesRender } from "./product_bundles.client";

const schema = z.object({ heading_i18n: i18nStringOptional });
export type Props = z.infer<typeof schema>;

const defaultProps: Props = {
  heading_i18n: { en: "Frequently bought together", ar: "يُشترى عادةً معًا" },
};

const definition: SectionDefinition<Props> = {
  type: "product_bundles",
  category: "conversion",
  name: { en: "Frequently bought together", ar: "يُشترى عادةً معًا" },
  description: {
    en: "Bundle the current product with others at a discount; add all to cart.",
    ar: "اجمع المنتج الحالي مع غيره بسعر مخفّض؛ أضف الكل إلى السلة.",
  },
  thumbnail: "/sections/product_bundles.svg",
  valid_on: ["product"],
  schema,
  defaultProps,
  render: ProductBundlesRender,
};

registerSection(definition);
export default definition;
