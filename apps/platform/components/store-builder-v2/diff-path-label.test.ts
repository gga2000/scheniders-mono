import { describe, expect, it } from "vitest";
import type { StoreConfigV2 } from "@scheniders/shared";
import { describeDiffPath, isSecretDiffPath } from "./diff-path-label";

const config = {
    pages: [
        {
            page_id: "home",
            sections: [{ id: "s-1", type: "hero_image", enabled: true, base: {} }],
        },
    ],
    globals: {
        analytics_pixels: { id: "g-1", type: "analytics_pixels", enabled: true, base: {} },
    },
} as unknown as StoreConfigV2;

describe("describeDiffPath", () => {
    it("names the page, the section and the field instead of the raw path", () => {
        const parts = describeDiffPath(["pages", "0", "sections", "s-1", "base", "title"], [config], "ar");
        expect(parts[0]).not.toMatch(/pages|home/);
        expect(parts[1]).not.toBe("s-1");
        expect(parts[2]).toBe("العنوان");
        expect(parts.join(" ")).not.toMatch(/base|sections|\[/);
    });

    it("uses a merchant's own section label when set", () => {
        const labelled = structuredClone(config);
        labelled.pages[0].sections[0].label = "Ramadan banner";
        expect(describeDiffPath(["pages", "0", "sections", "s-1"], [labelled], "en")).toEqual([
            expect.any(String),
            "Ramadan banner",
        ]);
    });

    it("finds a section that only exists in the compared version", () => {
        const draft = { ...config, pages: [{ page_id: "home", sections: [] }] } as unknown as StoreConfigV2;
        const parts = describeDiffPath(["pages", "0", "sections", "s-1"], [draft, config], "en");
        expect(parts[1]).not.toBe("s-1");
    });

    it("counts list positions from 1", () => {
        expect(describeDiffPath(["redirects", "0", "from"], [config], "en")[0]).toBe("1");
    });
});

describe("isSecretDiffPath", () => {
    it("flags credentials so their values are never shown", () => {
        expect(isSecretDiffPath(["globals", "analytics_pixels", "base", "meta_capi_token"])).toBe(true);
        expect(isSecretDiffPath(["pages", "0", "sections", "s-1", "base", "title"])).toBe(false);
    });
});
