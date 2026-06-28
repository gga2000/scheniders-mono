import { describe, it, expect } from "vitest";
import { diffJson, summarizeDiff } from "./config-diff";

const sec = (id: string, base: Record<string, unknown> = {}) => ({
    id,
    type: "hero",
    enabled: true,
    base,
});

describe("diffJson — primitives & objects", () => {
    it("reports a changed primitive", () => {
        expect(diffJson({ a: 1 }, { a: 2 })).toEqual([
            { path: ["a"], kind: "changed", before: 1, after: 2 },
        ]);
    });

    it("reports added / removed object keys", () => {
        const d = summarizeDiff(diffJson({ a: 1 }, { b: 2 }));
        expect(d).toEqual({ added: 1, removed: 1, changed: 0 });
    });

    it("no diff for deep-equal values", () => {
        expect(diffJson({ a: [1, 2], b: { c: 3 } }, { a: [1, 2], b: { c: 3 } })).toEqual([]);
    });
});

describe("diffJson — id-keyed arrays (sections)", () => {
    it("reports a pure reorder as a single 'changed', not N", () => {
        const before = [sec("a"), sec("b"), sec("c"), sec("d")];
        const after = [sec("d"), sec("a"), sec("b"), sec("c")]; // moved d to front
        const summary = summarizeDiff(diffJson(before, after));
        expect(summary).toEqual({ added: 0, removed: 0, changed: 1 });
    });

    it("reports only the edited section, regardless of position", () => {
        const before = [sec("a", { t: "x" }), sec("b"), sec("c")];
        const after = [sec("a", { t: "y" }), sec("b"), sec("c")];
        const entries = diffJson(before, after);
        expect(entries).toHaveLength(1);
        expect(entries[0]).toMatchObject({ path: ["a", "base", "t"], kind: "changed" });
    });

    it("reports added / removed sections by id", () => {
        const before = [sec("a"), sec("b")];
        const after = [sec("a"), sec("c")]; // b removed, c added
        const summary = summarizeDiff(diffJson(before, after));
        expect(summary).toEqual({ added: 1, removed: 1, changed: 0 });
    });

    it("edit + reorder = one content change + one order change", () => {
        const before = [sec("a", { t: "x" }), sec("b")];
        const after = [sec("b"), sec("a", { t: "y" })]; // swap + edit a
        const summary = summarizeDiff(diffJson(before, after));
        expect(summary.changed).toBe(2);
    });
});

describe("diffJson — non-keyed arrays fall back to index", () => {
    it("aligns primitive arrays by index", () => {
        const summary = summarizeDiff(diffJson([1, 2, 3], [1, 9, 3]));
        expect(summary).toEqual({ added: 0, removed: 0, changed: 1 });
    });

    it("uses index when ids are missing", () => {
        const before = [{ x: 1 }, { x: 2 }];
        const after = [{ x: 1 }, { x: 3 }];
        expect(summarizeDiff(diffJson(before, after)).changed).toBe(1);
    });
});
