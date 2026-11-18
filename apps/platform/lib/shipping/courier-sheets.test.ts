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

    it("reads a phone typed in Arabic digits instead of dropping it", () => {
        const [row] = primeSheet([order({ phone: "٠٧٧٠١٢٣٤٥٦٧", secondary_phone: "+964 780 111 2223" })]).rows;
        expect(row["هاتف المستلم"]).toBe("7701234567");
        expect(row["هاتف المستلم 2"]).toBe("7801112223");
    });

    it("names the size or colour of each item for the courier", () => {
        const items = [
            { name: "قميص", variant_name: "XL / أبيض", quantity: 1, price: 20000 },
            { name: "Serum", quantity: 1, price: 25000 },
        ] as CourierSheetOrder["items"];
        expect(waseetSheet([order({ items })]).rows[0]["نوع البضاعه"]).toBe("قميص (XL / أبيض) + Serum");
        expect(primeSheet([order({ items })]).rows[0]["نوع البضاعة"]).toBe("قميص (XL / أبيض) + Serum");
    });
});
