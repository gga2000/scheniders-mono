// sticky_cta_bar's slice-1f props are optional and fail safe: a bad or
// rolled-back stored value falls back to today's behaviour instead of
// dropping the bar.

import { describe, expect, it } from "vitest";
import sticky_cta_bar from "./sticky_cta_bar";
import { IRAQ_DRAFT_STICKY_PROPS } from "./_pdp-fixtures";

const parse = (extra: Record<string, unknown>) => sticky_cta_bar.schema.parse({ ...IRAQ_DRAFT_STICKY_PROPS, ...extra });

describe("sticky_cta_bar 1f props", () => {
  it("accepts the new values", () => {
    const p = parse({
      primary_kind: "form_aware",
      style: "soft",
      secondary_display: "icon",
      whatsapp_prefill_i18n: { ar: "هلا، أريد أطلب {product}" },
    });
    expect(p.primary_kind).toBe("form_aware");
    expect(p.style).toBe("soft");
    expect(p.secondary_display).toBe("icon");
    expect(p.whatsapp_prefill_i18n).toEqual({ ar: "هلا، أريد أطلب {product}" });
  });

  it("a bad value falls back to the default, and the bar still parses", () => {
    const p = parse({ primary_kind: "auto_submit", style: "neon", secondary_display: 3, whatsapp_prefill_i18n: "hi" });
    expect(p.primary_kind).toBeUndefined();
    expect(p.style).toBeUndefined();
    expect(p.secondary_display).toBeUndefined();
    expect(p.whatsapp_prefill_i18n).toBeUndefined();
    expect(p.primary_label_i18n).toEqual(IRAQ_DRAFT_STICKY_PROPS.primary_label_i18n);
  });

  it("the old values are unchanged", () => {
    expect(parse({ primary_kind: "scroll_to_form" }).primary_kind).toBe("scroll_to_form");
    expect(parse({ primary_kind: "link" }).primary_kind).toBe("link");
    expect(sticky_cta_bar.schema.parse(IRAQ_DRAFT_STICKY_PROPS)).toEqual(IRAQ_DRAFT_STICKY_PROPS);
  });
});
