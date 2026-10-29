// =====================================================================
// PDP redesign 1c — the scent card props parse safely
// =====================================================================
// `scent_layout` and `scent_card` are optional and `.catch(undefined)`-
// guarded: a bad or rolled-back stored value drops that prop (or, inside
// `scent_card`, only the bad list), never the buy box.
// =====================================================================

import { describe, expect, it } from "vitest";
import pdp_direct_order from "./pdp_direct_order";
import { EXPRESS_IRAQ_DRAFT_PDP_PROPS } from "./_pdp-fixtures";

const schema = pdp_direct_order.schema;

const WAYFER_ID = "5e847790-11a5-439f-bace-c315e0ff1ae8";

const CARD = {
  pyramid_key: "notes",
  chip_keys: ["season", "occasions"],
  note_key: "longevity_note",
  meter_keys: ["longevity", "sillage"],
  lead_key: "scent_lead",
  quote_terms: ["ثبات", "يثبت", "تفوح", "يفوح"],
  facts_source_i18n: { ar: "حسب تجربتنا", en: "Our own estimate" },
  quote_picks: [
    {
      product_id: WAYFER_ID,
      review_id: "6881921e-d263-4780-8878-762e01904146",
      text: "بخيت منه الصبح لسه الريحة تفوح",
    },
  ],
  product_copy: [
    { product_id: WAYFER_ID, lead_i18n: { ar: "سطر" }, story_i18n: { ar: "قصة" } },
  ],
};

describe("pdp_direct_order slice 1c props", () => {
  it("accepts the card config", () => {
    const parsed = schema.parse({
      ...EXPRESS_IRAQ_DRAFT_PDP_PROPS,
      scent_layout: "card",
      scent_card: CARD,
    });
    expect(parsed.scent_layout).toBe("card");
    expect(parsed.scent_card).toEqual(CARD);
  });

  it.each<[string, unknown]>([
    ["scent_layout", "pyramid"],
    ["scent_card", { chip_keys: ["season"] }],
    ["scent_card", "card"],
  ])("a bad %s (%j) falls back to absent and keeps the section", (key, value) => {
    const parsed = schema.safeParse({ ...EXPRESS_IRAQ_DRAFT_PDP_PROPS, [key]: value });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data[key as "scent_layout" | "scent_card"]).toBeUndefined();
      expect(parsed.data.layout).toBe("express");
    }
  });

  it.each<[string, unknown]>([
    ["product_copy", [{ product_id: "not-a-uuid", lead_i18n: { ar: "x" } }]],
    ["quote_picks", [{ product_id: WAYFER_ID, review_id: "", text: "قصير" }]],
    ["quote_picks", [{ product_id: WAYFER_ID, review_id: "r-1", text: "ab" }]],
  ])("a bad %s list drops only that list", (key, value) => {
    const parsed = schema.parse({
      ...EXPRESS_IRAQ_DRAFT_PDP_PROPS,
      scent_layout: "card",
      scent_card: { ...CARD, [key]: value },
    });
    expect(parsed.scent_card?.pyramid_key).toBe("notes");
    expect(parsed.scent_card?.[key as "product_copy" | "quote_picks"]).toBeUndefined();
  });
});
