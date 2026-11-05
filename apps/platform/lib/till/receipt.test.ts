import { describe, expect, it } from "vitest";
import { receiptDocument, receiptTime, receiptWhatsAppText, whatsAppReceiptLink, type ReceiptData } from "./receipt";

const sale: ReceiptData = {
    storeName: "شنايدرز",
    shop: { name: "فرع المنصور", address: "بغداد", phone: "07702148890", receipt_footer: "الإرجاع خلال 7 أيام" },
    orderNumber: "4261104026",
    cashier: "نور",
    at: "2026-11-04T15:42:00.000Z",
    lines: [
        { name: "Envoy", variant_name: "100 ml", quantity: 2, price: 45_000 },
        { name: "<b>Bag</b>", variant_name: null, quantity: 1, price: 2_000 },
    ],
    subtotal: 92_000,
    discount: 2_000,
    total: 90_000,
    payments: [
        { method: "card", amount: 40_000 },
        { method: "cash", amount: 50_000, tendered: 60_000 },
    ],
    change: 10_000,
    customerName: "أحمد",
};

describe("till receipt", () => {
    it("prints Baghdad time", () => {
        expect(receiptTime(sale.at)).toBe("2026/11/04 · 18:42");
    });

    it("has the lines, discount, payments and change, and escapes names", () => {
        const html = receiptDocument(sale);
        expect(html).toContain('dir="rtl"');
        expect(html).toContain("2 × Envoy 100 ml");
        expect(html).toContain("90,000");
        expect(html).toContain("−2,000");
        expect(html).toContain("60,000");
        expect(html).toContain("10,000");
        expect(html).toContain("&lt;b&gt;Bag&lt;/b&gt;");
        expect(html).not.toContain("<b>Bag</b>");
    });

    it("carries a QR of the sale number for returns", () => {
        const html = receiptDocument(sale);
        expect(html).toContain('<div class="qr"><svg');
        expect(html).toContain("امسح الرمز للإرجاع أو التبديل");
    });

    it("builds the WhatsApp text and link", () => {
        const text = receiptWhatsAppText(sale);
        expect(text).toContain("فاتورتك: 4261104026");
        expect(text).toContain("المجموع: 90,000 د.ع");
        expect(whatsAppReceiptLink("07702148890", "hi")).toBe("https://wa.me/9647702148890?text=hi");
    });
});
