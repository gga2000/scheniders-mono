import { describe, expect, it } from "vitest";
import type { Order, OrderFilters } from "@/types/order";
import { CHIP_PREDICATE_FIELDS } from "@/lib/orders/order-chips";
import { filterOrders } from "@/lib/orders/filter-orders";
import {
    EXPORT_COLUMNS,
    LIST_COLUMNS,
    LIST_COLUMN_NAMES,
    ORDER_MARGIN_COLUMNS,
    ORDER_READ_COLUMNS,
    pickListColumns,
} from "./order-columns";

/**
 * Checked-in copy of `public.orders`' columns on the NEW project
 * (sduvpgqwhxragxtxztur), pulled 2026-10-12 (plus confirmation_dispatched_at,
 * 20261021130000, live 2026-10-22) with:
 *
 *   select column_name from information_schema.columns
 *   where table_schema = 'public' and table_name = 'orders'
 *   order by ordinal_position;
 *
 * Refresh it when a migration adds or drops an `orders` column. Its only job
 * is to make a typo or a not-yet-migrated column in a select string fail here
 * instead of as a production 400 that blanks the orders page.
 */
const ORDERS_TABLE_COLUMNS = new Set([
    "id", "created_at", "updated_at", "order_id", "customer_name", "phone", "city",
    "governorate_code", "address_details", "items", "price", "status", "whatsapp_link",
    "notes", "rejection_reason", "scheduled_date", "priority", "payment_status",
    "delivery_fee", "discount_amount", "is_return", "original_order_id", "is_archived",
    "secondary_phone", "delivery_slot", "source", "sequence_number", "delivered_at",
    "cancelled_at", "printed_at", "print_count", "last_batch_id", "is_gift", "tag_color",
    "is_pinned", "delivery_order_id", "is_reviewed", "is_verified_customer",
    "contact_count", "address_status", "address_issues", "validated_governorate_code",
    "internal_notes", "assigned_to", "assigned_at", "product_cost", "net_profit",
    "is_shop_order", "risk_metadata", "needs_attention", "attention_reasons",
    "original_created_at", "last_contacted_at", "last_status_changed_by_name",
    "last_status_changed_by_avatar", "is_test", "delivery_note", "is_replacement",
    "delivery_company", "waseet_qr_id", "waseet_qr_link", "waseet_status_id",
    "waseet_status_text", "waseet_merchant_price", "waseet_company_price",
    "waseet_submitted_at", "waseet_invoice_id", "completed_at", "version", "tenant_id",
    "refund_status", "refunded_at", "delivered_source", "reason_id", "deleted_at",
    "idempotency_key", "waseet_submit_started_at", "whatsapp_contact_slot",
    "last_followup_by_name", "last_followup_by_avatar", "last_followup_at",
    "last_followup_type", "attribution", "ad_channel", "confirmation_dispatched_at",
]);

/** Masked by `v_orders_with_risk` for non-admins; the table does not mask them. */
const MARGIN_COLUMNS = ["product_cost", "net_profit", "waseet_merchant_price", "waseet_company_price"];

function names(select: string): string[] {
    return select.split(",").map(c => c.trim());
}

describe.each([
    ["LIST_COLUMNS", LIST_COLUMNS],
    ["EXPORT_COLUMNS", EXPORT_COLUMNS],
    ["ORDER_READ_COLUMNS", ORDER_READ_COLUMNS],
])("%s", (_label, select) => {
    it("names only real `orders` columns", () => {
        const unknown = names(select).filter(c => !ORDERS_TABLE_COLUMNS.has(c));
        expect(unknown).toEqual([]);
    });

    it("is a plain comma list PostgREST accepts verbatim", () => {
        for (const c of names(select)) expect(c).toMatch(/^[a-z_]+$/);
    });

    it("never selects a margin column the table leaves unmasked", () => {
        expect(names(select).filter(c => MARGIN_COLUMNS.includes(c))).toEqual([]);
    });

    it("has no duplicate columns", () => {
        const cols = names(select);
        expect(new Set(cols).size).toBe(cols.length);
    });
});

