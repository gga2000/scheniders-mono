import { describe, expect, it } from "vitest";
import { primeCallRecord, primePhoneKey, primePhoneVariants, PRIME_CALL_RECENT_MAX } from "./call-record";

const row = (orderId: string, status: string | null, sentAt: string) => ({ orderId, status, sentAt });

describe("primeCallRecord", () => {
    it("counts the customer's other parcels by how they ended, leaving out the order on the call and Prime's own cancels", () => {
        const record = primeCallRecord(
            [
                row("a", "DELIVERED", "2026-08-02T10:00:00Z"),
                row("b", "FAILED_DELIVER_RETURNED_TO_SENDER", "2026-09-10T10:00:00Z"),
                row("c", "DELIVERED_CHANGE_PRICE", "2026-10-01T10:00:00Z"),
                row("d", "CNCL", "2026-10-05T10:00:00Z"),
                row("e", "ONWAY", "2026-11-01T10:00:00Z"),
                row("now", "ONWAY", "2026-11-03T10:00:00Z"),
            ],
            "now",
        );
        expect(record).toMatchObject({ parcels: 4, delivered: 2, returned: 1, moving: 1, returnedInARow: 0 });
        expect(record.recent.map((p) => p.kind)).toEqual(["delivered", "returned", "delivered", "moving"]);
    });

    it("sorts by send time and keeps only the newest tiles", () => {
        const rows = Array.from({ length: PRIME_CALL_RECENT_MAX + 2 }, (_, i) => row(`o${i}`, "DELIVERED", `2026-10-${String(20 - i).padStart(2, "0")}T10:00:00Z`));
        const record = primeCallRecord(rows, "none");
        expect(record.recent).toHaveLength(PRIME_CALL_RECENT_MAX);
        expect(record.recent[0]?.at).toBe("2026-10-15T10:00:00Z");
        expect(record.recent.at(-1)?.at).toBe("2026-10-20T10:00:00Z");
    });

    it("counts the returns in a row at the end, looking past parcels still out", () => {
        const record = primeCallRecord(
            [
                row("a", "DELIVERED", "2026-08-02T10:00:00Z"),
                row("b", "FAILED_DELIVER_RETURNED_TO_SENDER", "2026-09-10T10:00:00Z"),
                row("c", "FAILED_DELIVER_RETURNED_TO_SENDER", "2026-10-01T10:00:00Z"),
                row("d", "POSTPONED", "2026-10-20T10:00:00Z"),
            ],
            "x",
        );
        expect(record.returnedInARow).toBe(2);
    });

    it("is empty for a customer new to Prime", () => {
        expect(primeCallRecord([], "x")).toEqual({ parcels: 0, delivered: 0, returned: 0, moving: 0, recent: [], returnedInARow: 0 });
    });
});

describe("primePhoneKey / primePhoneVariants", () => {
    it("reads any spelling of an Iraqi number as the same key", () => {
        expect(primePhoneKey("0770 455 2318")).toBe("7704552318");
        expect(primePhoneKey("+964 770 455 2318")).toBe("7704552318");
        expect(primePhoneKey("7704552318")).toBe("7704552318");
        expect(primePhoneKey("—")).toBe("");
    });

    it("lists the stored spellings to look the customer up by", () => {
        expect(primePhoneVariants("0770 455 2318")).toEqual(["0770 455 2318", "07704552318", "9647704552318", "+9647704552318", "7704552318"]);
        expect(primePhoneVariants("")).toEqual([]);
    });
});
