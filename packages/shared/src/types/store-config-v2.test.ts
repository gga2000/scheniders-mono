import { describe, it, expectTypeOf } from "vitest";
import type { StoreConfigV2, StoreCommerceConfig } from "./store-config-v2";

describe("StoreConfigV2 commerce slot", () => {
  it("accepts commerce + custom_css", () => {
    const c: Pick<StoreConfigV2, "commerce" | "custom_css"> = {
      commerce: { whatsapp_number: "+9647", enable_whatsapp_order: true, socials: { instagram: "x" } },
      custom_css: ".a{}",
    };
    expectTypeOf(c.commerce).toEqualTypeOf<StoreCommerceConfig | undefined>();
  });
});
