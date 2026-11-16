import { describe, expect, it } from "vitest";
import { paymentReceiptDocument, paymentReceiptNumber, type PaymentReceipt } from "./payment-receipt";

const RECEIPT: PaymentReceipt = {
    receiptNo: 42,
    legalName: "شركة فيرمي",
    storeName: "متجر تجريبي",
    displayId: 100095,
    method: "qi_card",
    sentIqd: 9000,
    creditedIqd: 9000,
    sentAt: "2026-11-16T08:00:00Z",
    approvedAt: "2026-11-16T11:05:00Z",
};

describe("paymentReceiptNumber", () => {
    it("pads the database's number so receipts sort and read alike", () => {
        expect(paymentReceiptNumber(42)).toBe("R-000042");
        expect(paymentReceiptNumber(1_234_567)).toBe("R-1234567");
    });
});

describe("paymentReceiptDocument", () => {
    it("prints the number, the legal name, the shop, the method and the amount, in Baghdad time", () => {
        const html = paymentReceiptDocument(RECEIPT);
        expect(html).toContain('<html lang="ar" dir="rtl">');
        expect(html).toContain("R-000042");
        expect(html).toContain("شركة فيرمي");
        expect(html).toContain("متجر تجريبي (#100095)");
        expect(html).toContain("كي كارد");
        expect(html).toContain("9,000 د.ع");
        // 11:05 UTC is 14:05 in Baghdad.
        expect(html).toContain("16 تشرين الثاني 2026");
        expect(html).toContain("14:05");
        expect(html).toContain("لا توجد ضريبة");
        expect(html).not.toContain("المبلغ الذي ذكره المتجر");
    });

    it("shows both figures when what arrived differs from what the shop said", () => {
        const html = paymentReceiptDocument({ ...RECEIPT, sentIqd: 10_000, creditedIqd: 9000 });
        expect(html).toContain("المبلغ الذي ذكره المتجر");
        expect(html).toContain("10,000 د.ع");
        expect(html).toContain("9,000 د.ع");
    });

    it("falls back to our brand name until the legal name is set, and escapes what shops and staff typed", () => {
        const html = paymentReceiptDocument({ ...RECEIPT, legalName: "  ", storeName: "<b>x</b>", displayId: null });
        expect(html).toContain('<div class="brand">شنايدر</div>');
        expect(html).toContain("&lt;b&gt;x&lt;/b&gt;");
        expect(html).not.toContain("<b>x</b>");
        expect(paymentReceiptDocument({ ...RECEIPT, legalName: "<i>L</i>" })).toContain("&lt;i&gt;L&lt;/i&gt;");
    });
});
