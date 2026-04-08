import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase-server";
import { fetchOrdersByIdsBulk } from "@/lib/waseet-api";
import type { WaseetMerchantOrder } from "@/types/waseet";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/cron/waseet-sync
 *
 * Cron job that polls Al-Waseet for status updates on in-transit orders.
 * Runs every 15 minutes via Vercel Cron.
 *
 * Uses GET /get-orders-by-ids-bulk (max 25 per request) to check
 * status changes and update our orders accordingly.
 */
export async function GET(request: NextRequest) {
    try {
        // Auth: CRON_SECRET or Vercel's internal cron header
        const authHeader = request.headers.get("authorization");
        const cronSecret = process.env.CRON_SECRET;

        if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
            const isVercelCron = request.headers.get("x-vercel-cron") === "1";
            if (!isVercelCron) {
                return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
            }
        }

        const supabaseAdmin = createSupabaseServiceClient();

        // Find all tenants with active Waseet integration
        const { data: activeTenants } = await supabaseAdmin
            .from("tenant_integrations")
            .select("tenant_id")
            .eq("provider", "waseet")
            .eq("is_active", true);

        // Also check for global sync setting (backward compat for tenants using env vars)
        const { data: globalSyncSetting } = await supabaseAdmin
            .from("app_settings")
            .select("value, tenant_id")
            .eq("key", "waseet_sync_enabled");

        // Build set of tenant IDs that have sync enabled
        const enabledTenantIds = new Set<string>();

        // Tenants with active integration
        activeTenants?.forEach(t => enabledTenantIds.add(t.tenant_id));

        // Tenants with sync setting enabled
        globalSyncSetting?.filter(s => s.value && s.tenant_id).forEach(s => enabledTenantIds.add(s.tenant_id));

        if (enabledTenantIds.size === 0) {
            return NextResponse.json({ success: true, message: "No tenants with Waseet sync", updated: 0 });
        }

        // Fetch all orders across enabled tenants that are submitted to Al-Waseet
        const { data: orders, error: fetchError } = await supabaseAdmin
            .from("orders")
            .select("id, order_id, waseet_qr_id, waseet_status_id, status, tenant_id")
            .eq("delivery_company", "waseet")
            .in("status", ["in_transit", "confirmed"])
            .in("tenant_id", Array.from(enabledTenantIds))
            .not("waseet_qr_id", "is", null);

        if (fetchError) {
            console.error("[Waseet Sync] Failed to fetch orders:", fetchError);
            return NextResponse.json({ success: false, error: fetchError.message }, { status: 500 });
        }

        if (!orders || orders.length === 0) {
            return NextResponse.json({ success: true, message: "No orders to sync", updated: 0 });
        }

        // Batch into groups of 25 (API max)
        const batches: typeof orders[] = [];
        for (let i = 0; i < orders.length; i += 25) {
            batches.push(orders.slice(i, i + 25));
        }

        let totalUpdated = 0;
        const errors: string[] = [];

        for (const batch of batches) {
            const qrIds = batch.map(o => o.waseet_qr_id).filter(Boolean) as string[];

            const result = await fetchOrdersByIdsBulk(qrIds);

            if (!result.success || !result.data) {
                errors.push(`Bulk fetch failed: ${result.error}`);
                continue;
            }

            // Build a map of qr_id → Al-Waseet order for quick lookup
            const waseetOrderMap = new Map<string, WaseetMerchantOrder>();
            for (const wo of result.data) {
                if (wo.qr_id) {
                    waseetOrderMap.set(wo.qr_id, wo);
                }
            }

            // Check each order for status changes
            for (const order of batch) {
                const waseetOrder = waseetOrderMap.get(order.waseet_qr_id!);
                if (!waseetOrder) continue;

                const newStatusId = Number(waseetOrder.status_id);
                const oldStatusId = order.waseet_status_id;

                // Skip if no change
                if (newStatusId === oldStatusId) continue;

                // Determine our status update
                const statusUpdate = mapWaseetStatusToOurs(waseetOrder);

                const updateFields: Record<string, unknown> = {
                    waseet_status_id: newStatusId,
                    waseet_status_text: waseetOrder.status,
                };

                if (waseetOrder.merchant_invoice_id) {
                    updateFields.waseet_invoice_id = waseetOrder.merchant_invoice_id;
                }

                if (statusUpdate.ourStatus && statusUpdate.ourStatus !== order.status) {
                    updateFields.status = statusUpdate.ourStatus;
                    if (statusUpdate.ourStatus === "delivered") {
                        updateFields.delivered_at = new Date().toISOString();
                    }
                }

                const { error: updateError } = await supabaseAdmin
                    .from("orders")
                    .update(updateFields)
                    .eq("id", order.id);

                if (updateError) {
                    errors.push(`Failed to update ${order.order_id}: ${updateError.message}`);
                    continue;
                }

                // Log status change if our status changed
                if (statusUpdate.ourStatus && statusUpdate.ourStatus !== order.status) {
                    try {
                        await supabaseAdmin.from("order_status_history").insert({
                            order_id: order.id,
                            from_status: order.status,
                            to_status: statusUpdate.ourStatus,
                            changed_by: "waseet_sync",
                            notes: `Al-Waseet status: ${waseetOrder.status} (id: ${waseetOrder.status_id})`,
                            tenant_id: order.tenant_id,
                        });
                    } catch (err) {
                        console.error("[Waseet Sync] History log failed:", err);
                    }
                }

                totalUpdated++;
            }
        }

        console.log(`[Waseet Sync] Completed: ${totalUpdated} updated, ${errors.length} errors, ${orders.length} checked`);

        return NextResponse.json({
            success: true,
            data: {
                checked: orders.length,
                updated: totalUpdated,
                errors: errors.length > 0 ? errors : undefined,
            },
        });
    } catch (error) {
        console.error("[Waseet Sync] Error:", error);
        return NextResponse.json(
            { success: false, error: error instanceof Error ? error.message : "Sync failed" },
            { status: 500 }
        );
    }
}

/**
 * Map Al-Waseet status to our internal OrderStatus.
 *
 * Al-Waseet status texts are in Arabic. Common patterns:
 * - Contains "تسليم" (delivery/delivered) → 'delivered'
 * - Contains "مرتجع" or "راجع" (returned) → 'rejected'
 * - Contains "مؤجل" (postponed) → keep current status
 * - Contains "الغ" (cancelled) → 'cancelled'
 *
 * The exact status IDs should be verified after first /statuses call.
 * For safety, we only change our status for clearly terminal states.
 */
function mapWaseetStatusToOurs(waseetOrder: WaseetMerchantOrder): { ourStatus: string | null } {
    const statusText = (waseetOrder.status || "").toLowerCase();

    // Delivered
    if (statusText.includes("تسليم") || statusText.includes("تم التوصيل") || statusText.includes("مسلم")) {
        return { ourStatus: "delivered" };
    }

    // Returned/Rejected
    if (statusText.includes("مرتجع") || statusText.includes("راجع") || statusText.includes("رفض")) {
        return { ourStatus: "rejected" };
    }

    // Cancelled
    if (statusText.includes("ملغ") || statusText.includes("الغ")) {
        return { ourStatus: "cancelled" };
    }

    // For all other statuses (new, in transit, postponed, etc.),
    // don't change our status — just record the waseet_status_text
    return { ourStatus: null };
}
