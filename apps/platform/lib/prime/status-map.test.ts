import { describe, expect, it } from "vitest";
import { clearPrimeAttention, primeStatusAction, withPrimeAttention } from "./status-map";

describe("primeStatusAction", () => {
    it("only a plain delivery moves the order", () => {
        expect(primeStatusAction("DELIVERED")).toEqual({ kind: "deliver" });
    });

    it.each([
        ["PART_DELIVERED", "delivery_partial_delivery"],
        ["DELIVERED_CHANGE_PRICE", "delivery_price_changed"],
        ["FAILED_DELIVER_RETURNED_TO_SENDER", "delivery_returning"],
        ["CNCL", "delivery_courier_cancelled"],
    ])("%s raises %s and leaves the status alone", (status, reason) => {
        expect(primeStatusAction(status)).toEqual({ kind: "flag", reason });
    });

    it.each(["ONWAY", "POSTPONED", "SOMETHING_NEW", null, undefined])("%s: still with the courier", (status) => {
        expect(primeStatusAction(status)).toEqual({ kind: "none" });
    });
});

describe("withPrimeAttention", () => {
    it("replaces an earlier Prime reason and keeps everyone else's", () => {
        expect(withPrimeAttention(["cod_risk_new_customer", "delivery_returning"], "delivery_courier_cancelled")).toEqual([
            "cod_risk_new_customer",
            "delivery_courier_cancelled",
        ]);
    });

    it("starts a list when the order had none", () => {
        expect(withPrimeAttention(null, "delivery_returning")).toEqual(["delivery_returning"]);
    });
});

describe("clearPrimeAttention", () => {
    it("drops Prime's flags on delivery and keeps the rest", () => {
        expect(clearPrimeAttention(["delivery_returning", "cod_risk_new_customer"])).toEqual({
            needs_attention: true,
            attention_reasons: ["cod_risk_new_customer"],
        });
        expect(clearPrimeAttention(["delivery_returning"])).toEqual({ needs_attention: false, attention_reasons: [] });
    });

    it("writes nothing when Prime never flagged the order", () => {
        expect(clearPrimeAttention(["cod_risk_new_customer"])).toBeNull();
        expect(clearPrimeAttention(null)).toBeNull();
    });
});
