import { describe, it, expect } from "vitest";
import { EMPTY_ADVANCED_FILTERS } from "@/components/products/advanced-filters";
import { parseFilterParam } from "./product-filter-param";

const enc = (v: unknown) => btoa(JSON.stringify(v));

describe("parseFilterParam", () => {
    it("fills a stored empty object with 'no filter' defaults, never undefined", () => {
        expect(parseFilterParam(enc({}))).toEqual(EMPTY_ADVANCED_FILTERS);
    });

    it("keeps valid fields and resets invalid ones", () => {
        const out = parseFilterParam(enc({ priceMin: 5000, stockStatus: "bogus", visibility: "hidden", salesMax: "x" }));
        expect(out).toMatchObject({ priceMin: 5000, stockStatus: "all", visibility: "hidden", salesMax: null });
    });

    it("returns null for garbage and non-objects", () => {
        expect(parseFilterParam("%%%")).toBeNull();
        expect(parseFilterParam(enc([1, 2]))).toBeNull();
        expect(parseFilterParam(enc("x"))).toBeNull();
    });
});
