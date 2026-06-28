import { describe, it, expect } from "vitest";
import { resolveI18n } from "./store-config-v2";

describe("resolveI18n", () => {
    it("returns a plain string as-is, and '' for undefined", () => {
        expect(resolveI18n("hello", "en")).toBe("hello");
        expect(resolveI18n(undefined, "en")).toBe("");
    });

    it("returns the exact locale when present", () => {
        const s = { en: "Hello", ar: "مرحبا", ku: "سڵاو" };
        expect(resolveI18n(s, "ku")).toBe("سڵاو");
        expect(resolveI18n(s, "ar")).toBe("مرحبا");
    });

    it("falls back ku → ar before en (Iraq market)", () => {
        expect(resolveI18n({ en: "Hello", ar: "مرحبا" }, "ku")).toBe("مرحبا");
    });

    it("falls back ku → en when Arabic is also missing", () => {
        expect(resolveI18n({ en: "Hello" }, "ku")).toBe("Hello");
    });

    it("falls back ar → en", () => {
        expect(resolveI18n({ en: "Hello" }, "ar")).toBe("Hello");
    });

    it("skips empty/whitespace values and falls through", () => {
        expect(resolveI18n({ en: "", ar: "مرحبا" }, "en")).toBe("مرحبا");
        expect(resolveI18n({ ku: "   ", ar: "مرحبا" }, "ku")).toBe("مرحبا");
    });

    it("returns '' when every value is empty", () => {
        expect(resolveI18n({ en: "", ar: "", ku: "" }, "en")).toBe("");
        expect(resolveI18n({}, "en")).toBe("");
    });
});
