import { describe, expect, it } from "vitest";
import { dangerBandOf, dangerCounts, orderTrust, trustByOrderId } from "./danger";

const trust = new Map([["7701111111", 10], ["7702222222", 49], ["7703333333", 50], ["7704444444", 79]]);
const o = (id: string, phone: string) => ({ id, phone });

describe("Shield danger level", () => {
    it("reads the customer's score from any phone format", () => {
        expect(orderTrust({ phone: "07701111111" }, trust)).toBe(10);
        expect(orderTrust({ phone: "+964 770 222 2222" }, trust)).toBe(49);
        expect(orderTrust({ phone: "0770999" }, trust)).toBeNull();
    });

    it("under 50 high, 50-79 medium, everyone else low, whatever the order status", () => {
        expect(dangerBandOf({ phone: "07701111111" }, trust)).toBe("red");
        expect(dangerBandOf({ phone: "07702222222" }, trust)).toBe("red");
        expect(dangerBandOf({ phone: "07703333333" }, trust)).toBe("yellow");
        expect(dangerBandOf({ phone: "07704444444" }, trust)).toBe("yellow");
        expect(dangerBandOf({ phone: "07705555555" }, trust)).toBe("green");
    });

    it("counts every order", () => {
        const rows = [o("a", "07701111111"), o("b", "07703333333"), o("c", "07704444444"), o("d", "07705555555"), o("e", "bad")];
        expect(dangerCounts(rows, trust)).toEqual({ red: 1, yellow: 2, green: 2 });
        expect([...trustByOrderId(rows, trust)]).toEqual([["a", 10], ["b", 50], ["c", 79]]);
    });
});
