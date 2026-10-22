/**
 * Who gets the instant WhatsApp confirmation for a STOREFRONT order.
 *
 * The storefront hands only an order id to QStash. Everything the decision
 * needs is re-read from the orders row here, and the tenant is the row's own:
 * never a value from the message. Interakt is one global sender (a single
 * INTERAKT_API_KEY), so a tenant must also be listed in
 * STOREFRONT_WA_CONFIRM_TENANT_IDS: only tenants whose customers expect
 * messages from that number.
 *
 * Used by app/api/webhooks/storefront-order. Pure, no I/O.
 */

import { z } from "zod";

/** The columns the decision reads. Validated because the row comes from an
 *  untyped `select("*")`. A row without `confirmation_dispatched_at` means
 *  migration 20261021130000 is not applied, and must fail loudly rather than
 *  look unclaimed. */
export const storefrontOrderGateRowSchema = z.object({
    id: z.string().uuid(),
    tenant_id: z.string().uuid().nullable(),
    phone: z.string(),
    source: z.string().nullable(),
    is_test: z.boolean().nullable(),
    status: z.string(),
    deleted_at: z.string().nullable(),
    confirmation_dispatched_at: z.string().nullable(),
});

export type StorefrontOrderGateRow = z.infer<typeof storefrontOrderGateRowSchema>;

export type StorefrontConfirmationSkip =
    | "not_storefront"
    | "test_order"
    | "deleted"
    | "not_new"
    | "tenant_not_enabled"
    | "already_dispatched";

export type StorefrontConfirmationVerdict =
    | { send: true; tenantId: string }
    | { send: false; reason: StorefrontConfirmationSkip };

/** STOREFRONT_WA_CONFIRM_TENANT_IDS → a set of lower-cased tenant uuids.
 *  env.ts has already refused a malformed list at boot. */
export function parseConfirmTenantIds(raw: string | undefined): ReadonlySet<string> {
    return new Set(
        (raw ?? "")
            .split(",")
            .map((s) => s.trim().toLowerCase())
            .filter(Boolean),
    );
}

export function storefrontConfirmationVerdict(
    row: StorefrontOrderGateRow,
    enabledTenants: ReadonlySet<string>,
): StorefrontConfirmationVerdict {
    if (row.source !== "storefront") return { send: false, reason: "not_storefront" };
    // Only an explicit false is a shopper's order: a draft-view test order is
    // flagged true, and NULL is not known to be real.
    if (row.is_test !== false) return { send: false, reason: "test_order" };
    if (row.deleted_at !== null) return { send: false, reason: "deleted" };
    if (row.status !== "new") return { send: false, reason: "not_new" };
    if (!row.tenant_id || !enabledTenants.has(row.tenant_id.toLowerCase())) {
        return { send: false, reason: "tenant_not_enabled" };
    }
    if (row.confirmation_dispatched_at !== null) return { send: false, reason: "already_dispatched" };
    return { send: true, tenantId: row.tenant_id };
}
