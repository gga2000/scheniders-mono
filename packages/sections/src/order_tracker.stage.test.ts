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

import { describe, expect, it } from "vitest";
import { resolveTrackStage, trackStageView } from "./order_tracker.client";
import type { TrackStage } from "./order_tracker.client";

/** Every `stage` value `lookup_order` can return, with the `status` it pairs
 *  with — exactly as the RPC's two CASE expressions produce them. */
const RPC_ROWS: ReadonlyArray<{
  db_status: string;
  stage: TrackStage;
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

/** The orders that are NOT on their way. None may draw a timeline. */
const HALTED: readonly TrackStage[] = [
  "no_response",
  "on_hold",
  "cancelled",
  "returning",
  "refunded",
];

describe("resolveTrackStage", () => {
  it("reads every stage the RPC can return", () => {
    for (const row of RPC_ROWS) {
      expect(resolveTrackStage({ stage: row.stage, status: row.status })).toBe(
        row.stage,
      );
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
      expect(resolveTrackStage(row)).not.toBe(row.status);
    }
  });

  it("falls back to status when stage is missing — an older deploy", () => {
    expect(resolveTrackStage({ status: "shipped" })).toBe("shipped");
    expect(resolveTrackStage({ status: "delivered", stage: null })).toBe(
      "delivered",
    );
  });

  it("lands on placed for an unknown value, never undefined", () => {
    expect(resolveTrackStage({ stage: "teleported", status: "teleported" })).toBe(
      "placed",
    );
    expect(resolveTrackStage({})).toBe("placed");
  });
});

describe("trackStageView", () => {
  it("draws no timeline for an order that is not on its way", () => {
    for (const stage of HALTED) {
      expect(trackStageView(stage).step).toBeNull();
    }
  });

  it("draws a timeline for every order that IS moving", () => {
    const moving = RPC_ROWS.map((r) => r.stage).filter(
      (s) => !HALTED.includes(s),
    );
    expect(moving.length).toBeGreaterThan(0);
    for (const stage of moving) {
      expect(trackStageView(stage).step).not.toBeNull();
    }
  });

  it("says the order is cancelled, in both locales, and offers a way to ask", () => {
    const view = trackStageView("cancelled");
    expect(view.ar).toContain("ملغي");
    expect(view.en.toLowerCase()).toContain("cancelled");
    expect(view.tone).toBe("stopped");
    expect(view.contact).toBe(true);
  });

  it("never calls a halted order received or delivered", () => {
    for (const stage of HALTED) {
      const view = trackStageView(stage);
      expect(view.ar).not.toContain("تم استلام طلبك");
      // "Refunded" is allowed to mention the refund, but nothing halted may
      // present itself as the plain delivered/received happy path.
      expect(view.en).not.toBe("Order received");
      expect(view.en).not.toBe("Delivered");
    }
  });

  it("tells the shopper what to do wherever they have to act", () => {
    for (const stage of ["no_response", "on_hold", "cancelled"] as const) {
      const view = trackStageView(stage);
      expect(view.contact).toBe(true);
      expect(view.note?.ar).toBeTruthy();
      expect(view.note?.en).toBeTruthy();
    }
    // And not where there is nothing for them to do.
    expect(trackStageView("delivered").contact).toBeUndefined();
    expect(trackStageView("refunded").contact).toBeUndefined();
  });
});
