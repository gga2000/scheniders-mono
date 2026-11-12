import { describe, expect, it } from "vitest";
import { humanPath, summarizeOverrides } from "./variant-override-paths";

describe("summarizeOverrides", () => {
    const override = { title: "a", subtitle: "b", cta_label: "c", image: "d" };

    it("keeps the English summary when no locale is given", () => {
        expect(summarizeOverrides(override, 3)).toMatch(/\+1 more$/);
    });

    it("writes the rest count in Arabic with an Arabic comma", () => {
        const out = summarizeOverrides(override, 3, "ar");
        expect(out).toContain("، ");
        expect(out).toMatch(/و1 غيرها$/);
        expect(out).not.toContain("more");
    });

    it("humanPath uses the field's Arabic label when a locale is given", () => {
        expect(humanPath("title", "ar")).not.toMatch(/[A-Za-z]/);
    });
});
