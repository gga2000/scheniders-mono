// =====================================================================
// Section — pdp_info_tabs
// =====================================================================
// Tabbed content panel for the PDP. Default tabs are
// Description / Specs / Shipping / Returns, each with its own i18n rich
// body. Reads runtime.product so the Description tab can fall back to
// product.description when no override is set.
// =====================================================================

import { z } from "zod";
import { i18nStringSchema, i18nStringOptional } from "./_schema";
import { registerSection } from "./_registry";
import type { SectionDefinition } from "./_types";
import { PdpInfoTabsRender } from "./pdp_info_tabs.client";

const schema = z.object({
  tabs: z.array(
    z.object({
      key: z.string(),
      label_i18n: i18nStringSchema,
      body_i18n: i18nStringOptional,
    }),
  ),
});

export type Props = z.infer<typeof schema>;

const defaultProps: Props = {
  tabs: [
    {
      key: "description",
      label_i18n: { en: "Description", ar: "الوصف" },
      body_i18n: undefined,
    },
    {
      key: "specs",
      label_i18n: { en: "Specs", ar: "المواصفات" },
      body_i18n: {
        en: "Material, dimensions, and care details.",
        ar: "تفاصيل المواد والأبعاد والعناية.",
      },
    },
    {
      key: "shipping",
      label_i18n: { en: "Shipping", ar: "الشحن" },
      body_i18n: {
        en: "Same-day Baghdad. 1–3 days for other governorates.",
        ar: "نفس اليوم في بغداد، 1-3 أيام للمحافظات الأخرى.",
      },
    },
    {
      key: "returns",
      label_i18n: { en: "Returns", ar: "الإرجاع" },
      body_i18n: {
        en: "14-day free returns on unopened items.",
        ar: "إرجاع مجاني خلال 14 يوماً للمنتجات غير المفتوحة.",
      },
    },
  ],
};

const definition: SectionDefinition<Props> = {
  type: "pdp_info_tabs",
  category: "page",
  name: { en: "Info tabs", ar: "تبويبات المعلومات" },
  description: {
    en: "Tabbed Description / Specs / Shipping / Returns panel for PDP.",
    ar: "لوحة تبويبات الوصف والمواصفات والشحن والإرجاع لصفحة المنتج.",
  },
  thumbnail: "/sections/pdp_info_tabs.svg",
  valid_on: ["product"],
  schema,
  defaultProps,
  render: PdpInfoTabsRender,
};

registerSection(definition);
export default definition;
