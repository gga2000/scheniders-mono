import { describe, expect, it } from "vitest";
import { isEmptyVoiceOrder, parseVoiceOrder } from "./order-from-voice";

describe("parseVoiceOrder", () => {
    it("takes a clean reply as is", () => {
        expect(parseVoiceOrder(JSON.stringify({
            customer_name: " حيدر كاظم ",
            phone: "07701234567",
            secondary_phone: "",
            city: "بغداد",
            address: "الكرادة قرب جامع الأورفلي",
            notes: "قطعتين، اتصلوا بعد العصر",
        }))).toEqual({
            customer_name: "حيدر كاظم",
            phone: "07701234567",
            secondary_phone: "",
            city: "بغداد",
            address: "الكرادة قرب جامع الأورفلي",
            notes: "قطعتين، اتصلوا بعد العصر",
        });
    });

    it("normalises spoken phones to the stored form", () => {
        const order = parseVoiceOrder(JSON.stringify({ phone: "٠٧٧٠ ١٢٣ ٤٥٦٧", secondary_phone: "+964 780 111 2222" }));
        expect(order.phone).toBe("07701234567");
        expect(order.secondary_phone).toBe("07801112222");
    });

    it("keeps only a governorate the form offers", () => {
        expect(parseVoiceOrder(JSON.stringify({ city: "البصرة" })).city).toBe("البصرة");
        expect(parseVoiceOrder(JSON.stringify({ city: "لندن" })).city).toBe("");
    });

    it("empties missing and wrong-typed fields", () => {
        expect(parseVoiceOrder(JSON.stringify({ customer_name: 7, notes: null }))).toEqual({
            customer_name: "", phone: "", secondary_phone: "", city: "", address: "", notes: "",
        });
        expect(isEmptyVoiceOrder(parseVoiceOrder("[]"))).toBe(true);
    });

    it("throws on a reply that is not JSON", () => {
        expect(() => parseVoiceOrder("sorry, I could not hear")).toThrow();
    });
});
