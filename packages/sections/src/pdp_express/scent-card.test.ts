// The «بصمة العطر» card's data (spec §1.4, §1.10 "scent-card"): photo
// pairing 5/5 on Wayfarer's live note cards, emoji stripping,
// `product_copy` beating the attribute and the description, no data →
// null, meters only from entered values, and the customer clause — the
// rule's own pick and the merchant's pick — on the six live reviews.

import { describe, expect, it } from "vitest";
import { resolveProductAttributes } from "@scheniders/shared";
import { plainProduct, saleProduct } from "../_pdp-fixtures";
import { SCENT_DEF_IDS, SCENT_DEFS, scentProduct } from "../_pdp-scent-fixtures";
import { WAYFER_DESCRIPTION, WAYFER_ID, wayferProduct } from "../_pdp-wayfer-fixtures";
import type { Product } from "../types";
import { buildScentCard, monogramOf, stripLeadingEmoji, type ScentCardConfig } from "./scent-card";

const CONFIG: ScentCardConfig = {
  pyramid_key: "notes",
  chip_keys: ["season", "occasions"],
  note_key: "longevity_note",
  meter_keys: ["longevity", "sillage"],
  lead_key: "scent_lead",
  quote_terms: ["ثبات", "يثبت", "تفوح", "يفوح"],
  facts_source_i18n: { ar: "حسب تجربتنا", en: "Our own estimate" },
};

const IMG =
  "https://sduvpgqwhxragxtxztur.supabase.co/storage/v1/object/public/tenant-assets/store-templates/scheniders/note-cards/d988d98ad981-";

function card(product: Product, config: ScentCardConfig = CONFIG, description = product.description ?? null) {
  return buildScentCard({ product, config, locale: "ar", description });
}

describe("stripLeadingEmoji / monogramOf", () => {
  it.each([
    ["🫐 التوت البري الفاخر", "التوت البري الفاخر"],
    ["🛡️المندوب", "المندوب"],
    ["الهيل الملكي", "الهيل الملكي"],
  ])("%s → %s", (title, expected) => {
    expect(stripLeadingEmoji(title)).toBe(expected);
  });

  it.each([
    ["eng. سيف", "س"],
    ["مصطفى علي", "م"],
    ["Ahmed", "A"],
    ["  ", ""],
  ])("monogram of %j → %j", (name, expected) => {
    expect(monogramOf(name)).toBe(expected);
  });
});

describe("note photos", () => {
  it("pairs all 5 Wayfarer notes with 5 different photos", () => {
    const c = card(wayferProduct);
    expect(c?.tiers.map((t) => [t.key, t.label, t.hint])).toEqual([
      ["top", "المقدمة", "أول ما ترشه"],
      ["heart", "القلب", "بعد ما يهدى"],
      ["base", "القاعدة", "اللي يبقى عليك"],
    ]);
    expect(c?.tiers.flatMap((t) => t.notes)).toEqual([
      { name: "التوت الفاخر", image: `${IMG}0.jpg` },
      { name: "التفاح الأخضر", image: `${IMG}4.jpg` },
      { name: "الهيل", image: `${IMG}1.jpg` },
      { name: "اللافندر", image: `${IMG}2.jpg` },
      { name: "الباتشولي الساحر", image: `${IMG}3.jpg` },
    ]);
  });

  it("a note without a photo card stays a text chip", () => {
    const notes = card(scentProduct)?.tiers.flatMap((t) => t.notes);
    expect(notes?.filter((n) => n.image !== null)).toEqual([
      { name: "الليمون", image: "https://cdn.example.com/fixture/lemon.jpg" },
      { name: "جوز الهند", image: "https://cdn.example.com/fixture/coconut.jpg" },
    ]);
    // «الفانيليا» has a card, but the card has no photo.
    expect(notes?.find((n) => n.name === "الفانيليا")?.image).toBeNull();
  });

  it("uses each photo once and pairs whole words only", () => {
    const product: Product = {
      ...wayferProduct,
      attributes: resolveProductAttributes(SCENT_DEFS, [
        {
          product_id: WAYFER_ID,
          attribute_def_id: SCENT_DEF_IDS.notes,
          value: { top: ["التوت", "التوت"], base: ["الباتشولي الساحرة"] },
        },
      ]),
    };
    expect(card(product)?.tiers.flatMap((t) => t.notes)).toEqual([
      { name: "التوت", image: `${IMG}0.jpg` },
      { name: "التوت", image: null },
      { name: "الباتشولي الساحرة", image: null },
    ]);
  });

  it("gives the photo to the more specific note even when it comes later", () => {
    const product: Product = {
      ...wayferProduct,
      attributes: resolveProductAttributes(SCENT_DEFS, [
        {
          product_id: WAYFER_ID,
          attribute_def_id: SCENT_DEF_IDS.notes,
          value: { top: ["التوت"], heart: ["التوت الفاخر"] },
        },
      ]),
    };
    expect(card(product)?.tiers.flatMap((t) => t.notes)).toEqual([
      { name: "التوت", image: null },
      { name: "التوت الفاخر", image: `${IMG}0.jpg` },
    ]);
  });
});

