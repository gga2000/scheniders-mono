// apps/platform/lib/chat/fuzzy.test.ts
import { describe, it, expect } from "vitest";
import { fuzzyRank } from "./fuzzy";

const items = [{ n: "general" }, { n: "design team" }, { n: "Mohammed Ali" }, { n: "orders-iraq" }];
const run = (q: string) => fuzzyRank(items, q, (i) => i.n).map((i) => i.n);

describe("fuzzyRank", () => {
    it("empty query returns all in original order", () => expect(run("")).toEqual(items.map((i) => i.n)));
    it("substring matches rank first", () => expect(run("ali")[0]).toBe("Mohammed Ali"));
    it("is case-insensitive", () => expect(run("GENERAL")).toContain("general"));
    it("non-matches are dropped", () => expect(run("zzz")).toEqual([]));
    it("subsequence matches (gaps allowed)", () => expect(run("dsgn")).toContain("design team"));
});
