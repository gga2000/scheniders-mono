import { describe, expect, it } from "vitest";
import { buildPrimeShipment, primeAddress, primePhone, primeShipmentHash, primeUpdateFields } from "./shipment-payload";
import { PRIME_LIMITS } from "./client";
import type { CourierSheetOrder } from "@/lib/shipping/courier-sheets";

const merchant = { merchantLoginId: "kut_store", shopId: 5510 };

const order = (extra: Partial<CourierSheetOrder> = {}): CourierSheetOrder => ({
    order_id: "12603020",
    customer_name: "Zahraa",
    phone: "+9647701234567",
    secondary_phone: "",
    city: "",
    governorate_code: "BAS",
    validated_governorate_code: undefined,
    address_details: "Ashar, near the corniche",
    items: [{ name: "Envoy", quantity: 2, price: 25000 }] as CourierSheetOrder["items"],
    notes: "Call before",
    price: 50000,
    delivery_fee: 5000,
    discount_amount: 0,
    payment_status: "cod",
    is_return: false,
    is_replacement: false,
    ...extra,
});

describe("primePhone", () => {
    it.each([
        ["+9647701234567", "07701234567"],
        ["9647701234567", "07701234567"],
        ["07701234567", "07701234567"],
        ["770 123 4567", "07701234567"],
    ])("%s → %s", (input, expected) => expect(primePhone(input)).toBe(expected));

    it.each(["", "12345", "0612345678", null, undefined])("rejects %s", (input) => expect(primePhone(input)).toBeNull());
});

describe("buildPrimeShipment", () => {
    it("sends what the label and the Excel file send: receipt, COD, pieces, notes, products", () => {
        const result = buildPrimeShipment(order(), merchant);
        expect(result).toEqual({
            ok: true,
            payload: {
                merchantLoginId: "kut_store",
                senderId: 5510,
                custReceiptNoOri: "12603020",
                senderSystemCaseIdWithCharacters: "12603020",
                senderSystemCaseId: 12603020,
                receiverName: "Zahraa",
                receiverHp1: "07701234567",
                state: "BAS",
                locationDetails: "Ashar, near the corniche",
                receiptAmtIqd: 55000,
                qty: 2,
                productInfo: "Envoy",
                rmk: "Call before",
                haveReturnItems: "N",
            },
        });
    });

    it("strips the CHK- prefix from the receipt number like the label does, and keeps the full id alongside", () => {
        const result = buildPrimeShipment(order({ order_id: "CHK-4261102017" }), merchant);
        expect(result.ok && result.payload.custReceiptNoOri).toBe("4261102017");
        expect(result.ok && result.payload.senderSystemCaseIdWithCharacters).toBe("CHK-4261102017");
        // Prime's numeric id column only takes a plain number.
        expect(result.ok && "senderSystemCaseId" in result.payload).toBe(false);
    });

    it("gives the driver the city with the street details, unless the details already name it", () => {
        expect(primeAddress({ city: "بابل", address_details: "الحله - نادر الاولى" })).toBe("بابل - الحله - نادر الاولى");
        expect(primeAddress({ city: "كربلاء", address_details: "كربلاء / الحر / مجمع اللؤلؤة" })).toBe("كربلاء / الحر / مجمع اللؤلؤة");
        expect(primeAddress({ city: "بغداد", address_details: "" })).toBe("بغداد");
        expect(primeAddress({ city: "", address_details: "حي الجامعة" })).toBe("حي الجامعة");
        const result = buildPrimeShipment(order({ city: "البصرة" }), merchant);
        expect(result.ok && result.payload.locationDetails).toBe("البصرة - Ashar, near the corniche");
    });

    it("cuts text to what Prime's columns hold, since a longer value is refused without a message", () => {
        const result = buildPrimeShipment(
            order({ customer_name: "ن".repeat(140), address_details: "ع".repeat(700), notes: "م".repeat(700), items: [{ name: "ع".repeat(700), quantity: 1, price: 1 }] as CourierSheetOrder["items"] }),
            merchant,
        );
        expect(result.ok && result.payload.receiverName).toHaveLength(PRIME_LIMITS.receiverName);
        expect(result.ok && result.payload.locationDetails).toHaveLength(PRIME_LIMITS.locationDetails);
        expect(result.ok && result.payload.rmk).toHaveLength(PRIME_LIMITS.rmk);
        expect(result.ok && result.payload.productInfo.length).toBeLessThanOrEqual(PRIME_LIMITS.productInfo);
    });

    it("a receipt number Prime cannot store, or an amount outside its range, stays on the Excel file", () => {
        expect(buildPrimeShipment(order({ order_id: "9".repeat(41) }), merchant)).toEqual({ ok: false, reason: "bad_receipt" });
        expect(buildPrimeShipment(order({ price: 6_000_000 }), merchant)).toEqual({ ok: false, reason: "amount_out_of_range" });
    });

    it("prepaid: collects nothing, declares the goods value and tells the courier", () => {
        const result = buildPrimeShipment(order({ payment_status: "prepaid" }), merchant);
        expect(result.ok && result.payload).toMatchObject({ receiptAmtIqd: 0, undeclaredShipmentValue: 50000 });
        expect(result.ok && result.payload.rmk).toContain("طلب مدفوع مسبقا");
    });

    it("prepaid with no goods value cannot go through the API", () => {
        expect(buildPrimeShipment(order({ payment_status: "paid", price: 0 }), merchant)).toEqual({ ok: false, reason: "no_value" });
    });

    it("adds a valid second phone, drops an invalid or repeated one", () => {
        const two = buildPrimeShipment(order({ secondary_phone: "07801112222" }), merchant);
        expect(two.ok && two.payload.receiverHp2).toBe("07801112222");
        const bad = buildPrimeShipment(order({ secondary_phone: "123" }), merchant);
        expect(bad.ok && "receiverHp2" in bad.payload).toBe(false);
        const same = buildPrimeShipment(order({ secondary_phone: "+9647701234567" }), merchant);
        expect(same.ok && "receiverHp2" in same.payload).toBe(false);
    });

    it("prefers the validated governorate and reads it from the city when the order has no code", () => {
        const validated = buildPrimeShipment(order({ governorate_code: "BGD", validated_governorate_code: "KOT" }), merchant);
        expect(validated.ok && validated.payload.state).toBe("KOT");
        const fromCity = buildPrimeShipment(order({ governorate_code: undefined, city: "النجف" }), merchant);
        expect(fromCity.ok && fromCity.payload.state).toBe("NJF");
    });

    it.each<[string, Partial<CourierSheetOrder>, string]>([
        ["refunds", { is_return: true }, "after_sale"],
        ["replacements", { is_replacement: true }, "after_sale"],
        ["no governorate", { governorate_code: undefined, city: "" }, "no_governorate"],
        ["a phone Prime would reject", { phone: "0770123" }, "bad_phone"],
    ])("leaves %s to the Excel file", (_label, extra, reason) => {
        expect(buildPrimeShipment(order(extra), merchant)).toEqual({ ok: false, reason });
    });
});