describe("lead and story", () => {
  const copy: ScentCardConfig["product_copy"] = [
    { product_id: WAYFER_ID, lead_i18n: { ar: "سطر من المسودة" }, story_i18n: { ar: "فقرة أولى\n\nفقرة\nثانية" } },
  ];
  const withLead: Product = {
    ...wayferProduct,
    attributes: [
      ...(wayferProduct.attributes ?? []),
      {
        kind: "text",
        def: {
          id: "d0000000-0000-4000-8000-000000000009",
          key: "scent_lead",
          kind: "text",
          name_i18n: { ar: "الريحة بسطر" },
          is_filterable: false,
          is_comparable: false,
          display_order: 7,
        },
        value: { ar: "سطر من الصفة" },
      },
    ],
  };

  it("product_copy beats the attribute and the description", () => {
    const c = card(withLead, { ...CONFIG, product_copy: copy });
    expect(c?.lead).toBe("سطر من المسودة");
    expect(c?.story).toEqual(["فقرة أولى", "فقرة\nثانية"]);
  });

  it("without product_copy: the lead attribute, and the description verbatim", () => {
    const c = card(withLead);
    expect(c?.lead).toBe("سطر من الصفة");
    expect(c?.story.join("\n\n")).toBe(WAYFER_DESCRIPTION.split(/\n\s*\n/).map((p) => p.trim()).join("\n\n"));
  });

  it("another product's copy is not used", () => {
    const c = card(saleProduct, { ...CONFIG, product_copy: copy });
    expect(c?.lead).toBe("");
    expect(c?.story).toEqual(["عطر خشبي دافئ.\nيدوم طول اليوم."]);
  });

  it("the story cards drop the emoji and keep the body", () => {
    expect(card(wayferProduct)?.storyCards[0]).toEqual({
      image: `${IMG}0.jpg`,
      title: "التوت البري الفاخر",
      body: "منطي العطر نكهة فاكهية اكثر من فخمة. رائحة التوت راح تخلي اي شخص يشم بيك هلعطر يسألك شنو اسمه",
    });
  });

  it("no tiers, facts, lead or story → null", () => {
    expect(card(plainProduct)).toBeNull();
    expect(card(saleProduct, CONFIG, null)?.story).toEqual([]);
    expect(card({ ...saleProduct, feature_cards: [] }, CONFIG, null)).toBeNull();
  });
});

describe("facts", () => {
  it("meters only from entered range values, with the source tag", () => {
    const c = card(scentProduct);
    expect(c?.meters).toEqual([
      { key: "longevity", label: "الثبات", value: 4, max: 5, segments: 5, filled: 4 },
    ]);
    expect(c?.factsSource).toBe("حسب تجربتنا");
    expect(c?.chipRows.map((r) => r.key)).toEqual(["season", "occasions"]);
    expect(c?.note?.text).toBe("ثبات ممتاز وفوحان قوي.");
  });

  it("Wayfarer today: no meters, no chips, no note, no source tag", () => {
    const c = card(wayferProduct);
    expect(c?.meters).toEqual([]);
    expect(c?.factsSource).toBe("");
    expect(c?.chipRows).toEqual([]);
    expect(c?.note).toBeNull();
  });
});

describe("customer clause (six live Wayfarer reviews)", () => {
  it("the rule's own pick: مصطفى علي, verbatim", () => {
    expect(card(wayferProduct)?.quote).toEqual({
      reviewId: "b4f6b842-2e63-465b-8d11-3dc15039ed68",
      text: "العطر صدمني بثباته اهنيكم ع هيج شغل",
      author: "مصطفى علي",
      rating: 5,
    });
  });

  it("the merchant's pick wins while it is a verbatim part of a 4★+ review", () => {
    const quote_picks = [
      {
        product_id: WAYFER_ID,
        review_id: "6881921e-d263-4780-8878-762e01904146",
        text: "بخيت منه الصبح لسه الريحة تفوح",
      },
    ];
    expect(card(wayferProduct, { ...CONFIG, quote_picks })?.quote).toEqual({
      reviewId: "6881921e-d263-4780-8878-762e01904146",
      text: "بخيت منه الصبح لسه الريحة تفوح",
      author: "eng. سيف",
      rating: 5,
    });
  });

  it.each([
    ["text not in the review", "6881921e-d263-4780-8878-762e01904146", "يثبت يومين كاملة على الملابس"],
    ["a 3★ review", "cd25b071-10d9-4de5-a324-ea6a0793559b", "ثباته يطول يوم كامل على الملابس"],
    ["an unknown review", "00000000-0000-4000-8000-000000000000", "بخيت منه الصبح لسه الريحة تفوح"],
  ])("a stale pick (%s) falls back to the rule", (_label, review_id, text) => {
    const c = card(wayferProduct, { ...CONFIG, quote_picks: [{ product_id: WAYFER_ID, review_id, text }] });
    expect(c?.quote?.author).toBe("مصطفى علي");
  });

  it("no quote terms and no pick → no quote", () => {
    expect(card(wayferProduct, { ...CONFIG, quote_terms: undefined })?.quote).toBeNull();
  });
});
