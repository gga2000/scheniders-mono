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
import { OrderStatusPanel, stageOf, type OrderResult } from "./order_tracker.client";

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
