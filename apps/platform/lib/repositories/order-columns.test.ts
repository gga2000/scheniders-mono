import { describe, expect, it } from "vitest";
import { EXPORT_COLUMNS, LIST_COLUMNS } from "./order-columns";

/**
 * Checked-in copy of `public.orders`' columns on the NEW project
 * (sduvpgqwhxragxtxztur), pulled 2026-10-12 with:
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
    "last_followup_type", "attribution", "ad_channel",
]);

/** Masked by `v_orders_with_risk` for non-admins; the table does not mask them. */
const MARGIN_COLUMNS = ["product_cost", "net_profit", "waseet_merchant_price", "waseet_company_price"];

function names(select: string): string[] {
    return select.split(",").map(c => c.trim());
}

describe.each([
    ["LIST_COLUMNS", LIST_COLUMNS],
    ["EXPORT_COLUMNS", EXPORT_COLUMNS],
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

describe("LIST_COLUMNS", () => {
    it("carries what the list needs beyond the old view: channel chips + trust key", () => {
        const cols = names(LIST_COLUMNS);
        for (const c of ["attribution", "ad_channel", "scheduled_date", "tenant_id", "phone"]) {
            expect(cols).toContain(c);
        }
    });

    it("does not request risk_data — it is attached after the fetch", () => {
        expect(names(LIST_COLUMNS)).not.toContain("risk_data");
    });
});