describe("primeUpdateFields / primeShipmentHash", () => {
    const built = buildPrimeShipment(order({ secondary_phone: "07801112222" }), merchant);
    const payload = built.ok ? built.payload : null;

    it("sends update-shipment every field it replaces, and never the receipt or our ids", () => {
        expect(payload).not.toBeNull();
        if (!payload) return;
        expect(primeUpdateFields(payload)).toEqual({
            senderId: 5510,
            receiverName: "Zahraa",
            receiverHp1: "07701234567",
            receiverHp2: "07801112222",
            state: "BAS",
            locationDetails: "Ashar, near the corniche",
            receiptAmtIqd: 55000,
            qty: 2,
            productInfo: "Envoy",
            rmk: "Call before",
            haveReturnItems: "N",
        });
    });

    it("gives the same fingerprint for the same details and a new one for any change Prime would see", () => {
        if (!payload) return;
        const fields = primeUpdateFields(payload);
        expect(primeShipmentHash(fields)).toBe(primeShipmentHash({ ...fields }));
        expect(primeShipmentHash({ ...fields, receiverHp1: "07709998888" })).not.toBe(primeShipmentHash(fields));
        // An internal note is not part of the shipment, so it never makes a call.
        const internal = buildPrimeShipment({ ...order({ secondary_phone: "07801112222" }), internal_notes: "VIP" } as CourierSheetOrder, merchant);
        expect(internal.ok && primeShipmentHash(primeUpdateFields(internal.payload))).toBe(primeShipmentHash(fields));
    });
});

