import { describe, it, expect, vi, beforeEach } from "vitest";

/*
 * The Prime statement parser feeds "use PDF price" on delivered orders, so a
 * misread cell becomes a wrong order price. pdf-parse is replaced by the
 * text and tables it hands back for a statement; the rows follow the real
 * layout (12 columns, right to left, Arabic presentation forms) with made-up
 * customers and amounts.
 */

const pdf = vi.hoisted(() => ({
    text: "",
    tables: [] as { num: number; tables: string[][][] }[],
}));

vi.mock("pdf-parse", () => ({
    PDFParse: class {
        async getText() {
            return { pages: [{ text: pdf.text }] };
        }
        async getTable() {
            return { pages: pdf.tables };
        }
        async destroy() {}
    },
}));

import { parseAmount, parsePrimeDeliveryPDF, UnreadableAmountError } from "./pdf-parser";

const HEADER_TEXT = [
    "2026-03-07",
    "16:43:12 تاريخ الدفع:",
    "123456 إيصال",
    "متجر تجريبي إسم التاجر",
    "علي مندوب الاستلام",
    "3 عدد الشحنات",
].join("\n");

// [notes, entryDate, itemCount, status, net, fee, amount, phone, address, shipment, store, row]
const NORMAL = ["", "2026-03-05", "1", "ﺗﻢ ﺍﻟﺘﺴﻠﻴﻢ", "29,000", "6,000", "35,000", "07701234567", "ﺑﻐﺪﺍﺩ - ﺍﻟﻜﺮﺍﺩﺓ", "12603020\n01", "ﻣﺘﺠﺮ", "1"];
const PRICE_CHANGE = ["Reorder from #4370", "2026-03-05", "ﺗﻢ ﺍﻟﺘﺴﻠﻴﻢ - ﻣﻊ ﺗﻐﻴﻴﺮ ﺳﻌﺮ 2", "ﺍﻟﺸﺤﻨﺔ ﻣﻦ 40,000, ﺇﻟﻰ\n30,000", "24,000", "6,000", "30,000", "07801234567 ﺍﻟﺒﺼﺮﺓ", "ﺍﻟﺒﺼﺮﺓ", "1260302002", "ﻣﺘﺠﺮ", "2"];
const PARTIAL = ["", "2026-03-06", "1", "ﺗﺴﻠﻴﻢ ﺟﺰﺋﻴ", "10,000-", "6,000", "4,000-", "07501234567", "ﺃﺭﺑﻴﻞ", "1260302003", "ﻣﺘﺠﺮ", "3"];
const HEAD_ROW = ["ﻣﻼﺣﻈﺎﺕ", "ﺍﻟﺘﺎﺭﻳﺦ", "ﺍﻟﻌﺪﺩ", "ﺍﻟﺤﺎﻟﺔ", "ﺍﻟﺼﺎﻓﻲ", "ﺍﻟﺘﻮﺻﻴﻞ", "ﺍﻟﻤﺒﻠﻎ", "ﺍﻟﻬﺎﺗﻒ", "ﺍﻟﻌﻨﻮﺍﻥ", "ﺭﻗﻢ ﺍﻟﺸﺤﻨﺔ", "ﺍﻟﻤﺘﺠﺮ", "#"];
const SUMMARY = [["ﺩﺍﺋﻦ", "ﻣﺪﻳﻦ", ""], ["0", "5,000", "ﺍﻟﺮﺻﻴﺪ ﺍﻟﺴﺎﺑﻖ"], ["43,000", "-", "ﺻﺎﻓﻲ"], ["-", "38,000", "ﺍﻟﻤﺪﻓﻮﻉ"], ["0", "0", "ﺍﻟﺮﺻﻴﺪ ﺍﻟﺠﺪﻳﺪ"]];

function statement(rows: string[][], footer = "43,000", head = HEAD_ROW) {
    pdf.text = HEADER_TEXT;
    pdf.tables = [{ num: 1, tables: [SUMMARY, [head, ...rows], [[footer, "ﻣﺒﻠﻎ ﺍﻟﻮﺻﻮﻻﺕ ﺑﻌﺪ ﺍﻟﺘﻮﺻﻴﻞ"]]] }];
    return parsePrimeDeliveryPDF(Buffer.from("pdf"));
}

