import { describe, it, expect } from "vitest";
import type { Order } from "@/types/order";
import {
    CHIP_PREDICATE_FIELDS,
    ORDER_CHIP_IDS,
    ORDER_CHIP_PREDICATES,
    countOrderChips,
    isOrderChipId,
    isReplacementOrder,
} from "./order-chips";

const STATUSES: Order["status"][] = [
    "new", "contacted", "confirmed", "cancelled", "in_transit", "delivered", "rejected", "completed",
    "no_response", "return_pending", "refund_delivered", "refund_failed", "pending_checkout", "suspended",
];
// A status value the DB might hold that the client does not know yet.
const UNKNOWN_STATUS = "weird" as unknown as Order["status"];

type Row = Pick<Order, "status" | "refund_status" | "is_replacement" | "is_return" | "order_id">;

function crossProduct(): Row[] {
    const rows: Row[] = [];
    for (const status of [...STATUSES, UNKNOWN_STATUS]) {
        for (const refund_status of [undefined, "none", "pending", "refunded", "failed"] as const) {
            for (const is_replacement of [undefined, false, true]) {
                for (const order_id of ["LF-1", "RPL-1"]) {
                    for (const is_return of [undefined, false, true]) {
                        rows.push({ status, refund_status, is_replacement, order_id, is_return } as Row);
                    }
                }
            }
        }
    }
    return rows;
}

describe("order chip table", () => {
    const rows = crossProduct();

    it("countOrderChips equals each predicate's filter length, for all 16 chips", () => {
        const counts = countOrderChips(rows);
        expect(Object.keys(counts).sort()).toEqual([...ORDER_CHIP_IDS].sort());
        for (const id of ORDER_CHIP_IDS) {
            expect({ id, n: counts[id] }).toEqual({ id, n: rows.filter(ORDER_CHIP_PREDICATES[id]).length });
        }
    });

    it("reaches every known-status row from some chip except the status-only refund rows (owner decision 2)", () => {
        // refund_delivered / refund_failed rows that are not returns, not
        // refunded/pending and not replacements are reachable only from "all":
        // refunds = is_return, the rule the list has always used.
        const unreachable = (r: Row) =>
            (r.status === "refund_delivered" || r.status === "refund_failed") &&
            r.is_return !== true &&
            (r.refund_status === undefined || r.refund_status === "none" || r.refund_status === "failed") &&
            r.is_replacement !== true &&
            !r.order_id?.startsWith("RPL-");

        for (const r of rows.filter((x) => x.status !== UNKNOWN_STATUS)) {
            const chips = ORDER_CHIP_IDS.filter((id) => id !== "all" && ORDER_CHIP_PREDICATES[id](r));
            expect({ r, any: chips.length > 0 }).toEqual({ r, any: !unreachable(r) });
        }
    });

    it("completed excludes refunded, refund-pending and replacement orders (owner decision 1)", () => {
        const p = ORDER_CHIP_PREDICATES.completed;
        expect(p({ status: "completed", order_id: "LF-1", is_return: false, is_replacement: false })).toBe(true);
        expect(p({ status: "completed", order_id: "LF-1", is_return: false, is_replacement: false, refund_status: "failed" })).toBe(true);
        expect(p({ status: "completed", order_id: "LF-1", is_return: false, is_replacement: false, refund_status: "refunded" })).toBe(false);
        expect(p({ status: "completed", order_id: "LF-1", is_return: false, is_replacement: false, refund_status: "pending" })).toBe(false);
        expect(p({ status: "completed", order_id: "LF-1", is_return: false, is_replacement: true })).toBe(false);
        expect(p({ status: "completed", order_id: "RPL-9", is_return: false, is_replacement: false })).toBe(false);
    });

    it("confirmed includes return_pending", () => {
        expect(ORDER_CHIP_PREDICATES.confirmed({ status: "return_pending", order_id: "x", is_return: true, is_replacement: false })).toBe(true);
    });

    it("reads exactly CHIP_PREDICATE_FIELDS", () => {
        const read = new Set<string>();
        const tracked = (r: Row) => new Proxy(r, {
            get(target, key) {
                if (typeof key === "string") read.add(key);
                return Reflect.get(target, key);
            },
        });
        for (const r of rows) for (const id of ORDER_CHIP_IDS) ORDER_CHIP_PREDICATES[id](tracked(r));
        expect([...read].sort()).toEqual([...CHIP_PREDICATE_FIELDS].sort());
    });

    it("isOrderChipId and isReplacementOrder", () => {
        expect(isOrderChipId("refund_pending")).toBe(true);
        expect(isOrderChipId("return_pending")).toBe(false);
        expect(isOrderChipId("needs_review")).toBe(false);
        expect(isReplacementOrder({ is_replacement: false, order_id: "RPL-1" })).toBe(true);
        expect(isReplacementOrder({ is_replacement: true, order_id: "LF-1" })).toBe(true);
        expect(isReplacementOrder({ is_replacement: false, order_id: "LF-1" })).toBe(false);
    });
});
