import { describe, it, expect } from "vitest";
import {
    parseConfirmTenantIds,
    storefrontConfirmationVerdict,
    storefrontOrderGateRowSchema,
    type StorefrontOrderGateRow,
} from "./storefront-order-confirmation";

const TENANT = "44444444-4444-4444-8444-444444444444";
const OTHER = "55555555-5555-4555-8555-555555555555";
const enabled = parseConfirmTenantIds(TENANT);

function row(overrides: Partial<StorefrontOrderGateRow> = {}): StorefrontOrderGateRow {
    return {
        id: "33333333-3333-4333-8333-333333333333",
        tenant_id: TENANT,
        phone: "07701234567",
        source: "storefront",
        is_test: false,
        status: "new",
        deleted_at: null,
        confirmation_dispatched_at: null,
        ...overrides,
    };
}

describe("parseConfirmTenantIds", () => {
    it("reads a comma-separated list, trimmed and lower-cased", () => {
        expect([...parseConfirmTenantIds(` ${TENANT.toUpperCase()} , ${OTHER},, `)]).toEqual([TENANT, OTHER]);
    });

    it("an unset or empty list enables nobody", () => {
        expect(parseConfirmTenantIds(undefined).size).toBe(0);
        expect(parseConfirmTenantIds("").size).toBe(0);
    });
});

describe("storefrontConfirmationVerdict", () => {
    it("sends for a new, live, non-test storefront order of an enabled tenant, naming the row's tenant", () => {
        expect(storefrontConfirmationVerdict(row(), enabled)).toEqual({ send: true, tenantId: TENANT });
    });

    it.each<[string, Partial<StorefrontOrderGateRow>]>([
        ["not_storefront", { source: "lightfunnels" }],
        ["not_storefront", { source: null }],
        ["test_order", { is_test: true }],
        ["test_order", { is_test: null }],
        ["deleted", { deleted_at: "2026-10-21T10:00:00Z" }],
        ["not_new", { status: "contacted" }],
        ["tenant_not_enabled", { tenant_id: OTHER }],
        ["tenant_not_enabled", { tenant_id: null }],
        ["already_dispatched", { confirmation_dispatched_at: "2026-10-21T10:00:00Z" }],
    ])("skips with %s", (reason, overrides) => {
        expect(storefrontConfirmationVerdict(row(overrides), enabled)).toEqual({ send: false, reason });
    });

    it("an empty allowlist sends to nobody", () => {
        expect(storefrontConfirmationVerdict(row(), parseConfirmTenantIds(undefined))).toEqual({
            send: false,
            reason: "tenant_not_enabled",
        });
    });
});

describe("storefrontOrderGateRowSchema", () => {
    it("accepts a full orders row", () => {
        const full: Record<string, unknown> = { ...row(), price: 35000, items: [], customer_name: "علي" };
        const parsed = storefrontOrderGateRowSchema.safeParse(full);
        expect(parsed.success).toBe(true);
    });

    it("rejects a row without confirmation_dispatched_at (migration not applied)", () => {
        const legacy: Record<string, unknown> = { ...row() };
        delete legacy.confirmation_dispatched_at;
        expect(storefrontOrderGateRowSchema.safeParse(legacy).success).toBe(false);
    });
});
