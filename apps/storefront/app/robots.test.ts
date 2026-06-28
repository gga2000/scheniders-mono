import { describe, it, expect } from "vitest";
import robots from "./robots";

describe("robots", () => {
    const rules = robots().rules;
    const rule = Array.isArray(rules) ? rules[0] : rules;
    const disallow = (rule as { disallow?: string[] }).disallow ?? [];

    it("blocks the editor draft preview at its real path", () => {
        // Regression: the path was "/s/_preview/", which matched nothing —
        // the route lives at "/_preview/". A leaked token could get a draft
        // indexed.
        expect(disallow).toContain("/_preview/");
        expect(disallow).not.toContain("/s/_preview/");
    });

    it("keeps the cart/checkout funnel + api out of the index", () => {
        expect(disallow).toContain("/api/");
        expect(disallow).toContain("/s/*/cart");
        expect(disallow).toContain("/s/*/checkout");
    });
});
