import { describe, expect, it } from "vitest";
import { resolveProductAttributes } from "@scheniders/shared";
import { buildScentJourney, chipRowOf } from "./scent-journey";
import { SCENT_DEF_IDS, SCENT_DEFS, scentProduct } from "../_pdp-scent-fixtures";

const attrs = scentProduct.attributes;
const CONFIG = {
  pyramid_key: "notes",
  chip_keys: ["occasions", "season"],
  note_key: "longevity_note",
};

describe("buildScentJourney", () => {
  it("returns null when the product carries no attributes", () => {
    expect(buildScentJourney(undefined, CONFIG, "ar")).toBeNull();
    expect(buildScentJourney([], CONFIG, "ar")).toBeNull();
  });

  it("returns null when none of the configured keys carry a value", () => {
    expect(
      buildScentJourney(
        attrs,
        { pyramid_key: "missing", chip_keys: ["nope"], note_key: "absent" },
        "ar",
      ),
    ).toBeNull();
  });

  it("lists the pyramid's stages in the merchant's group order, with their own labels", () => {
    expect(buildScentJourney(attrs, CONFIG, "ar")?.stages).toEqual([
      { key: "top", label: "المقدمة", notes: ["الليمون", "الماندرين", "البرغموت"] },
      { key: "heart", label: "القلب", notes: ["التفاح", "الرقي", "الكراميل"] },
      { key: "base", label: "القاعدة", notes: ["الفانيليا", "جوز الهند"] },
    ]);
  });

  it("localises the stage labels", () => {
    expect(buildScentJourney(attrs, CONFIG, "en")?.stages.map((s) => s.label)).toEqual([
      "Top",
      "Heart",
      "Base",
    ]);
  });

  it("skips a stage the product leaves empty", () => {
    const partial = resolveProductAttributes(SCENT_DEFS, [
      {
        product_id: "p",
        attribute_def_id: SCENT_DEF_IDS.notes,
        value: { top: ["الليمون"], base: ["المسك"] },
      },
    ]);
    expect(buildScentJourney(partial, CONFIG, "ar")?.stages.map((s) => s.key)).toEqual([
      "top",
      "base",
    ]);
  });

  it("builds chip rows in the configured order: group_list gives every item, enum its option label", () => {
    expect(buildScentJourney(attrs, CONFIG, "ar")?.chipRows).toEqual([
      { key: "occasions", label: "شوكت ووين تحطه؟", chips: ["البحر", "السفرات", "الطلعات النهارية"] },
      { key: "season", label: "الموسم", chips: ["صيفي"] },
    ]);
  });

  it("never turns a numeric range into a stage, a chip or a line", () => {
    expect(
      buildScentJourney(
        attrs,
        { pyramid_key: "longevity", chip_keys: ["longevity"], note_key: "longevity" },
        "ar",
      ),
    ).toBeNull();
  });

  it("takes the staying-power line only from a text attribute", () => {
    expect(buildScentJourney(attrs, CONFIG, "ar")?.note).toEqual({
      label: "وصف الثبات",
      text: "ثبات ممتاز وفوحان قوي.",
    });
  });

  it("renders chips without a pyramid or a line", () => {
    const j = buildScentJourney(attrs, { pyramid_key: "missing", chip_keys: ["season"] }, "ar");
    expect(j?.stages).toEqual([]);
    expect(j?.chipRows).toHaveLength(1);
    expect(j?.note).toBeNull();
  });
});

describe("chipRowOf", () => {
  const byKey = (key: string) => {
    const attr = attrs?.find((a) => a.def.key === key);
    if (!attr) throw new Error(`fixture has no ${key}`);
    return attr;
  };

  it("makes one chip from an enum, with its localised label", () => {
    expect(chipRowOf(byKey("season"), "ar")).toEqual({ key: "season", label: "الموسم", chips: ["صيفي"] });
    expect(chipRowOf(byKey("season"), "en")).toEqual({ key: "season", label: "Season", chips: ["Summer"] });
  });

  it("flattens a group_list into one row", () => {
    expect(chipRowOf(byKey("occasions"), "ar")?.chips).toEqual(["البحر", "السفرات", "الطلعات النهارية"]);
  });

  it("returns null for a range or a text attribute", () => {
    expect(chipRowOf(byKey("longevity"), "ar")).toBeNull();
    expect(chipRowOf(byKey("longevity_note"), "ar")).toBeNull();
  });
});
