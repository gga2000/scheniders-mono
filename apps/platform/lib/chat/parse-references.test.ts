// apps/platform/lib/chat/parse-references.test.ts
import { describe, it, expect } from "vitest";
import { dedupeReferences, dedupeMentions } from "./parse-references";

describe("dedupeReferences", () => {
    it("removes duplicate ref_type+ref_id pairs keeping first snapshot", () => {
        const out = dedupeReferences([
            { ref_type: "order", ref_id: "o1", snapshot: { a: 1 } },
            { ref_type: "order", ref_id: "o1", snapshot: { a: 2 } },
            { ref_type: "customer", ref_id: "c1", snapshot: {} },
        ]);
        expect(out).toHaveLength(2);
        expect(out[0].snapshot).toEqual({ a: 1 });
    });
});

describe("dedupeMentions", () => {
    it("dedupes user ids", () => {
        expect(dedupeMentions(["u1", "u1", "u2"])).toEqual(["u1", "u2"]);
    });
});
