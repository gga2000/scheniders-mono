// =====================================================================
// Section — pdp_variants
// =====================================================================
// Variant selector for the PDP (size / colour / generic options). The
// section reads variants from `ctx.product.variants` when present and
// degrades to null when the product has no variant set. Three layouts
// are supported: chunky buttons (default), colour swatches, or a
// dropdown — picked via the `layout` prop in the editor.
// =====================================================================

import { z } from "zod";
import { registerSection } from "./_registry";
import type { SectionDefinition } from "./_types";
import { PdpVariantsRender } from "./pdp_variants.client";

const schema = z.object({
  layout: z.enum(["buttons", "swatches", "dropdown"]),
  show_oos: z.boolean(),
});

export type Props = z.infer<typeof schema>;

const defaultProps: Props = {
  layout: "buttons",
  show_oos: true,
};

const definition: SectionDefinition<Props> = {
  type: "pdp_variants",
  category: "page",
  name: { en: "Variant picker", ar: "اختيار الخيار" },
  description: {
    en: "Variant selector (size, colour, etc.) with three layouts.",
    ar: "اختيار خيار المنتج (مقاس، لون، إلخ) بثلاث طرق عرض.",
  },
  thumbnail: "/sections/pdp_variants.svg",
  valid_on: ["product"],
  schema,
  defaultProps,
  render: PdpVariantsRender,
};

registerSection(definition);
export default definition;
