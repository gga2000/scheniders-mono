import { describe, expect, it } from "vitest";
import {
    PRODUCT_DETAIL_COLUMNS,
    PRODUCT_DETAIL_FIELDS,
    PRODUCT_LIST_COLUMNS,
    PRODUCT_READ_COLUMNS,
    PRODUCT_WITH_VARIANTS_COLUMNS,
} from "./product-columns";

const columns = (list: string) => list.split(",").map((c) => c.trim());

describe("product column lists", () => {
    it("keeps the long detail fields out of the catalogue list", () => {
        const list = columns(PRODUCT_LIST_COLUMNS);
        for (const field of PRODUCT_DETAIL_FIELDS) expect(list).not.toContain(field);
        expect(PRODUCT_WITH_VARIANTS_COLUMNS.startsWith(`${PRODUCT_LIST_COLUMNS}, variants:`)).toBe(true);
    });

    it("reads every list and detail field on a full product read", () => {
        expect(columns(PRODUCT_READ_COLUMNS).sort()).toEqual([...columns(PRODUCT_LIST_COLUMNS), ...PRODUCT_DETAIL_FIELDS].sort());
    });

    it("reads the editor's detail fields by id", () => {
        expect(columns(PRODUCT_DETAIL_COLUMNS)).toEqual(["id", "description", "dimensions_json", "feature_cards"]);
    });
});
