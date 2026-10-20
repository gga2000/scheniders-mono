import { describe, expect, it } from "vitest";
import {
  CUSTOMER_ORDER_STAGES,
  DEFAULT_NARRATIVES,
  STATUS_TO_STAGE,
  TIMELINE_STAGES,
  coerceStage,
  resolveNarrative,
  stageForStatus,
} from "./order-status";

/** Every status observed in production on 2026-09-10 (13). If ops add one,
 *  this list is where it must be mapped — an unmapped status silently
 *  shows the shopper "placed". */
const PRODUCTION_STATUSES = [
  "new", "pending_checkout", "contacted", "confirmed", "in_transit", "delivered",
  "completed", "no_response", "suspended", "cancelled", "rejected",
  "return_pending", "refund_delivered",
];

describe("stageForStatus", () => {
  it("maps every production status explicitly", () => {
    for (const s of PRODUCTION_STATUSES) {
      expect(STATUS_TO_STAGE[s], s).toBeDefined();
    }
  });

  it("agrees with the public lookup RPC's coarse buckets", () => {
    // lookup_order collapses to placed/confirmed/shipped/delivered. The TS
    // map must never put a status in a DIFFERENT happy-path bucket than the
    // SQL does; finer off-path stages are allowed on top.
    const rpc: Record<string, string> = {
      delivered: "delivered", completed: "delivered", refund_delivered: "delivered",
      in_transit: "shipped", confirmed: "confirmed", contacted: "confirmed",
    };
    expect(stageForStatus("in_transit")).toBe("shipped");
    expect(stageForStatus("confirmed")).toBe("confirmed");
    expect(["delivered"]).toContain(stageForStatus("delivered"));
    expect(["delivered"]).toContain(stageForStatus("completed"));
    // contacted is where the two differ on purpose: the RPC calls it
    // "confirmed"; the customer needs to know it is waiting on THEM.
    expect(rpc.contacted).toBe("confirmed");
    expect(stageForStatus("contacted")).toBe("awaiting_confirmation");
  });

  it("falls back to placed for anything unknown", () => {
    expect(stageForStatus("brand_new_ops_state")).toBe("placed");
    expect(stageForStatus(null)).toBe("placed");
    expect(stageForStatus("  ")).toBe("placed");
  });

  it("treats a COD refusal as returning, not cancelled", () => {
    // return_pending is the single largest bucket in production; the copy
    // must invite a redelivery, not close the door.
    expect(stageForStatus("return_pending")).toBe("returning");
  });
});

describe("defaults", () => {
  it("ships copy for every stage, in Arabic first", () => {
    for (const stage of CUSTOMER_ORDER_STAGES) {
      const d = DEFAULT_NARRATIVES[stage];
      expect(d.title_i18n.ar, stage).toBeTruthy();
      expect(d.body_i18n.ar, stage).toBeTruthy();
    }
  });

  it("puts the timeline stages in flow order", () => {
    expect(TIMELINE_STAGES).toEqual(["placed", "awaiting_confirmation", "confirmed", "shipped", "delivered"]);
  });
});

describe("resolveNarrative", () => {
  it("fills the tenant's number into {contact}", () => {
    const r = resolveNarrative("placed", "ar", undefined, "0770 123 4567");
    expect(r.next).toContain("0770 123 4567");
    expect(r.next).not.toContain("{contact}");
  });

  it("drops a line that needs a number the tenant has not set", () => {
    // Never render "Call us on {contact}" with a hole in it.
    const r = resolveNarrative("placed", "ar", undefined, null);
    expect(r.next).toBeNull();
  });

  it("drops a phone or WhatsApp button when there is no number to dial", () => {
    expect(resolveNarrative("placed", "ar", undefined, null).cta).toBeNull();
    expect(resolveNarrative("no_response", "ar", undefined, null).cta).toBeNull();
    // A review CTA needs no number and survives.
    expect(resolveNarrative("delivered", "ar", undefined, null).cta?.kind).toBe("review");
  });

  it("lets the merchant override one field without losing the rest", () => {
    const r = resolveNarrative(
      "confirmed", "ar",
      { confirmed: { title_i18n: { ar: "أكّدنا طلبك" } } },
      "0770",
    );
    expect(r.title).toBe("أكّدنا طلبك");
    expect(r.body).toBe(DEFAULT_NARRATIVES.confirmed.body_i18n.ar);
  });

  it("lets the merchant swap the CTA", () => {
    const r = resolveNarrative(
      "delivered", "en",
      { delivered: { cta: { kind: "link", label_i18n: { en: "See your points" }, value: "/account" } } },
      null,
    );
    expect(r.cta).toEqual({ kind: "link", label: "See your points", value: "/account" });
  });

  it("falls back to the default when the merchant's override is empty for the locale", () => {
    const r = resolveNarrative("shipped", "en", { shipped: { title_i18n: { ar: "بالطريق" } } }, null);
    expect(r.title).toBe(DEFAULT_NARRATIVES.shipped.title_i18n.en);
  });

  it("reports the timeline position, or -1 off the happy path", () => {
    expect(resolveNarrative("shipped", "ar", undefined, null).timeline_index).toBe(3);
    expect(resolveNarrative("cancelled", "ar", undefined, null).timeline_index).toBe(-1);
  });
});

describe("coerceStage", () => {
  it("passes a stage name through unchanged", () => {
    for (const stage of CUSTOMER_ORDER_STAGES) expect(coerceStage(stage)).toBe(stage);
  });

  it("maps an internal status", () => {
    expect(coerceStage("in_transit")).toBe("shipped");
    expect(coerceStage("return_pending")).toBe("returning");
  });

  it("falls back to placed for garbage", () => {
    expect(coerceStage("???")).toBe("placed");
    expect(coerceStage(undefined)).toBe("placed");
  });
});
