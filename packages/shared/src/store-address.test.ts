import { describe, expect, it } from "vitest";
import { STORE_ROOT_DOMAIN, storeAddress } from "./store-address";

describe("storeAddress", () => {
    it("puts a store under the Fermi domain unless told otherwise", () => {
        expect(STORE_ROOT_DOMAIN).toBe("usefermi.com");
        expect(storeAddress("noor-beauty")).toBe("noor-beauty.usefermi.com");
        expect(storeAddress("noor-beauty", "localhost:3001")).toBe("noor-beauty.localhost:3001");
    });
});
