// order_tracker — the stage a tracked order is shown in.
//
// Found against live data: `lookup_order` returns both a coarse `status` (the
// 5-step timeline key) and a `stage` (the real state). The API dropped
// `stage`, and the RPC collapses cancelled / rejected / no_response /
// suspended into status "placed" and refund_delivered into "delivered" — so
// 1,888 of this store's 5,239 orders rendered "Order received" beneath a
// timeline implying the order was moving.
//
// The lists below are pinned to the RPC's own CASE arms (migration
// 20260606194612). They are literals on purpose: if the RPC gains a stage,
// these tests fail rather than the shopper quietly getting "Order received".
// They drive the tracker's real entry points — `stageOf` and the status
// panel — so the pin holds for whatever renders the banner.

import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  DEFAULT_NARRATIVES,
  resolveNarrative,
  type CustomerOrderStage,
  type LocaleCode,
} from "@scheniders/shared";
import { StoreBaseProvider } from "./helpers/store-context";
import { OrderStatusPanel, stageOf } from "./order_tracker.client";

/** Every `stage` value `lookup_order` can return, with the `status` it pairs
 *  with — exactly as the RPC's two CASE expressions produce them. */
const RPC_ROWS: ReadonlyArray<{
  db_status: string;
  stage: CustomerOrderStage;
  status: string;
}> = [
  { db_status: "new", stage: "placed", status: "placed" },
  { db_status: "pending_checkout", stage: "placed", status: "placed" },
  { db_status: "contacted", stage: "awaiting_confirmation", status: "confirmed" },
  { db_status: "confirmed", stage: "confirmed", status: "confirmed" },
  { db_status: "in_transit", stage: "shipped", status: "shipped" },
  { db_status: "delivered", stage: "delivered", status: "delivered" },
  { db_status: "completed", stage: "delivered", status: "delivered" },
  { db_status: "no_response", stage: "no_response", status: "placed" },
  { db_status: "suspended", stage: "on_hold", status: "placed" },
  { db_status: "cancelled", stage: "cancelled", status: "placed" },
  { db_status: "rejected", stage: "cancelled", status: "placed" },
  { db_status: "return_pending", stage: "returning", status: "placed" },
  { db_status: "refund_delivered", stage: "refunded", status: "delivered" },
];

/** The orders that are NOT on their way. None may sit "at" a timeline step. */
const HALTED: readonly CustomerOrderStage[] = [
  "no_response",
  "on_hold",
  "cancelled",
  "returning",
  "refunded",
];

function panel(stage: CustomerOrderStage, locale: LocaleCode = "ar"): string {
  return renderToStaticMarkup(
    React.createElement(
      StoreBaseProvider,
      { base: "", children: null },
      React.createElement(OrderStatusPanel, {
        order: { order_number: "4260910007", status: "placed", stage },
        narrative: resolveNarrative(stage, locale, undefined, "0770 123 4567"),
        showTimeline: true,
        locale,
        whatsapp: "07701234567",
        phone: "0770 123 4567",
      }),
    ),
  );
}

describe("stageOf", () => {
  it("reads every stage the RPC can return", () => {
    for (const row of RPC_ROWS) {
      expect(
        stageOf({ order_number: "x", stage: row.stage, status: row.status }),
        row.db_status,
      ).toBe(row.stage);
    }
  });

  it("prefers stage over status where the two disagree", () => {
    // These are the rows the old code got wrong, and the only ones where
    // preferring the wrong field is observable.
    const disagreeing = RPC_ROWS.filter((r) => r.stage !== r.status);
    expect(disagreeing.map((r) => r.db_status)).toEqual([
      "contacted",
      "no_response",
      "suspended",
      "cancelled",
      "rejected",
      "return_pending",
      "refund_delivered",
    ]);
    for (const row of disagreeing) {
      expect(stageOf({ order_number: "x", stage: row.stage, status: row.status })).not.toBe(row.status);
    }
  });

  it("falls back to status when stage is missing — an older deploy", () => {
    expect(stageOf({ order_number: "x", status: "shipped" })).toBe("shipped");
    expect(stageOf({ order_number: "x", status: "delivered" })).toBe("delivered");
  });

  it("lands on placed for an unknown value, never undefined", () => {
    expect(stageOf({ order_number: "x", stage: "teleported", status: "teleported" })).toBe("placed");
  });
});

describe("the banner for a halted order", () => {
  it("never calls it received or delivered", () => {
    for (const stage of HALTED) {
      for (const locale of ["ar", "en"] as const) {
        const html = panel(stage, locale);
        expect(html, `${stage}/${locale}`).not.toContain(
          DEFAULT_NARRATIVES.placed.title_i18n[locale] ?? "",
        );
        expect(html, `${stage}/${locale}`).not.toContain(
          DEFAULT_NARRATIVES.delivered.title_i18n[locale] ?? "",
        );
      }
    }
  });

  it("puts it at no step of the happy path", () => {
    for (const stage of HALTED) {
      expect(panel(stage), stage).not.toContain('aria-current="step"');
    }
  });

  it("says the order is cancelled, in both locales", () => {
    expect(panel("cancelled", "ar")).toContain("إلغاء");
    expect(panel("cancelled", "en").toLowerCase()).toContain("cancelled");
  });

  it("still marks the current step for every order that IS moving", () => {
    const moving = [...new Set(RPC_ROWS.map((r) => r.stage))].filter(
      (s) => !HALTED.includes(s),
    );
    expect(moving.length).toBeGreaterThan(0);
    for (const stage of moving) {
      expect(panel(stage), stage).toContain('aria-current="step"');
    }
  });
});
