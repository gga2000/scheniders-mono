import { describe, it, expect } from "vitest";
import { cloudVaultPath, isCloudVaultFilename, isVaultKeyLongEnough, MIN_VAULT_KEY_LENGTH } from "./vault-paths";

describe("vault paths", () => {
    it("accepts only files the sync feature writes", () => {
        expect(isCloudVaultFilename("sync_2026-10-31T01-00-00-000Z.scheniders")).toBe(true);
        expect(isCloudVaultFilename("../other-tenant/sync_1.scheniders")).toBe(false);
        expect(isCloudVaultFilename("sync_1.scheniders/../../x")).toBe(false);
        expect(isCloudVaultFilename("orders.csv")).toBe(false);
        expect(isCloudVaultFilename("")).toBe(false);
    });

    it("always places the file under the tenant folder", () => {
        expect(cloudVaultPath("t-1", "sync_a.scheniders")).toBe("t-1/sync_a.scheniders");
    });
});

describe("isVaultKeyLongEnough", () => {
    it("rejects keys shorter than the minimum and accepts the minimum itself", () => {
        expect(isVaultKeyLongEnough("a".repeat(MIN_VAULT_KEY_LENGTH - 1))).toBe(false);
        expect(isVaultKeyLongEnough("a".repeat(MIN_VAULT_KEY_LENGTH))).toBe(true);
        expect(isVaultKeyLongEnough("")).toBe(false);
    });
});
