import { describe, expect, it } from "vitest";
import { resolveFieldHelp, resolveFieldLabel } from "./section-field-meta";

describe("resolveFieldHelp", () => {
    it("finds help for a translated field under its plain key", () => {
        // The form passes `badge_i18n`; lookups drop the suffix first.
        expect(resolveFieldHelp(undefined, "badge_i18n", "ar")).toContain("{pct}");
        expect(resolveFieldHelp(undefined, "badge_i18n", "en")).toContain("{pct}");
    });

    it("returns null for a field whose label says enough", () => {
        expect(resolveFieldHelp(undefined, "title_i18n", "en")).toBeNull();
    });
});

describe("resolveFieldLabel", () => {
    it("labels a translated field like its plain key", () => {
        expect(resolveFieldLabel(undefined, "badge_i18n", "ar")).toBe("الشارة");
    });
});
