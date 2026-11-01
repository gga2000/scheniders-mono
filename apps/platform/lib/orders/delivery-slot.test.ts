import { describe, expect, it } from "vitest";
import { DeliverySlotSchema, formatDeliverySlot, parseDeliverySlot } from "./delivery-slot";

describe("delivery slot", () => {
    it("accepts the three presets and a 24h time, nothing else", () => {
        for (const ok of ["morning", "afternoon", "evening", "00:00", "09:30", "23:59"]) {
            expect(DeliverySlotSchema.safeParse(ok).success).toBe(true);
        }
        for (const bad of ["night", "24:00", "9:30", "12:60", "", "16:30:00"]) {
            expect(DeliverySlotSchema.safeParse(bad).success).toBe(false);
        }
    });

    it("reads stored values back, dropping junk", () => {
        expect(parseDeliverySlot("evening")).toBe("evening");
        expect(parseDeliverySlot("16:30")).toBe("16:30");
        expect(parseDeliverySlot("later")).toBeUndefined();
        expect(parseDeliverySlot(null)).toBeUndefined();
    });

    it("formats presets with their hours and times on a 12h clock", () => {
        expect(formatDeliverySlot("morning", "ar")).toBe("صباحاً 9–12");
        expect(formatDeliverySlot("evening", "en")).toBe("Evening 4–8");
        expect(formatDeliverySlot("16:30", "ar")).toBe("4:30 م");
        expect(formatDeliverySlot("00:05", "en")).toBe("12:05 AM");
        expect(formatDeliverySlot("12:00", "en")).toBe("12:00 PM");
    });
});
