// =====================================================================
// PDP redesign 1d — image_gallery's stack props parse safely
// =====================================================================
// Every new prop is optional and `.catch`-guarded: a bad or rolled-back
// stored value drops only that prop (or that item field), never the
// section. `layout` now falls back to "grid" instead of dropping the
// section; every valid value parses as before.
// =====================================================================

import { describe, expect, it } from "vitest";
import image_gallery from "./image_gallery";

const schema = image_gallery.schema;

const SHOT = "https://sduvpgqwhxragxtxztur.supabase.co/storage/v1/object/public/tenant-assets/store-templates/scheniders/reviews/536e8d88-e55a-49f0-a9b3-305b69cbfbf5.jpeg";

const ITEM = {
  url: SHOT,
  alt_i18n: { ar: "تعليق" },
  quote_i18n: { ar: "اول مره يوصلني عطر ويطلع كلام الاعلان كله صحيح" },
  doubt_i18n: { ar: "خايف يطلع مثل كل إعلان؟" },
  author: "المحامي زياد طارق الحديدي",
  is_business: false,
  width: 828,
  height: 253,
  crop: { left: 12, right: 2 },
};

const STACK = {
  heading_i18n: { ar: "كلامهم مو كلامنا" },
  layout: "stack",
  initial_count: 3,
  source_label_i18n: { ar: "تعليقات على إعلاناتنا بتيك توك" },
  scope: "store",
  legend_i18n: { ar: "هاي العلامة يعني سوّينا لايك للتعليق من حسابنا" },
  legend_image_url: "https://cdn.example.com/logo.png",
  heading_style: "chapter",
  images: [ITEM],
};

describe("image_gallery slice 1d props", () => {
  it("accepts the stack config", () => {
    expect(schema.parse(STACK)).toEqual(STACK);
  });

  it("an unknown layout falls back to grid instead of dropping the section", () => {
    const parsed = schema.safeParse({ ...STACK, layout: "mosaic" });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.layout).toBe("grid");
  });

  it.each(["masonry", "grid", "carousel", "stack"] as const)("layout %s parses as itself", (layout) => {
    expect(schema.parse({ ...STACK, layout }).layout).toBe(layout);
  });

  it.each<[string, unknown]>([
    ["initial_count", 0],
    ["initial_count", 13],
    ["source_label_i18n", "TikTok"],
    ["scope", "everyone"],
    ["legend_i18n", 7],
    ["legend_image_url", 7],
    ["heading_style", "huge"],
  ])("a bad %s (%j) falls back to absent", (key, value) => {
    const parsed = schema.parse({ ...STACK, [key]: value });
    expect(parsed[key as keyof typeof parsed]).toBeUndefined();
    expect(parsed.layout).toBe("stack");
  });

  it.each<[string, unknown]>([
    ["quote_i18n", "plain"],
    ["doubt_i18n", ["x"]],
    ["author", "x".repeat(81)],
    ["is_business", "yes"],
    ["width", 0],
    ["height", 4001],
    ["crop", { left: 41, right: 2 }],
    ["crop", { left: 12 }],
  ])("a bad item %s (%j) drops only that field", (key, value) => {
    const parsed = schema.parse({ ...STACK, images: [{ ...ITEM, [key]: value }] });
    const img = parsed.images[0];
    expect(img?.[key as keyof typeof img]).toBeUndefined();
    expect(img?.url).toBe(SHOT);
  });
});
