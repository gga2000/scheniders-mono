import { describe, expect, it } from "vitest";
import { pendingPurchaseKey } from "@scheniders/shared";
import { metaAdvancedMatchingJs } from "./analytics-pixels";

const HASH = "a".repeat(64);

const TENANT = "b5c4f2d4-834f-4af4-822d-9b9826a8f45a";

/** `stored` sits under `storedKey`; every other key reads empty. */
function runInit(js: string, stored: string | null, storedKey?: string): Record<string, string> {
  const sessionStorage = { getItem: (k: string) => (storedKey === undefined || k === storedKey ? stored : null) };
  return new Function("sessionStorage", `${js};return am;`)(sessionStorage) as Record<string, string>;
}

describe("metaAdvancedMatchingJs", () => {
  it("sends the country and the visitor id on every page", () => {
    expect(runInit(metaAdvancedMatchingJs(HASH), null)).toEqual({ country: "iq", external_id: HASH });
  });

  it("drops a visitor id that is not a SHA-256 hash", () => {
    expect(runInit(metaAdvancedMatchingJs("x'];alert(1)//"), null)).toEqual({ country: "iq" });
    expect(runInit(metaAdvancedMatchingJs(null), null)).toEqual({ country: "iq" });
  });

  it("uses the buyer's phone and phone id after an order", () => {
    const b = "b".repeat(64);
    const c = "c".repeat(64);
    const stored = JSON.stringify({ ph: b, external_id: c, ts: Date.now() });
    expect(runInit(metaAdvancedMatchingJs(HASH, TENANT), stored, pendingPurchaseKey(TENANT))).toEqual({ country: "iq", external_id: c, ph: b });
  });

  it("ignores another store's handoff and a stale one", () => {
    const stored = JSON.stringify({ ph: "b".repeat(64), external_id: "c".repeat(64), ts: Date.now() });
    expect(runInit(metaAdvancedMatchingJs(HASH, TENANT), stored, pendingPurchaseKey("other-store"))).toEqual({ country: "iq", external_id: HASH });
    const old = JSON.stringify({ ph: "b".repeat(64), ts: Date.now() - 2 * 60 * 60 * 1000 });
    expect(runInit(metaAdvancedMatchingJs(HASH, TENANT), old, pendingPurchaseKey(TENANT))).toEqual({ country: "iq", external_id: HASH });
  });
});
