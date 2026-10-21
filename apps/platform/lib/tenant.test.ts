/// <reference types="vitest/globals" />

import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
    tenants: new Set<string>(),
    history: new Set<string>(),
    failTable: null as string | null,
}));

vi.mock("@/lib/supabase-server", () => ({
    createSupabaseServiceClient: () => ({
        from: (table: string) => ({
            select: () => ({
                eq: (_column: string, value: string) => ({
                    maybeSingle: async () => {
                        if (db.failTable === table) {
                            return { data: null, error: { message: "timeout" } };
                        }
                        const held = table === "tenant_slug_history" ? db.history : db.tenants;
                        return { data: held.has(value) ? { found: true } : null, error: null };
                    },
                }),
            }),
        }),
    }),
    createSupabaseServerClientWithToken: () => {
        throw new Error("not used by these tests");
    },
}));

import { ensureUniqueSlug, generateSlug } from "./tenant";

describe("generateSlug", () => {
    it("slugifies latin names", () => {
        expect(generateSlug("Acme Perfumes")).toBe("acme-perfumes");
        expect(generateSlug("  Noor  Beauty  ")).toBe("noor-beauty");
    });

    it("UX2-13: transliterates Arabic instead of falling back to a machine id", () => {
        // Before the fix these all stripped to "" → `tenant-<timestamp>`,
        // which is what the merchant then shared on WhatsApp.
        const zahraa = generateSlug("متجر زهراء");
        expect(zahraa).not.toMatch(/^tenant-\d+$/);
        expect(zahraa).toMatch(/^[a-z0-9-]+$/);
        expect(zahraa).toContain("-");

        expect(generateSlug("نور")).toBe("nwr");
        expect(generateSlug("بغداد ستور")).toBe("bghdad-stwr");
    });

    it("handles mixed Arabic + latin", () => {
        expect(generateSlug("متجر Zahraa")).toBe("mtjr-zahraa");
    });

    it("drops diacritics rather than turning them into separators", () => {
        expect(generateSlug("مَتْجَر")).toBe("mtjr");
    });

    it("still falls back for names with no slugifiable characters", () => {
        expect(generateSlug("!!!")).toMatch(/^tenant-\d+$/);
        expect(generateSlug("")).toMatch(/^tenant-\d+$/);
    });
});

describe("ensureUniqueSlug", () => {
    beforeEach(() => {
        db.tenants = new Set();
        db.history = new Set();
        db.failTable = null;
    });

    it("returns the base slug when nothing holds it", async () => {
        await expect(ensureUniqueSlug("noor")).resolves.toBe("noor");
    });

    it("suffixes past a slug a current tenant holds", async () => {
        db.tenants = new Set(["noor", "noor-1"]);
        await expect(ensureUniqueSlug("noor")).resolves.toBe("noor-2");
    });

    it("never hands a new store a renamed store's old link", async () => {
        // A renamed store's old slug is its redirect: storefront resolves
        // tenants first, so a new tenant on that slug would silently take
        // every link the renamed store already shared.
        db.history = new Set(["tenant-1783087997714"]);
        await expect(ensureUniqueSlug("tenant-1783087997714")).resolves.toBe(
            "tenant-1783087997714-1",
        );
    });

    it("fails loudly when a lookup fails instead of assuming the slug is free", async () => {
        db.failTable = "tenants";
        await expect(ensureUniqueSlug("noor")).rejects.toThrow(/slug/i);
        db.failTable = "tenant_slug_history";
        await expect(ensureUniqueSlug("noor")).rejects.toThrow(/slug/i);
    });
});