beforeEach(() => {
    pdf.text = "";
    pdf.tables = [];
});

describe("parsePrimeDeliveryPDF", () => {
    it("reads every field of a normal, a price-change and a partial row", async () => {
        const out = await statement([NORMAL, PRICE_CHANGE, PARTIAL]);

        expect(out.header).toEqual({
            merchantName: "متجر تجريبي",
            paymentDate: "2026-03-07 16:43:12",
            receiptNumber: "123456",
            receivingAgent: "علي",
            totalShipments: 3,
        });
        expect(out.financials).toEqual({
            previousBalanceDebit: 5000, previousBalanceCredit: 0,
            netReceiptsAmount: 43000, amountPaid: 38000,
            newBalanceDebit: 0, newBalanceCredit: 0,
        });

        const [normal, changed, partial] = out.rows;
        expect(normal).toMatchObject({
            rowNumber: 1, shipmentNumber: "1260302001", phone: "07701234567",
            shipmentAmount: 35000, deliveryFee: 6000, netToMerchant: 29000,
            itemCount: 1, isPriceChanged: false, isPartialDelivery: false, isNegative: false, isReorder: false,
        });
        expect(changed).toMatchObject({
            rowNumber: 2, phone: "07801234567", shipmentAmount: 30000, netToMerchant: 24000,
            itemCount: 2, isPriceChanged: true, originalPrice: 40000, newPrice: 30000,
            isReorder: true, reorderReference: "4370",
        });
        expect(partial).toMatchObject({
            rowNumber: 3, shipmentAmount: -4000, netToMerchant: -10000,
            isPartialDelivery: true, isNegative: true,
        });

        // 29,000 + 24,000 - 10,000 = 43,000, the footer.
        expect(out.footerTotal).toBe(43000);
        expect(out.validationErrors).toEqual([]);
    });

    it("reports a row whose money cell it cannot read, instead of pricing it 0", async () => {
        const bad = [...NORMAL];
        bad[6] = "35.000 IQD";
        const out = await statement([bad, PRICE_CHANGE, PARTIAL]);

        expect(out.rows.map((r) => r.rowNumber)).toEqual([2, 3]);
        expect(out.validationErrors).toContain('Row 1: unreadable amount "35.000 IQD"');
        expect(out.validationErrors.some((e) => e.startsWith("Row count mismatch"))).toBe(true);
    });

    it("drops a table whose column count changed, and says the rows are missing", async () => {
        const out = await statement(
            [[...NORMAL, "x"], [...PRICE_CHANGE, "x"], [...PARTIAL, "x"]],
            "43,000",
            [...HEAD_ROW, "ﺟﺪﻳﺪ"],
        );
        // 13 columns is not the order table: nothing is read from it, so no
        // amount is taken from a shifted column.
        expect(out.rows).toEqual([]);
        expect(out.validationErrors).toContain("Row count mismatch: parsed 0 rows, header says 3");
    });

    it("flags a footer that does not match the rows", async () => {
        const out = await statement([NORMAL, PRICE_CHANGE, PARTIAL], "50,000");
        expect(out.validationErrors).toEqual(["Total mismatch: calculated 43,000 IQD, footer says 50,000 IQD"]);
    });
});

describe("parseAmount", () => {
    it("reads statement amounts", () => {
        expect(parseAmount("25,000")).toBe(25000);
        expect(parseAmount("1,250,000")).toBe(1250000);
        expect(parseAmount("25000")).toBe(25000);
        expect(parseAmount("-5,000")).toBe(-5000);
        expect(parseAmount("5,000-")).toBe(-5000);
        expect(parseAmount("٢٥٬٠٠٠")).toBe(25000);
        expect(parseAmount("25,\n000")).toBe(25000);
        expect(parseAmount("-")).toBe(0);
        expect(parseAmount("")).toBe(0);
    });

    it("refuses anything else", () => {
        for (const cell of ["25.000", "25,00", "IQD 25,000", "abc", "-5,000-", "1,2345"]) {
            expect(() => parseAmount(cell), cell).toThrow(UnreadableAmountError);
        }
    });
});
