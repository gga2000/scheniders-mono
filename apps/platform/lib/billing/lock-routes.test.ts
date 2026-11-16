import { describe, expect, it } from "vitest";
import { BILLING_PAY_PATH, BILLING_SETTINGS_PATH, billingNotificationPath, isOpenWhileLocked } from "./lock-routes";

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

describe("billingNotificationPath", () => {
    const line = (type: string, payload: Record<string, unknown> = {}) => billingNotificationPath({ type, payload });

    it("opens the pay form for a line that asks for money", () => {
        expect(line("finance.wallet_low", { days: 2 })).toBe(BILLING_PAY_PATH);
        expect(line("finance.wallet_empty")).toBe(BILLING_PAY_PATH);
        expect(line("wallet.auto_refill_failed")).toBe(BILLING_PAY_PATH);
        expect(line("billing.renewal_soon", { short: 6000 })).toBe(BILLING_PAY_PATH);
    });

    it("opens the billing page for a renewal the wallet covers and for receipts", () => {
        expect(line("billing.renewal_soon", { short: 0 })).toBe(BILLING_SETTINGS_PATH);
        expect(line("wallet.topup_approved")).toBe(BILLING_SETTINGS_PATH);
        expect(line("wallet.topup_rejected", { reason: "x" })).toBe(BILLING_SETTINGS_PATH);
    });

    it("leaves every other line alone", () => {
        expect(line("order.created")).toBeNull();
        expect(line("prime.payment")).toBeNull();
    });
});
