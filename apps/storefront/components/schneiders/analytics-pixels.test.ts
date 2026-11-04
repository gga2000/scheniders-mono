import { describe, expect, it } from "vitest";
import { metaAdvancedMatchingJs } from "./analytics-pixels";

const HASH = "a".repeat(64);

function runInit(js: string, stored: string | null): Record<string, string> {
  const sessionStorage = { getItem: () => stored };
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
    const stored = JSON.stringify({ ph: b, external_id: c });
    expect(runInit(metaAdvancedMatchingJs(HASH), stored)).toEqual({ country: "iq", external_id: c, ph: b });
  });
});
