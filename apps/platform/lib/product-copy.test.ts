import { describe, it, expect } from "vitest";
import {
    buildProductCopyMessages,
    parseProductCopy,
    PRODUCT_COPY_SCHEMA,
} from "./product-copy";

describe("buildProductCopyMessages", () => {
    it("includes the product, category, hints, tone, and all three languages", () => {
        const content = buildProductCopyMessages({
            name: "Vanilla Candle",
            category: "Home",
            hints: "soy wax, 40h burn",
            tone: "luxury",
        })[0].content;
        expect(content).toContain("Vanilla Candle");
        expect(content).toContain("Home");
        expect(content).toContain("soy wax, 40h burn");
        expect(content).toContain("Tone: luxury");
        expect(content).toMatch(/en:/);
        expect(content).toMatch(/ar:/);
        expect(content).toMatch(/ku:/);
    });

    it("defaults tone to friendly and omits empty optionals", () => {
        const content = buildProductCopyMessages({ name: "Mug" })[0].content;
        expect(content).toContain("Tone: friendly");
        expect(content).not.toContain("Category:");
        expect(content).not.toContain("Extra details:");
    });
});

describe("PRODUCT_COPY_SCHEMA", () => {
    it("is structured-output safe (additionalProperties:false, no length constraints)", () => {
        expect(PRODUCT_COPY_SCHEMA.additionalProperties).toBe(false);
        const str = JSON.stringify(PRODUCT_COPY_SCHEMA);
        expect(str).not.toContain("minLength");
        expect(str).not.toContain("maxLength");
    });
});

describe("parseProductCopy", () => {
    const valid = JSON.stringify({
        en: { title: "T", description: "D" },
        ar: { title: "ع", description: "وصف" },
        ku: { title: "ک", description: "پێناسە" },
    });

    it("parses valid trilingual JSON", () => {
        const c = parseProductCopy(valid);
        expect(c?.ar.title).toBe("ع");
        expect(c?.ku.description).toBe("پێناسە");
    });

    it("rejects missing languages, blank fields, malformed JSON, and null", () => {
        expect(parseProductCopy(JSON.stringify({ en: { title: "T", description: "D" } }))).toBeNull();
        expect(parseProductCopy(JSON.stringify({ en: { title: "", description: "D" }, ar: {}, ku: {} }))).toBeNull();
        expect(parseProductCopy("not json")).toBeNull();
        expect(parseProductCopy(null)).toBeNull();
    });
});
