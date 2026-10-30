import { describe, expect, it } from "vitest";
import { primeSheet, waseetSheet, type CourierSheetOrder } from "./courier-sheets";

const order = (extra: Partial<CourierSheetOrder> = {}): CourierSheetOrder => ({
    order_id: "1001",
    customer_name: "Zahraa",
    phone: "+9647701234567",
    secondary_phone: "",
    city: "",
    governorate_code: "NJF",
    validated_governorate_code: undefined,
    address_details: "Kufa",
    items: [{ name: "Serum", quantity: 2, price: 25000 }] as CourierSheetOrder["items"],
    notes: "",
    price: 50000,
    delivery_fee: 5000,
    discount_amount: 0,
    payment_status: "cod",
    is_return: false,
    is_replacement: false,
    ...extra,
});

describe("courier sheets", () => {
    it("Prime: COD is price plus delivery, the receipt number is the base order number", () => {
        const [row] = primeSheet([order({ order_id: "RTN-1001-1", is_return: true })]).rows;
        expect(row).toMatchObject({
            "المبلغ عراقي": 55000,
            "رقم الوصل": "1001",
            "يحتوي على ارجاع بضاعة؟": "Y",
            "هاتف المستلم": "7701234567",
            "شفرة المحافظة": "NJF",
            "عدد القطع": 2,
        });
    });

    it("Al-Waseet: the governorate comes from the code even when the city names none", () => {
        const [row] = waseetSheet([order()]).rows;
        expect(row["المحافظة"]).not.toBe("");
        expect(row["السعر مع التوصيل"]).toBe(55000);
    });

    it("prepaid orders collect nothing and tell the courier why", () => {
        const [row] = waseetSheet([order({ payment_status: "prepaid", notes: "call first" })]).rows;
        expect(row["السعر مع التوصيل"]).toBe(0);
        expect(row["الملاحظات"]).toBe("طلب مدفوع مسبقا - call first");
    });
});
