import { describe, expect, it } from "vitest";
import { WALLET_WARN_DAYS, walletRunway } from "./wallet-runway";

describe("walletRunway", () => {
    it("says nothing to a shop that spends nothing day to day", () => {
        expect(walletRunway(0, null)).toBeNull();
        expect(walletRunway(0, 0)).toBeNull();
        expect(walletRunway(-500, 0)).toBeNull();
    });

    it("says nothing while the wallet holds 3 days of spend", () => {
        expect(WALLET_WARN_DAYS).toBe(3);
        expect(walletRunway(2700, 900)).toBeNull();
        expect(walletRunway(50_000, 900)).toBeNull();
    });

    it("counts whole days left under 3 days", () => {
        expect(walletRunway(2699, 900)).toEqual({ kind: "low", days: 2 });
        expect(walletRunway(1800, 900)).toEqual({ kind: "low", days: 2 });
        expect(walletRunway(900, 900)).toEqual({ kind: "low", days: 1 });
        expect(walletRunway(30, 900)).toEqual({ kind: "low", days: 0 });
    });

    it("says the wallet is empty at nothing or below", () => {
        expect(walletRunway(0, 900)).toEqual({ kind: "empty" });
        expect(walletRunway(-600, 900)).toEqual({ kind: "empty" });
    });
});
