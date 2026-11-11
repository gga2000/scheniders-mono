import { describe, expect, it } from "vitest";
import {
    arabicMonth,
    baghdadMonth,
    buildMonthlyInvoice,
    chargeKind,
    monthlyInvoiceDocument,
    monthRange,
    recentMonths,
    type InvoiceTransaction,
} from "./monthly-invoice";

function tx(partial: Partial<InvoiceTransaction>): InvoiceTransaction {
    return {
        type: "charge",
        amount_iqd: 0,
        balance_after_iqd: 0,
        description: null,
        reference_id: null,
        payment_method: null,
        created_at: "2026-11-05T10:00:00Z",
        ...partial,
    };
}

describe("monthly invoice dates", () => {
    it("uses Baghdad time for month edges", () => {
        expect(monthRange("2026-11")).toEqual({ start: "2026-10-31T21:00:00.000Z", end: "2026-11-30T21:00:00.000Z" });
        expect(monthRange("2026-12").end).toBe("2026-12-31T21:00:00.000Z");
        // 22:30 UTC on 31 Oct is already 1 Nov in Baghdad.
        expect(baghdadMonth(new Date("2026-10-31T22:30:00Z"))).toBe("2026-11");
    });

    it("lists recent months newest first, across a year end", () => {
        expect(recentMonths(new Date("2027-02-10T12:00:00Z"), 4)).toEqual(["2027-02", "2027-01", "2026-12", "2026-11"]);
    });

    it("names the month in Iraqi Arabic", () => {
        expect(arabicMonth("2026-11")).toBe("تشرين الثاني 2026");
    });
});

describe("buildMonthlyInvoice", () => {
    it("groups every fee the billing functions write and keeps top-ups apart", () => {
        const inv = buildMonthlyInvoice({
            month: "2026-11",
            storeName: "متجر",
            displayId: 100095,
            openingBalance: 0,
            transactions: [
                tx({ type: "topup", amount_iqd: 25000, balance_after_iqd: 25000, payment_method: "qi_card", created_at: "2026-11-03T08:00:00Z" }),
                tx({ amount_iqd: -9000, balance_after_iqd: 16000, description: "Monthly subscription - starter", created_at: "2026-11-03T09:00:00Z" }),
                tx({ amount_iqd: -55, balance_after_iqd: 15945, description: "Delivered order 4261102017", reference_id: "delivered:a" }),
                tx({ amount_iqd: -55, balance_after_iqd: 15890, description: "Delivered order 4261102018", reference_id: "delivered:b" }),
                tx({ amount_iqd: -30, balance_after_iqd: 15860, description: "WhatsApp confirmation 4261102017" }),
                tx({ amount_iqd: -80, balance_after_iqd: 15780, description: "WhatsApp offer 4261102018", created_at: "2026-11-20T10:00:00Z" }),
            ],
        });
        expect(inv.number).toBe("100095-2026-11");
        expect(inv.lines).toEqual([
            { kind: "monthly", count: 1, total: 9000 },
            { kind: "delivered", count: 2, total: 110 },
            { kind: "whatsappConfirm", count: 1, total: 30 },
            { kind: "whatsappOffer", count: 1, total: 80 },
        ]);
        expect(inv.charged).toBe(9220);
        expect(inv.topups).toEqual([{ at: "2026-11-03T08:00:00Z", amount: 25000, method: "qi_card" }]);
        expect(inv.closingBalance).toBe(15780);
        // Opening + top-ups − fees = closing: the page always adds up.
        expect(inv.openingBalance + 25000 - inv.charged).toBe(inv.closingBalance);
    });

    it("carries the balance through a month with no movements", () => {
        const inv = buildMonthlyInvoice({ month: "2026-12", storeName: "s", displayId: null, openingBalance: 4200, transactions: [] });
        expect(inv.lines).toEqual([]);
        expect(inv.charged).toBe(0);
        expect(inv.closingBalance).toBe(4200);
        expect(inv.number).toBe("0-2026-12");
    });

    it("reads amounts that arrive as strings from numeric columns", () => {
        const inv = buildMonthlyInvoice({
            month: "2026-11",
            storeName: "s",
            displayId: 1,
            openingBalance: 100,
            transactions: [tx({ amount_iqd: "-55" as unknown as number, balance_after_iqd: "45" as unknown as number, description: "Delivered order 1" })],
        });
        expect(inv.charged).toBe(55);
        expect(inv.closingBalance).toBe(45);
    });

    it("files unknown charges under other fees instead of dropping them", () => {
        expect(chargeKind("Something new")).toBe("other");
        expect(chargeKind(null)).toBe("other");
        expect(chargeKind("Order charge")).toBe("orderCharge");
    });
});

describe("monthlyInvoiceDocument", () => {
    it("prints the store, the period and the totals, and escapes the store name", () => {
        const html = monthlyInvoiceDocument(
            buildMonthlyInvoice({
                month: "2026-11",
                storeName: "<b>متجر</b>",
                displayId: 100095,
                openingBalance: 0,
                transactions: [
                    tx({ type: "topup", amount_iqd: 25000, balance_after_iqd: 25000, payment_method: "qi_card" }),
                    tx({ amount_iqd: -9000, balance_after_iqd: 16000, description: "Monthly subscription - starter" }),
                ],
            }),
        );
        expect(html).toContain('<html lang="ar" dir="rtl">');
        expect(html).toContain("&lt;b&gt;متجر&lt;/b&gt; (#100095)");
        expect(html).not.toContain("<b>متجر</b>");
        expect(html).toContain("تشرين الثاني 2026");
        expect(html).toContain("الاشتراك الشهري");
        expect(html).toContain("كي كارد");
        expect(html).toContain("16,000 د.ع");
        expect(html).toContain("لا توجد ضريبة");
    });
});
