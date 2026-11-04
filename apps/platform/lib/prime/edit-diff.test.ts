import { describe, expect, it } from "vitest";
import { primeEditDiff } from "./edit-diff";
import { primeTakesEdits } from "./status-map";
import type { CourierSheetOrder } from "@/lib/shipping/courier-sheets";

const order = (extra: Partial<CourierSheetOrder> = {}): CourierSheetOrder => ({
    order_id: "12603020",
    customer_name: "زينب علي",
    phone: "07719082264",
    secondary_phone: "",
    city: "بغداد",
    governorate_code: undefined,
    validated_governorate_code: undefined,
    address_details: "المنصور شارع 14 رمضان",
    items: [{ name: "Envoy", quantity: 1, price: 31750 }] as CourierSheetOrder["items"],
    notes: "",
    price: 31750,
    delivery_fee: 5000,
    discount_amount: 0,
    payment_status: "cod",
    is_return: false,
    is_replacement: false,
    prime_district: null,
    ...extra,
});

describe("primeEditDiff", () => {
    it("lists only what Prime holds, old and new as staff read them", () => {
        const diff = primeEditDiff(
            order(),
            order({ phone: "0781 220 7713", address_details: "اليرموك قرب المستشفى", price: 29750, discount_amount: 2000 }),
        );
        expect(diff).toEqual({
            kind: "changes",
            changes: [
                { field: "phone", before: "07719082264", after: "07812207713" },
                { field: "address", before: "بغداد - المنصور شارع 14 رمضان", after: "بغداد - اليرموك قرب المستشفى" },
                { field: "amount", before: "36,750", after: "34,750" },
            ],
            amountBefore: 36750,
            amountAfter: 34750,
            stateAfter: "BGD",
            districtAfter: null,
        });
    });

    it("is null when nothing Prime holds changed (a respaced phone, an internal note)", () => {
        expect(primeEditDiff(order(), order({ phone: "0771 908 2264" }))).toBeNull();
        expect(primeEditDiff(order(), { ...order(), internal_notes: "VIP" } as CourierSheetOrder)).toBeNull();
    });

    it("names the governorate and area by their names", () => {
        const diff = primeEditDiff(
            order({ prime_district: { id: 344, name: "المنصور", state: "BGD" } }),
            order({ city: "البصرة", address_details: "العشار", prime_district: { id: 41, name: "العشار", state: "BAS" } }),
        );
        expect(diff?.kind === "changes" && diff.changes.filter((c) => c.field === "governorate" || c.field === "area")).toEqual([
            { field: "governorate", before: "بغداد", after: "البصرة" },
            { field: "area", before: "المنصور", after: "العشار" },
        ]);
        expect(diff?.kind === "changes" && diff.districtAfter).toBe(41);
    });

    it("says when Prime cannot take the edited order", () => {
        expect(primeEditDiff(order(), order({ phone: "0771908226" }))).toEqual({ kind: "blocked", reason: "bad_phone" });
    });
});

describe("primeTakesEdits", () => {
    it("is open orders whose parcel Prime has not finished with", () => {
        expect(primeTakesEdits("confirmed", null)).toBe(true);
        expect(primeTakesEdits("in_transit", "ONWAY")).toBe(true);
        expect(primeTakesEdits("in_transit", "POSTPONED")).toBe(true);
        expect(primeTakesEdits("in_transit", "DELIVERED")).toBe(false);
        expect(primeTakesEdits("in_transit", "FAILED_DELIVER_RETURNED_TO_SENDER")).toBe(false);
        expect(primeTakesEdits("delivered", "ONWAY")).toBe(false);
        expect(primeTakesEdits("cancelled", null)).toBe(false);
    });
});
