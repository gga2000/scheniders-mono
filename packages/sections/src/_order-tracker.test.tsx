// order_tracker: the status panel is pure, so every stage can be rendered
// statically and its promises checked. (No DOM lib in this package.)

import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  CUSTOMER_ORDER_STAGES,
  DEFAULT_NARRATIVES,
  resolveNarrative,
  type CustomerOrderStage,
} from "@scheniders/shared";
import { StoreBaseProvider } from "./helpers/store-context";
import { resolveTrackerContact } from "./helpers/whatsapp";
import {
  OrderStatusPanel,
  PhoneOrderList,
  firstStageChange,
  isLive,
  parseLookup,
  phoneOrderAsResult,
  safeLinkTarget,
  stageOf,
  type OrderResult,
  type PhoneOrder,
} from "./order_tracker.client";

const ORDER: OrderResult = { order_number: "4260910007", status: "placed", review_product_slug: "فيوجن" };

function panel(
  stage: CustomerOrderStage,
  over: Partial<Parameters<typeof OrderStatusPanel>[0]> = {},
): string {
  const narrative = resolveNarrative(stage, "ar", over.narrative ? undefined : undefined, over.phone ?? "0770 123 4567");
  return renderToStaticMarkup(
    React.createElement(
      StoreBaseProvider,
      { base: "", children: null },
      React.createElement(OrderStatusPanel, {
        order: ORDER,
        narrative,
        showTimeline: true,
        locale: "ar",
        whatsapp: "07701234567",
        phone: "0770 123 4567",
        ...over,
      }),
    ),
  );
}

describe("stageOf", () => {
  it("prefers the RPC's stage over the coarse bucket", () => {
    expect(stageOf({ order_number: "x", status: "confirmed", stage: "awaiting_confirmation" }))
      .toBe("awaiting_confirmation");
  });

  it("falls back to the bucket for an older lookup response", () => {
    // Deploy skew: route + RPC not yet updated. The four buckets are stage
    // names, so the panel still works — coarsely.
    expect(stageOf({ order_number: "x", status: "shipped" })).toBe("shipped");
    expect(stageOf({ order_number: "x", status: "placed" })).toBe("placed");
  });
});

describe("OrderStatusPanel", () => {
  it("renders the merchant's words for every stage", () => {
    for (const stage of CUSTOMER_ORDER_STAGES) {
      const html = panel(stage);
      expect(html, stage).toContain(DEFAULT_NARRATIVES[stage].title_i18n.ar);
      expect(html, stage).toContain(`data-stage="${stage}"`);
    }
  });

  it("fills the tenant's number into the placed-stage 'call us' line", () => {
    expect(panel("placed")).toContain("0770 123 4567");
    expect(panel("placed")).not.toContain("{contact}");
  });

  it("links the WhatsApp CTA to the tenant's number with the order number prefilled", () => {
    const html = panel("awaiting_confirmation");
    expect(html).toMatch(/https:\/\/wa\.me\/\d+\?text=4260910007/);
  });

  it("links 'rate your order' to the ordered product's reviews", () => {
    expect(panel("delivered")).toContain("/products/%D9%81%D9%8A%D9%88%D8%AC%D9%86#reviews");
  });

  it("drops the review button when there is no product to review", () => {
    const html = panel("delivered", { order: { order_number: "x", status: "delivered" } });
    expect(html).not.toContain("#reviews");
  });

  it("marks the current rung on the happy path", () => {
    const html = panel("shipped");
    expect(html).toContain('aria-current="step"');
    // Four rungs reached (placed → shipped), delivered not yet.
    expect(html.split("task_alt").length - 1).toBe(0);
  });

  it("lights no current rung for an order that left the happy path", () => {
    // A cancelled order is not "at" any step; the banner says what happened.
    expect(panel("cancelled")).not.toContain('aria-current="step"');
  });

  it("shows a COD refusal as having been shipped, then coming back", () => {
    const html = panel("returning");
    expect(html).toContain(DEFAULT_NARRATIVES.returning.title_i18n.ar);
    // shipped rung reached (its icon renders), so the customer sees it did go out
    expect(html).toContain("local_shipping");
    expect(html).not.toContain('aria-current="step"');
  });

  it("never invents an ETA", () => {
    for (const stage of CUSTOMER_ORDER_STAGES) {
      expect(panel(stage), stage).not.toMatch(/\d+\s*(دقيقة|ساعة|minute|hour)/);
    }
  });
});

