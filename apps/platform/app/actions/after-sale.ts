"use server";

import { z } from "zod";
import { createSupabaseServiceClient } from "@/lib/supabase-server";
import { ORDER_WRITE_ROLES, resolveCaller } from "@/lib/auth/resolve-order-caller";
import { isAdminRole } from "@/lib/permissions";
import { assertNotBlocked, TenantBlockedError } from "@/lib/restrictions";
import { canCreateOrder } from "@/lib/tenant";
import { chargeAndTrack } from "@/lib/order-service";
import { reportOrderError } from "@/lib/order-telemetry";

// =============================================
// AFTER-SALE ORDERS (refunds and replacements)
// =============================================

/**
 * What the refund and replacement sheets send. Amounts are not part of it:
 * create_after_sale_order prices every line from the original order, so a
 * caller can choose what comes back, never what it is worth.
 */
const afterSaleInputSchema = z
    .object({
        kind: z.enum(["refund", "replacement"]),
        originalOrderId: z.uuid(),
        lines: z
            .array(
                z.object({
                    originalLine: z.int().min(0),
                    qty: z.int().positive(),
                    expectsBack: z.boolean().default(true),
                }),
            )
            .min(1),
        outLines: z
            .array(
                z.object({
                    productId: z.uuid(),
                    variantId: z.uuid().nullable(),
                    qty: z.int().positive(),
                }),
            )
            .default([]),
        /** Null takes the tenant's default fee. */
        feeKept: z.int().min(0).nullable().default(null),
        chargeFee: z.boolean().default(true),
        reasonId: z.uuid().nullable().default(null),
        reason: z.string().trim().max(200).nullable().default(null),
        notes: z.string().trim().max(1000).nullable().default(null),
    })
    .refine((v) => v.lines.every((l) => l.expectsBack) || !!v.notes, {
        message: "A note is required when the customer keeps the item",
        path: ["notes"],
    });

export type AfterSaleInput = z.input<typeof afterSaleInputSchema>;

export type AfterSaleResult =
    | { success: true; orderId: string; orderNumber: string }
    | { success: false; error: string };

const tenantAfterSaleSchema = z
    .object({ after_sale: z.object({ refund_courier_note: z.string().trim().min(1) }).partial().optional() })
    .loose();

const createdSchema = z.object({ id: z.uuid(), order_id: z.string() });

export async function createAfterSaleOrderAction(
    input: AfterSaleInput,
    accessToken: string,
): Promise<AfterSaleResult> {
    const resolved = await resolveCaller(accessToken);
    if ("error" in resolved) return { success: false, error: resolved.error };
    const { userId, tenantId, role } = resolved.caller;
    if (!ORDER_WRITE_ROLES.includes(role)) {
        return { success: false, error: "You do not have permission to create orders" };
    }

    const parsed = afterSaleInputSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid request" };
    const req = parsed.data;

    // Letting the customer keep an item pays out with nothing coming back, so
    // only owners and admins may do it.
    if (!req.lines.every((l) => l.expectsBack) && !isAdminRole(role)) {
        return { success: false, error: "Only an owner or admin can refund without a pickup" };
    }

    try {
        await assertNotBlocked(tenantId, "new_orders");
    } catch (e) {
        if (e instanceof TenantBlockedError) return { success: false, error: e.message };
        throw e;
    }

    // Refund and replacement orders count toward the plan and charge the
    // wallet like any other order (Ali, 2026-10-29).
    const limitCheck = await canCreateOrder(tenantId);
    if (!limitCheck.allowed) return { success: false, error: limitCheck.reason ?? "Order limit reached" };

    const supabase = createSupabaseServiceClient();

    const [{ data: profile }, { data: tenant }] = await Promise.all([
        supabase.from("user_profiles").select("display_name").eq("id", userId).maybeSingle(),
        supabase.from("tenants").select("settings").eq("id", tenantId).maybeSingle(),
    ]);

    // The store's standing instruction to the courier on a pickup (what to
    // check before handing over the money) leads the refund order's notes.
    const settings = tenantAfterSaleSchema.safeParse((tenant as { settings: unknown } | null)?.settings ?? {});
    const courierNote = req.kind === "refund" && req.lines.some((l) => l.expectsBack) && settings.success
        ? settings.data.after_sale?.refund_courier_note ?? null
        : null;
    const notes = [courierNote, req.notes].filter((n): n is string => !!n).join("\n") || null;

    const { data, error } = await supabase.rpc("create_after_sale_order", {
        _tenant_id: tenantId,
        _original_order_id: req.originalOrderId,
        _kind: req.kind,
        _lines: req.lines.map((l) => ({ original_line: l.originalLine, qty: l.qty, expects_back: l.expectsBack })),
        _out_lines: req.outLines.map((l) => ({ product_id: l.productId, variant_id: l.variantId, qty: l.qty })),
        _fee_kept: req.feeKept,
        _charge_fee: req.chargeFee,
        _reason_id: req.reasonId,
        _reason: req.reason,
        _notes: notes,
        _changed_by_name: (profile as { display_name: string | null } | null)?.display_name ?? null,
    });
    if (error) return { success: false, error: error.message };

    const created = createdSchema.safeParse(data);
    if (!created.success) return { success: false, error: "The order was created but could not be read back" };

    chargeAndTrack(tenantId, supabase).catch((err) => {
        reportOrderError(err, { operation: "chargeAndTrack", tenantId });
    });
    return { success: true, orderId: created.data.id, orderNumber: created.data.order_id };
}