describe("ORDER_READ_COLUMNS (the full-row read that replaced select(\"*\"))", () => {
    // Migration 20261021090000 revokes `authenticated`'s SELECT on the margin
    // columns, so `select=*` on `orders` is refused (42501) for every signed-in
    // caller. This is the column set those reads use instead: every column the
    // table has except the margin columns.
    it("is every `orders` column except the margin columns", () => {
        const expected = [...ORDERS_TABLE_COLUMNS].filter(c => !MARGIN_COLUMNS.includes(c)).sort();
        expect(names(ORDER_READ_COLUMNS).sort()).toEqual(expected);
    });

    it("exports the margin set the migration revokes", () => {
        expect([...ORDER_MARGIN_COLUMNS].sort()).toEqual([...MARGIN_COLUMNS].sort());
    });
});

describe("LIST_COLUMNS", () => {
    it("carries what the list needs beyond the old view: channel chips + trust key", () => {
        const cols = names(LIST_COLUMNS);
        for (const c of ["attribution", "ad_channel", "scheduled_date", "tenant_id", "phone"]) {
            expect(cols).toContain(c);
        }
    });

    it("carries is_verified_customer — the duplicate detector and its dismissal both read it", () => {
        // Without it every list row arrives `undefined`, so "Not a duplicate"
        // and "Same customer" are written but never seen, and the banner returns.
        expect(names(LIST_COLUMNS)).toContain("is_verified_customer");
    });

    it("carries every field a status-chip predicate reads", () => {
        // Missing, a predicate reads `undefined` on every row: the Refunded chip
        // and the list it opens were both empty for 53 refunded orders.
        const cols = names(LIST_COLUMNS);
        expect(CHIP_PREDICATE_FIELDS.filter((f) => !cols.includes(f))).toEqual([]);
    });

    it("carries every row field the list filter reads", () => {
        const read = new Set<string>();
        const row = new Proxy({ id: "o1", status: "completed", items: [{ name: "x" }], created_at: "2026-10-12T08:00:00.000Z", notes: "", customer_name: "Customer 1" } as unknown as Order, {
            get(target, key) {
                if (typeof key === "string") read.add(key);
                return Reflect.get(target, key);
            },
        });
        const variants: OrderFilters[] = [
            // `needs_review` is not in the status union but the filter still honours it.
            { status: "needs_review" as OrderFilters["status"] }, { status: "completed" }, { status: "refunds" }, { status: "refunded" },
            { status: "replacements" }, { status: "return_pending" }, { orderType: "refund" }, { orderType: "replacement" },
            { dateFrom: "2026-10-12", dateTo: "2026-10-12" }, { city: "Basra" }, { product: "x" }, { priority: "urgent" },
            { paymentStatus: "cod" }, { adChannel: "instagram" }, { isReturn: true },
        ];
        for (const f of variants) filterOrders([row], f);
        const cols = names(LIST_COLUMNS);
        expect([...read].filter((k) => !cols.includes(k))).toEqual([]);
    });

    it("does not request risk_data — it is attached after the fetch", () => {
        expect(names(LIST_COLUMNS)).not.toContain("risk_data");
    });
});

describe("pickListColumns (realtime payload projection)", () => {
    // A realtime postgres_changes payload carries the whole row: every column
    // the subscriber has SELECT on, which for `authenticated` is all of them.
    const fullRow: Record<string, unknown> = Object.fromEntries(
        [...ORDERS_TABLE_COLUMNS].map((c) => [c, `v:${c}`]),
    );

    it("keeps exactly the LIST_COLUMNS keys", () => {
        expect(Object.keys(pickListColumns(fullRow)).sort()).toEqual([...LIST_COLUMN_NAMES].sort());
    });

    it("drops the margin columns and the idempotency key", () => {
        const picked = pickListColumns(fullRow);
        for (const c of [...MARGIN_COLUMNS, "idempotency_key"]) expect(picked).not.toHaveProperty(c);
    });

    it("does not invent keys a partial payload lacks", () => {
        expect(pickListColumns({ id: "o1", product_cost: 900 })).toEqual({ id: "o1" });
    });
});