describe("resolveTrackerContact", () => {
  it("prefers the store's call number, then its WhatsApp number, then contact_phone", () => {
    expect(resolveTrackerContact({ store_config: { contact: { phone_number: "07701112233", whatsapp_number: "07804445566" } } }))
      .toBe("07701112233");
    expect(resolveTrackerContact({ store_config: { contact: { whatsapp_number: "07804445566" } } })).toBe("07804445566");
    expect(resolveTrackerContact({ store_config: null, contact_phone: "07507778899" })).toBe("07507778899");
  });

  it("skips a placeholder number and returns null when nothing plausible is set", () => {
    expect(resolveTrackerContact({ store_config: { contact: { phone_number: "9647700000000", whatsapp_number: "07804445566" } } }))
      .toBe("07804445566");
    expect(resolveTrackerContact({ store_config: { contact: {} } })).toBeNull();
    expect(resolveTrackerContact(null)).toBeNull();
  });

  it("prefers the structured commerce.contact call number, normalized, over every legacy field", () => {
    expect(
      resolveTrackerContact({
        store_config: { contact: { phone_number: "07701112233", whatsapp_number: "07804445566" } },
        contact_phone: "07507778899",
        store_config_v2: { commerce: { contact: { call_number: "+9647779703832" } } },
      }),
    ).toBe("07779703832");
  });

  it("ignores an unusable structured number and keeps the legacy chain", () => {
    expect(
      resolveTrackerContact({
        store_config: { contact: { phone_number: "07701112233" } },
        store_config_v2: { commerce: { contact: { call_number: "0123" } } },
      }),
    ).toBe("07701112233");
    expect(
      resolveTrackerContact({ store_config_v2: { commerce: null }, contact_phone: "07507778899" }),
    ).toBe("07507778899");
  });
});

describe("safeLinkTarget", () => {
  it("keeps a same-site path and an http(s) URL", () => {
    expect(safeLinkTarget("/pages/returns")).toBe("/pages/returns");
    expect(safeLinkTarget(" https://example.com/x ")).toBe("https://example.com/x");
  });

  it("drops script, data and protocol-relative targets", () => {
    for (const bad of ["javascript:alert(1)", " JavaScript:alert(1)", "data:text/html,x", "//evil.example", "/\\evil.example", "", "   "]) {
      expect(safeLinkTarget(bad), bad).toBeNull();
    }
    expect(safeLinkTarget(undefined)).toBeNull();
  });
});

const ROWS: [PhoneOrder, PhoneOrder] = [
  { order_number: "4261030012", stage: "shipped", placed_at: "2026-10-30T09:00:00+00:00", item_count: 2 },
  { order_number: "4261001003", stage: "delivered", placed_at: "2026-10-01T09:00:00+00:00", item_count: 1 },
];

describe("phone-only lookup", () => {
  it("parses the list and the single shapes, and rejects anything else", () => {
    expect(parseLookup({ orders: ROWS })).toEqual({ kind: "list", orders: ROWS });
    expect(parseLookup({ order_number: "1", status: "placed" })).toEqual({
      kind: "single",
      order: { order_number: "1", status: "placed" },
    });
    expect(parseLookup({ orders: [] })).toBeNull();
    expect(parseLookup({ orders: [{ order_number: 1 }] })).toBeNull();
    expect(parseLookup(null)).toBeNull();
  });

  it("stays live while any order can still move, and stops once all are final", () => {
    expect(isLive({ kind: "list", orders: ROWS })).toBe(true);
    expect(isLive({ kind: "list", orders: [ROWS[1]] })).toBe(false);
    expect(isLive({ kind: "single", order: { order_number: "x", status: "placed", stage: "cancelled" } })).toBe(false);
    expect(isLive(null)).toBe(false);
  });

  it("finds the order whose stage moved between two answers", () => {
    const after = { kind: "list" as const, orders: [{ ...ROWS[0], stage: "delivered" }, ROWS[1]] as [PhoneOrder, PhoneOrder] };
    expect(firstStageChange({ kind: "list", orders: ROWS }, after)?.order_number).toBe("4261030012");
    expect(firstStageChange({ kind: "list", orders: ROWS }, { kind: "list", orders: ROWS })).toBeNull();
  });

  it("lists number, day, piece count and stage — and never a name", () => {
    const html = renderToStaticMarkup(
      React.createElement(PhoneOrderList, {
        orders: ROWS,
        selected: ROWS[0].order_number,
        onSelect: () => undefined,
        locale: "ar",
        titleOf: (row) => resolveNarrative(stageOf(phoneOrderAsResult(row)), "ar", null, null).title,
      }),
    );
    expect(html).toContain("4261030012");
    expect(html).toContain("قطعتين");
    expect(html).toContain("قطعة وحدة");
    expect(html).toContain("30 أكتوبر");
    expect(html).toContain(DEFAULT_NARRATIVES.shipped.title_i18n.ar);
    expect(html).toContain('aria-pressed="true"');
    // Arabic rows start at the right edge without setting dir.
    expect(html).toContain("flex-row-reverse");
    expect(html).not.toMatch(/\sdir=/);
  });

  it("shows a governorate code as its name", () => {
    const html = panel("shipped", {
      order: { order_number: "1", status: "shipped", customer_name: "علي", governorate: "BGD" },
    });
    expect(html).toContain("علي — بغداد");
  });
});
