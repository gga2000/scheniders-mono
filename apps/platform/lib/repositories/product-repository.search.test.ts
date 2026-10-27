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
    it("is tenant-scoped, narrow and capped, and matches every name a product goes by", async () => {
        const rows = await productRepository.searchByName(TENANT, "rose", 8);

        expect(rows).toEqual([{ id: "p1", name: "Rose Oil", price: 1000 }]);
        const [q] = queriesOn("products");
        expect(hasEq(q, "tenant_id", TENANT)).toBe(true);
        expect(q.ops).toContainEqual({ op: "select", args: ["id, name, price"] });
        expect(q.ops).toContainEqual({
            op: "or",
            args: ['name.ilike."*rose*",display_name.ilike."*rose*",short_name.ilike."*rose*",sku.ilike."*rose*",lightfunnels_aliases.cs.{"rose"}'],
        });
        expect(q.ops).toContainEqual({ op: "limit", args: [8] });
    });

    it("drops LIKE wildcards, quotes and escapes from the term, and quotes it", async () => {
        await productRepository.searchByName(TENANT, '50%*"\\ off, (x)', 8);
        const or = queriesOn("products")[0].ops.find((o) => o.op === "or")?.args[0] as string;
        expect(or).toContain('name.ilike."*50 off, (x)*"');
        expect(or).toContain('lightfunnels_aliases.cs.{"50 off, (x)"}');
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
