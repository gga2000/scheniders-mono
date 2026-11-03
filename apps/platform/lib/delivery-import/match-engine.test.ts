import { describe, expect, it } from "vitest";
import { matchParsedRows } from "./match-engine";
import type { ParsedPDFRow } from "@/types/delivery-import";
import type { Order } from "@/types/order";

const pdfRow: ParsedPDFRow = {
    rowNumber: 1, storeName: "Scheniders", shipmentNumber: "12603020", address: "Basra", phone: "07701234567",
    shipmentAmount: 50000, deliveryFee: 5000, netToMerchant: 45000, status: "تم التسليم", itemCount: 1,
    entryDate: "2026-11-03", notes: "", isNegative: false, isPriceChanged: false, isPartialDelivery: false, isReorder: false,
};

const order = (status: Order["status"]) =>
    ({ id: "o1", order_id: "12603020", phone: "07701234567", price: 50000, status, is_return: false, created_at: "2026-11-01T10:00:00Z" }) as Order;

describe("matchParsedRows with the Prime link", () => {
    it("an order the link already delivered is a clean match on the statement", () => {
        const [match] = matchParsedRows([pdfRow], [order("delivered")], new Set(["o1"]));
        expect(match.category).toBe("clean");
    });

    it("an order delivered some other way is still flagged as already delivered", () => {
        const [match] = matchParsedRows([pdfRow], [order("delivered")]);
        expect(match.category).toBe("already_delivered");
    });

    it("a completed order stays flagged even if the link delivered it", () => {
        const [match] = matchParsedRows([pdfRow], [order("completed")], new Set(["o1"]));
        expect(match.category).toBe("already_delivered");
    });
});
