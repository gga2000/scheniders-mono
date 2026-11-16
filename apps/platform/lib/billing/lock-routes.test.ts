import { describe, expect, it } from "vitest";
import { isOpenWhileLocked } from "./lock-routes";

describe("isOpenWhileLocked", () => {
    it("keeps orders, shipping, labels, export, returns and Prime open", () => {
        for (const path of ["/orders", "/orders/abc", "/printing", "/prime", "/shipping-export", "/returns"]) {
            expect(isOpenWhileLocked(path, null), path).toBe(true);
        }
    });

    it("keeps the billing page open so the shop can pay, and no other settings", () => {
        expect(isOpenWhileLocked("/settings", "billing")).toBe(true);
        expect(isOpenWhileLocked("/settings", "team")).toBe(false);
        expect(isOpenWhileLocked("/settings", null)).toBe(false);
    });

    it("locks everything else, including look-alike paths", () => {
        for (const path of ["/dashboard", "/products", "/finances", "/reports", "/store/edit", "/till", "/ordersx", "/team"]) {
            expect(isOpenWhileLocked(path, null), path).toBe(false);
        }
        expect(isOpenWhileLocked(null, null)).toBe(false);
    });
});
