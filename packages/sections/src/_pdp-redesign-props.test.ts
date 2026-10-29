// =====================================================================
// PDP redesign 1b — the new pdp_direct_order props parse safely
// =====================================================================
// Every prop slice 1b adds is optional and `.catch(undefined)`-guarded: a
// bad or rolled-back stored value drops that one prop, never the buy box.
// =====================================================================

import { describe, expect, it } from "vitest";
import pdp_direct_order from "./pdp_direct_order";
import type { Props } from "./pdp_direct_order";
import { EXPRESS_IRAQ_DRAFT_PDP_PROPS } from "./_pdp-fixtures";

const schema = pdp_direct_order.schema;

describe("pdp_direct_order slice 1b props", () => {
  it("accepts every valid value", () => {
    const parsed = schema.parse({
      ...EXPRESS_IRAQ_DRAFT_PDP_PROPS,
      heading_style: "chapter",
      identity_rating: "summary_link",
      color_lock: true,
      payment_tag: "statement",
      promise_layout: "band",
      return_promise_i18n: { ar: "ما عجبك؟ ترفضه قدام المندوب أو ترجّعه خلال أسبوع" },
      guarantee_anchor_id: "guarantee",
    });
    expect(parsed.heading_style).toBe("chapter");
    expect(parsed.identity_rating).toBe("summary_link");
    expect(parsed.color_lock).toBe(true);
    expect(parsed.payment_tag).toBe("statement");
    expect(parsed.promise_layout).toBe("band");
    expect(parsed.return_promise_i18n?.ar).toBe("ما عجبك؟ ترفضه قدام المندوب أو ترجّعه خلال أسبوع");
    expect(parsed.guarantee_anchor_id).toBe("guarantee");
  });

  it.each<[keyof Props, unknown]>([
    ["heading_style", "giant"],
    ["identity_rating", "stars"],
    ["color_lock", "yes"],
    ["payment_tag", "badge"],
    ["promise_layout", "cards"],
    ["return_promise_i18n", 42],
    ["guarantee_anchor_id", "#guarantee"],
    ["guarantee_anchor_id", "Guarantee"],
  ])("a bad %s (%j) falls back to absent and keeps the section", (key, value) => {
    const parsed = schema.safeParse({ ...EXPRESS_IRAQ_DRAFT_PDP_PROPS, [key]: value });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data[key]).toBeUndefined();
      expect(parsed.data.layout).toBe("express");
    }
  });
});
