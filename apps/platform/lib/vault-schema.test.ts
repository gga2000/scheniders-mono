import { describe, it, expect } from "vitest";
import { vaultFileSchema } from "./vault-schema";

const valid = {
    metadata: { version: "1.0.0", timestamp: "2026-10-31T01:00:00.000Z", counts: { orders: 1, products: 0, customers: 0 } },
    data: { orders: [{ id: "a" }], products: [], customers: [] },
};

describe("vaultFileSchema", () => {
    it("accepts a well-formed backup", () => {
        expect(vaultFileSchema.safeParse(valid).success).toBe(true);
    });

    it("defaults a missing table to empty", () => {
        const parsed = vaultFileSchema.parse({ ...valid, data: { orders: [{ id: "a" }] } });
        expect(parsed.data.products).toEqual([]);
    });

    it("refuses rows that are not objects", () => {
        expect(vaultFileSchema.safeParse({ ...valid, data: { ...valid.data, orders: ["x"] } }).success).toBe(false);
    });

    it("refuses a bad date or missing counts", () => {
        expect(vaultFileSchema.safeParse({ ...valid, metadata: { ...valid.metadata, timestamp: "nope" } }).success).toBe(false);
        expect(vaultFileSchema.safeParse({ ...valid, metadata: { version: "1", timestamp: valid.metadata.timestamp } }).success).toBe(false);
    });
});
