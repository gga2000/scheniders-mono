import { describe, it, expect } from "vitest";
import { describeVaultError, describeVaultProgress } from "./vault-messages";
import { VaultError } from "./vault-progress";

const t = (key: string, fallback: string, vars?: Record<string, string | number>) =>
    `${key}|${fallback.replace(/\{(\w+)\}/g, (_, k) => String(vars?.[k] ?? `{${k}}`))}`;

describe("vault messages", () => {
    it("describes progress through a translation key", () => {
        expect(describeVaultProgress({ step: "restoring", table: "orders", count: 3 }, t)).toBe(
            "vault.progress.restoring.orders|Restoring 3 orders...",
        );
        expect(describeVaultProgress({ step: "restoredOrders", written: 2, total: 5 }, t)).toBe(
            "vault.progress.restoredOrders|Restored 2 of 5 orders...",
        );
    });

    it("translates a VaultError by its code", () => {
        expect(describeVaultError(new VaultError("wrongKey", "x"), t, "fallback")).toContain("vault.error.wrongKey|");
    });

    it("passes other errors through and falls back for non-errors", () => {
        expect(describeVaultError(new Error("Cloud Sync Failed: boom"), t, "fallback")).toBe("Cloud Sync Failed: boom");
        expect(describeVaultError("nope", t, "fallback")).toBe("fallback");
    });
});
