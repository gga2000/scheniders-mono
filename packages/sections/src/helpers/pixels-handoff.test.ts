// @vitest-environment jsdom
import { createHash } from "crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PENDING_PURCHASE_KEY, pixelContentsFromItems } from "@scheniders/shared";
import { firePendingPurchase, handOffPurchase } from "./pixels";

const sha = (v: string) => createHash("sha256").update(v).digest("hex");
const TENANT = "b5c4f2d4-834f-4af4-822d-9b9826a8f45a";
const DATA = pixelContentsFromItems([{ product_id: "p1", price: 25000, quantity: 2 }]);

type W = { fbq?: unknown; ttq?: unknown };

describe("Purchase handoff", () => {
  let fbq: ReturnType<typeof vi.fn>;
  let ttq: { track: ReturnType<typeof vi.fn>; identify: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    sessionStorage.clear();
    fbq = vi.fn();
    ttq = { track: vi.fn(), identify: vi.fn() };
    (globalThis as W).fbq = fbq;
    (globalThis as W).ttq = ttq;
  });
  afterEach(() => {
    delete (globalThis as W).fbq;
    delete (globalThis as W).ttq;
    vi.restoreAllMocks();
  });

  it("stores the event for the next page with hashed ids only, and fires nothing yet", async () => {
    await handOffPurchase({ tenantId: TENANT, phone: "0770 123 4567", data: DATA, eventId: "evt-1" });
    const raw = sessionStorage.getItem(PENDING_PURCHASE_KEY) ?? "";
    expect(raw).not.toContain("7701234567");
    const stored = JSON.parse(raw) as Record<string, unknown>;
    expect(stored.event_id).toBe("evt-1");
    expect(stored.ph).toBe(sha("9647701234567"));
    expect(stored.ph_plus).toBe(sha("+9647701234567"));
    expect(stored.external_id).toBe(sha(`${TENANT}:9647701234567`));
    expect(fbq).not.toHaveBeenCalled();
  });

  it("fires the handed-over Purchase once on the next page, with its event id and TikTok matching", async () => {
    await handOffPurchase({ tenantId: TENANT, phone: "07701234567", data: DATA, eventId: "evt-2" });
    firePendingPurchase();
    firePendingPurchase();
    const purchases = fbq.mock.calls.filter((c) => c[1] === "Purchase");
    expect(purchases).toHaveLength(1);
    expect(purchases[0]?.[2]).toMatchObject({ value: 50000, currency: "IQD", content_ids: ["p1"] });
    expect(purchases[0]?.[3]).toEqual({ eventID: "evt-2" });
    expect(ttq.identify).toHaveBeenCalledWith({
      phone_number: sha("+9647701234567"),
      external_id: sha(`${TENANT}:9647701234567`),
    });
    expect(ttq.track).toHaveBeenCalledWith("CompletePayment", expect.anything(), { event_id: "evt-2" });
    expect(sessionStorage.getItem(PENDING_PURCHASE_KEY)).toBeNull();
  });

  it("leaves the handoff for a page that has a pixel", () => {
    delete (globalThis as W).fbq;
    delete (globalThis as W).ttq;
    sessionStorage.setItem(PENDING_PURCHASE_KEY, JSON.stringify({ event_id: "e", data: DATA, ts: Date.now() }));
    firePendingPurchase();
    expect(sessionStorage.getItem(PENDING_PURCHASE_KEY)).not.toBeNull();
  });

  it("drops a stale handoff", () => {
    sessionStorage.setItem(
      PENDING_PURCHASE_KEY,
      JSON.stringify({ event_id: "old", data: DATA, ts: Date.now() - 2 * 60 * 60 * 1000 }),
    );
    firePendingPurchase();
    expect(fbq).not.toHaveBeenCalled();
  });

  it("fires in place when storage refuses the handoff", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    await handOffPurchase({ tenantId: TENANT, phone: "07701234567", data: DATA, eventId: "evt-3" });
    expect(fbq.mock.calls.filter((c) => c[1] === "Purchase")).toHaveLength(1);
  });
});
