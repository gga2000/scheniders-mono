import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { fromSheetRows, toSheetRows } from "./vault-sheets";
import { VaultError } from "./vault-progress";
import type { VaultRow } from "./vault-schema";

/** Writes rows to a real workbook and reads them back, as an Excel backup and restore does. */
function throughWorkbook(rows: VaultRow[]): VaultRow[] {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Sheet");
    const read = XLSX.read(XLSX.write(wb, { type: "array", bookType: "xlsx" }), { type: "array" });
    return XLSX.utils.sheet_to_json<VaultRow>(read.Sheets.Sheet);
}

const product: VaultRow = {
    id: "p1",
    name: "Oud",
    price: 25000,
    gallery_urls: ["a.jpg", "b.jpg"],
    feature_cards: [{ title: "Long lasting", icon: "clock" }],
    dimensions_json: { width: 5, height: 12 },
    lightfunnels_aliases: ["oud-50ml", "oud"],
};

describe("spreadsheet round trip", () => {
    it("loses list and object cells without the JSON step (why the step exists)", () => {
        const plain = throughWorkbook([product]);
        expect(plain[0]).not.toHaveProperty("gallery_urls");
        expect(plain[0]).not.toHaveProperty("feature_cards");
    });

    it("keeps a product's lists and objects through a workbook", () => {
        const back = fromSheetRows("products", throughWorkbook(toSheetRows("products", [product])));
        expect(back[0]).toEqual(product);
    });

    it("keeps an order's items, attribution and text lists", () => {
        const order: VaultRow = {
            id: "o1",
            items: [{ product_id: "p1", quantity: 2 }],
            risk_metadata: { score: 3 },
            attribution: { source: "instagram" },
            address_issues: ["no landmark"],
            attention_reasons: ["high value"],
        };
        expect(fromSheetRows("orders", throughWorkbook(toSheetRows("orders", [order])))[0]).toEqual(order);
    });

    it("gives a required column its empty value and leaves other empty cells out", () => {
        const back = fromSheetRows("orders", [{ id: "o2", items: "", risk_metadata: "", attribution: "" }]);
        expect(back[0]).toEqual({ id: "o2", items: [], risk_metadata: {} });
    });

    it("refuses a damaged JSON cell instead of guessing", () => {
        expect(() => fromSheetRows("products", [{ id: "p1", gallery_urls: "[not json" }])).toThrow(VaultError);
    });
});
