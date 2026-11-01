import { describe, expect, it } from "vitest";
import type { Order } from "@/lib/supabase";
import { formatLabelDate, formatLabelPhone, generateDispatchLabelHTML, labelCash } from "./dispatch-label";

const order = (over: Partial<Order> = {}): Order =>
    ({
        id: "o1",
        order_id: "122658090",
        customer_name: "حسن مرتضى",
        phone: "+9647827008326",
        secondary_phone: "07827008306",
        city: "البصرة",
        address_details: "ابي الخصيب - حي العسكري - قرب اسواق عبدالله",
        items: [{ name: "انفوي", quantity: 1, price: 34750 }],
        price: 34750,
        delivery_fee: 0,
        payment_status: "cod",
        notes: "",
        created_at: "2026-10-30T05:46:00Z",
        is_return: false,
        is_replacement: false,
        ...over,
    }) as unknown as Order;

describe("formatLabelPhone", () => {
    it("groups Iraqi mobiles 4-3-4 from any prefix", () => {
        expect(formatLabelPhone("+9647827008326")).toBe("0782 700 8326");
        expect(formatLabelPhone("7827008326")).toBe("0782 700 8326");
        expect(formatLabelPhone("0782-700-8326")).toBe("0782 700 8326");
    });
    it("leaves other numbers as digits", () => {
        expect(formatLabelPhone("12345")).toBe("12345");
        expect(formatLabelPhone(null)).toBe("");
    });
});

describe("formatLabelDate", () => {
    it("prints Baghdad time", () => {
        expect(formatLabelDate("2026-10-30T05:46:00Z")).toBe("30.10.2026 08:46");
        expect(formatLabelDate("2026-10-30T22:10:00Z")).toBe("31.10.2026 01:10");
    });
});

describe("labelCash", () => {
    it("collects price plus delivery on a normal order", () => {
        expect(labelCash(order({ price: 34750, delivery_fee: 5000 }))).toEqual({ label: "استلم نقداً", amount: 39750 });
    });
    it("says prepaid when nothing is collected", () => {
        expect(labelCash(order({ payment_status: "paid" }))).toEqual({ label: "مدفوع مسبقاً", amount: 0 });
    });
    it("pays the customer on a refund", () => {
        expect(labelCash(order({ is_return: true, price: -20000, delivery_fee: 0 }))).toEqual({ label: "ادفع للزبون", amount: 20000 });
    });
    it("follows the sign on a replacement", () => {
        expect(labelCash(order({ is_replacement: true, price: -5000 })).label).toBe("ادفع للزبون");
        expect(labelCash(order({ is_replacement: true, price: 5000 })).label).toBe("استلم نقداً");
    });
});

describe("generateDispatchLabelHTML", () => {
    it("escapes customer text", () => {
        const html = generateDispatchLabelHTML(
            order({ customer_name: '<img src=x onerror="alert(1)">', notes: "<b>x</b>", address_details: "a & b" }),
            { showBarcode: true }
        );
        expect(html).not.toContain("<img src=x");
        expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
        expect(html).toContain("&lt;b&gt;x&lt;/b&gt;");
        expect(html).toContain("a &amp; b");
    });
    it("shows the fragile tape, grouped phones and the barcode", () => {
        const html = generateDispatchLabelHTML(order(), { showBarcode: true });
        expect(html).toContain("زجاج · قابل للكسر · يُحمل بعناية");
        expect(html).toContain("0782 700 8326");
        expect(html).toContain("0782 700 8306");
        expect(html).toContain("34,750");
        expect(html).toContain('aria-label="122658090"');
    });
    it("leaves out the backup phone, notes and barcode when absent", () => {
        const html = generateDispatchLabelHTML(order({ secondary_phone: undefined, notes: "" }), { showBarcode: false });
        expect(html).not.toContain("احتياط");
        expect(html).not.toContain("dl-notes");
        expect(html).not.toContain("dl-bc");
    });
    it("puts رقم الوصل over the order number, beside a large QR", () => {
        const html = generateDispatchLabelHTML(order(), { showBarcode: true });
        expect(html).toContain("رقم الوصل");
        expect(html).toMatch(/class="dl-qr"><svg[^>]*width="25\.4mm"/);
    });
    it("shows the Prime logo only when the courier logo is on", () => {
        expect(generateDispatchLabelHTML(order(), { showBarcode: true, courierLogo: { show: true } })).toContain('class="dl-courier" src="data:image/png;base64,');
        expect(generateDispatchLabelHTML(order(), { showBarcode: true, courierLogo: { show: false } })).not.toContain("dl-courier");
    });
});

describe("refund and replacement labels", () => {
    const refund = order({ id: "r1", order_id: "RTN-4030-1", is_return: true, price: -36750, delivery_fee: 5000, items: [{ name: "فيوجن", quantity: 1, price: 36750 }] } as Partial<Order>);
    it("keeps the whole after-sale number and pays the customer from an outlined box", () => {
        const html = generateDispatchLabelHTML(refund, { showBarcode: true });
        expect(html).toContain('aria-label="RTN-4030-1"');
        expect(html).toContain("استرجاع");
        expect(html).toContain('class="dl-cod dl-cod-out"');
        expect(html).toContain("31,750");
        expect(html).toContain("لا تستلم مبلغاً");
    });
    it("lists what to take back and the original order", () => {
        const html = generateDispatchLabelHTML(refund, { showBarcode: true, pickup: { originalOrderNumber: "7616", items: [{ name: "فيوجن", qty: 1 }] } });
        expect(html).toContain("استلم من الزبون");
        expect(html).toContain("عن الطلب #7616");
    });
    it("says nothing comes back when the customer keeps the item", () => {
        const html = generateDispatchLabelHTML(refund, { showBarcode: true, pickup: { originalOrderNumber: "7616", items: [] } });
        expect(html).toContain("لا شيء — الزبون يحتفظ بالمنتج");
    });
    it("shows both directions on a replacement, with a fallback for old orders", () => {
        const rpl = order({ order_id: "RPL-3902-1", is_replacement: true, price: 7000, delivery_fee: 5000, items: [{ name: "فيوجن", quantity: 1, price: 36750 }] } as Partial<Order>);
        const withPickup = generateDispatchLabelHTML(rpl, { showBarcode: true, pickup: { originalOrderNumber: null, items: [{ name: "انفوي", qty: 2 }] } });
        expect(withPickup).toContain("سلّم للزبون");
        expect(withPickup).toContain("انفوي × 2");
        expect(withPickup).toContain("12,000");
        expect(withPickup).not.toContain("dl-cod-out");
        expect(generateDispatchLabelHTML(rpl, { showBarcode: true })).toContain("المنتج القديم (حسب الطلب الأصلي)");
    });
    it("tightens long orders so the barcode keeps its space", () => {
        expect(generateDispatchLabelHTML(order(), { showBarcode: true })).not.toContain("dl-dense");
        expect(generateDispatchLabelHTML(order({ notes: "اتصل قبل الوصول" }), { showBarcode: true })).toContain("dl-dense");
        expect(generateDispatchLabelHTML(order({ address_details: "ح".repeat(80) }), { showBarcode: true })).toContain("dl-dense");
    });
});
