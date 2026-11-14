import { describe, expect, it } from "vitest";
import {
    extractCallbackData,
    extractPhone,
    extractResponseText,
    matchResponse,
    parseInteraktInbound,
} from "./interakt-inbound";

describe("Interakt inbound payload", () => {
    it("reads a button tap with its order id and phone", () => {
        const p = parseInteraktInbound({
            type: "message_received",
            data: {
                customer: { phone_number: "7801234567", country_code: "+964" },
                message: { button_reply: { title: " تأكيد ✅ " }, context: { callback_data: "order-1" } },
            },
        });
        expect(extractResponseText(p.data)).toBe("تأكيد ✅");
        expect(matchResponse("تأكيد ✅")).toBe("confirmed");
        expect(matchResponse("تأكيد الطلب")).toBe("confirmed");
        expect(extractCallbackData(p.data)).toBe("order-1");
        expect(extractPhone(p.data)).toBe("9647801234567");
    });

    it("treats a field of the wrong type as missing instead of failing", () => {
        const p = parseInteraktInbound({ type: 5, data: { message: { text: 42, button_text: "إلغاء" }, customer: "x" } });
        expect(p.type).toBeUndefined();
        expect(extractResponseText(p.data)).toBe("إلغاء");
        expect(matchResponse("إلغاء")).toBe("cancelled");
        expect(matchResponse("إلغاء الطلب")).toBe("cancelled");
        expect(extractPhone(p.data)).toBeNull();
    });

    it("reads a non-object body as empty", () => {
        expect(parseInteraktInbound(null)).toEqual({});
        expect(parseInteraktInbound("hi")).toEqual({});
        expect(matchResponse("شكرا")).toBeNull();
    });
});
