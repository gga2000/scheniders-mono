import { describe, it, expect, vi, beforeEach } from "vitest";
import { recorded, respond, resetRecording, hasEq, queriesOn } from "@/lib/__fixtures__/recording-supabase";

/*
 * The top-bar product search. RLS admits every tenant a user belongs to, so the
 * read must name the active tenant itself, and a keystroke must never pull the
 * whole catalogue with its variants.
 */

vi.mock("@/lib/supabase", async () =>
    (await import("@/lib/__fixtures__/recording-supabase")).recordingSupabaseModule());

import { productRepository } from "./product-repository";

const TENANT = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
    resetRecording();
    respond(() => ({ data: [{ id: "p1", name: "Rose Oil", price: 1000 }], error: null }));
});

describe("productRepository.searchByName", () => {
    it("is tenant-scoped, name-only, narrow and capped", async () => {
        const rows = await productRepository.searchByName(TENANT, "rose", 8);

        expect(rows).toEqual([{ id: "p1", name: "Rose Oil", price: 1000 }]);
        const [q] = queriesOn("products");
        expect(hasEq(q, "tenant_id", TENANT)).toBe(true);
        expect(q.ops).toContainEqual({ op: "select", args: ["id, name, price"] });
        expect(q.ops).toContainEqual({ op: "ilike", args: ["name", "%rose%"] });
        expect(q.ops).toContainEqual({ op: "limit", args: [8] });
    });

    it("drops LIKE wildcards and escapes from the term", async () => {
        await productRepository.searchByName(TENANT, "50%*\\ off", 8);
        expect(queriesOn("products")[0].ops).toContainEqual({ op: "ilike", args: ["name", "%50 off%"] });
    });

    it("makes no request for a term that is only wildcards or space", async () => {
        expect(await productRepository.searchByName(TENANT, " %* ", 8)).toEqual([]);
        expect(recorded).toEqual([]);
    });

    it("surfaces a failed read", async () => {
        respond(() => ({ data: null, error: new Error("boom") }));
        await expect(productRepository.searchByName(TENANT, "rose", 8)).rejects.toThrow("boom");
    });
});
