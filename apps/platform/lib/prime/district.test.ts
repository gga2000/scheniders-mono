import { describe, expect, it } from "vitest";
import { primeDistrictIdFor, primeDistrictOfOrder, primeDistrictsInAddress, primeStateOf, readPrimeDistrict } from "./district";

const mansour = { id: 212, name: "المنصور", state: "BGD" };

describe("readPrimeDistrict", () => {
    it("reads the stored shape and nothing else", () => {
        expect(readPrimeDistrict(mansour)).toEqual(mansour);
        expect(readPrimeDistrict(null)).toBeNull();
        expect(readPrimeDistrict({ id: "212", name: "المنصور", state: "BGD" })).toBeNull();
        expect(readPrimeDistrict({ id: 212, name: " ", state: "BGD" })).toBeNull();
        expect(readPrimeDistrict({ id: 212, name: "المنصور", state: "bgd" })).toBeNull();
    });
});

describe("primeStateOf / primeDistrictIdFor / primeDistrictOfOrder", () => {
    const at = (city: string, prime_district: unknown = mansour) => ({
        city,
        governorate_code: undefined,
        validated_governorate_code: undefined,
        address_details: undefined,
        prime_district: prime_district as typeof mansour | null,
    });

    it("reads Prime's state from the governorate", () => {
        expect(primeStateOf(at("بغداد"))).toBe("BGD");
        expect(primeStateOf(at("واسط"))).toBe("KOT");
        expect(primeStateOf(at(""))).toBeNull();
    });

    it("keeps a district only for its own governorate", () => {
        expect(primeDistrictIdFor(mansour, "BGD")).toBe(212);
        expect(primeDistrictIdFor(mansour, "BAS")).toBeUndefined();
        expect(primeDistrictOfOrder(at("بغداد"))).toEqual(mansour);
        expect(primeDistrictOfOrder(at("البصرة"))).toBeNull();
        expect(primeDistrictOfOrder(at("بغداد", null))).toBeNull();
    });
});

describe("primeDistrictsInAddress", () => {
    const list = [
        { id: 1, name: "الجهاد الاولى" },
        { id: 2, name: "الجهاد" },
        { id: 3, name: "الكرادة" },
        { id: 4, name: "الامين" },
        { id: 5, name: "حي" },
    ];

    it("finds districts named as whole words, folding hamza and ta marbuta", () => {
        expect(primeDistrictsInAddress("بغداد - الكراده، قرب الجسر", list).map((d) => d.id)).toEqual([3]);
        expect(primeDistrictsInAddress("حي الأمين شارع ٥", list).map((d) => d.id)).toEqual([4]);
    });

    it("prefers the longer name and drops the one inside it", () => {
        expect(primeDistrictsInAddress("الجهاد الأولى قرب الجامع", list).map((d) => d.id)).toEqual([1]);
    });

    it("does not match inside a longer word, ignores very short names, and stops at the limit", () => {
        expect(primeDistrictsInAddress("الامينية", list)).toEqual([]);
        expect(primeDistrictsInAddress("", list)).toEqual([]);
        expect(primeDistrictsInAddress("الكرادة الامين الجهاد", list).map((d) => d.id)).toEqual([3, 4]);
    });
});
