import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase-server";
import { authorizeWaseetCaller, WASEET_READ_ROLES } from "@/lib/waseet-caller";
import { callerHasPermission } from "@/lib/auth/caller-has-permission";
import { PERMISSIONS } from "@/lib/permissions";
import {
    createWaseetOrder,
    mapOrderToWaseet,
    getCityMappings,
    getDefaultPackageSizeId,
} from "@/lib/waseet-api";
import type { Order } from "@/types/order";
import type { WaseetSubmitResult } from "@/types/waseet";
import { waseetSubmitBodySchema, toOrderUuids, MAX_WASEET_ORDERS_PER_REQUEST } from "@/lib/order-api-schemas";
import { ORDER_READ_COLUMNS } from "@/lib/repositories/order-columns";
import { withFailureReport } from "@/lib/job-monitor";

export const maxDuration = 60;

/**
 * POST /api/waseet/submit-orders
 *
 * Submit one or more orders to Al-Waseet delivery company.
 * Orders are processed sequentially to respect rate limits (30 req/30s).
 *
 * Request body: { orderIds: string[] }
 * Response: { success, data: { submitted, failed, results[] } }
 */
async function handlePOST(request: NextRequest) {
    try {
        // 1. Auth
        // Shipping is a real-world, billable side effect on the shared
        // Al-Waseet account: an active member of an allowed store, never a viewer.
        const caller = await authorizeWaseetCaller(request, WASEET_READ_ROLES);
        if (!caller.ok) return caller.response;
        // The writes below use the service role, so the role list alone would
        // let a member whose orders.edit was revoked still ship orders.
        const permission = await callerHasPermission(
            request,
            { tenantId: caller.tenantId, platformAdmin: false },
            PERMISSIONS.EDIT_ORDERS,
            "waseet-submit-orders",
        );
        if (!permission.ok) return permission.response;

        // 2. Parse request
        const parsedBody = waseetSubmitBodySchema.safeParse(await request.json());
        if (!parsedBody.success) {
            return NextResponse.json(
                { success: false, error: `Invalid request: \`orderIds\` must be 1-${MAX_WASEET_ORDERS_PER_REQUEST} order ids` },
                { status: 400 },
            );
        }
        const orderIds = toOrderUuids(parsedBody.data.orderIds);
        if (orderIds.length === 0) {
            return NextResponse.json({ success: false, error: "No valid order ids provided" }, { status: 400 });
        }

        const tenantId = caller.tenantId;
        const supabaseAdmin = createSupabaseServiceClient();

        // 3. Load dependencies
        const [cityMappings, defaultPackageSizeId] = await Promise.all([
            getCityMappings(),
            getDefaultPackageSizeId(tenantId),
        ]);

        if (cityMappings.length === 0) {
            return NextResponse.json(
                { success: false, error: "No city mappings configured. Please set up city mappings in settings first." },
                { status: 400 }
            );
        }

        // 4. Fetch orders from DB (tenant-scoped: ids alone are not authorization)
        const { data: orders, error: fetchError } = await supabaseAdmin
            .from("orders")
            .select(ORDER_READ_COLUMNS)
            .in("id", orderIds)
            .eq("tenant_id", tenantId);

        if (fetchError) {
            return NextResponse.json({ success: false, error: fetchError.message }, { status: 500 });
        }

        if (!orders || orders.length === 0) {
            return NextResponse.json({ success: false, error: "No orders found for provided IDs" }, { status: 404 });
        }

        // 5. Process each order sequentially (respects built-in rate limiter)
        const results: WaseetSubmitResult[] = [];
        let submitted = 0;
        let failed = 0;

        for (const order of orders as Order[]) {
            const result = await processOrder(order, cityMappings, defaultPackageSizeId, supabaseAdmin, caller.userId);
            results.push(result);
            if (result.success) {
                submitted++;
            } else {
                failed++;
            }
        }

        return NextResponse.json({
            success: true,
            data: { submitted, failed, results },
        });
    } catch (error) {
        console.error("[Waseet] Submit orders error:", error);
        return NextResponse.json(
            { success: false, error: error instanceof Error ? error.message : "Failed to submit orders" },
            { status: 500 }
        );
    }
}

async function processOrder(
    order: Order,
    cityMappings: Awaited<ReturnType<typeof getCityMappings>>,
    defaultPackageSizeId: number,
    supabaseAdmin: ReturnType<typeof createSupabaseServiceClient>,
    _userId: string
): Promise<WaseetSubmitResult> {
    const baseResult = {
        orderId: order.id,
        orderDisplayId: order.order_id,
    };

    // A test order never reaches a courier.
    if (order.is_test) {
        return { ...baseResult, success: false, error: "Test orders are never sent to a courier" };
    }

    // Validation: status must be confirmed or in_transit
    if (!["confirmed", "in_transit", "suspended"].includes(order.status)) {
        return {
            ...baseResult,
            success: false,
            error: `Order status is "${order.status}" — must be confirmed, in_transit, or suspended`,
        };
    }

    // Validation: not already submitted to Al-Waseet
    if (order.waseet_qr_id) {
        return {
            ...baseResult,
            success: false,
            error: `Already submitted to Al-Waseet (qr_id: ${order.waseet_qr_id})`,
        };
    }

    // Atomically CLAIM the submission before calling the courier.
    //
    // The check above reads a row fetched earlier, so on its own it does not stop
    // two overlapping requests (a double click, a retry, two staff shipping the
    // same batch) from both creating a real shipment — the merchant pays twice and
    // only one qr_id survives in our row, hiding the duplicate. This UPDATE is the
    // check and the reservation in one statement: whoever updates the row owns the
    // submission. A stale claim (>2 minutes, i.e. a crashed or timed-out attempt)
    // can be taken over so an order never wedges.
    const STALE_CLAIM_MS = 2 * 60 * 1000;
    const staleBefore = new Date(Date.now() - STALE_CLAIM_MS).toISOString();
    const { data: claimed, error: claimError } = await supabaseAdmin
        .from("orders")
        .update({ waseet_submit_started_at: new Date().toISOString() })
        .eq("id", order.id)
        .is("waseet_qr_id", null)
        .or(`waseet_submit_started_at.is.null,waseet_submit_started_at.lt.${staleBefore}`)
        .select("id")
        .maybeSingle();

    if (claimError) {
        return { ...baseResult, success: false, error: `Could not claim order for submission: ${claimError.message}` };
    }
    if (!claimed) {
        return {
            ...baseResult,
            success: false,
            error: "Another submission for this order is already in progress",
        };
    }

    /** Release the claim so a failed attempt can be retried immediately. */
    const releaseClaim = async () => {
        await supabaseAdmin
            .from("orders")
            .update({ waseet_submit_started_at: null })
            .eq("id", order.id)
            .is("waseet_qr_id", null);
    };

    // Map our order to Al-Waseet format
    const mapping = mapOrderToWaseet(order, cityMappings, defaultPackageSizeId);
    if (!mapping.success || !mapping.data) {
        await releaseClaim();
        return {
            ...baseResult,
            success: false,
            error: `Mapping failed: ${mapping.errors?.join("; ")}`,
        };
    }

    // Submit to Al-Waseet
    const apiResult = await createWaseetOrder(mapping.data, order.id);

    if (!apiResult.success || !apiResult.data) {
        // The courier did not create a shipment, so free the order for a retry.
        await releaseClaim();
        return {
            ...baseResult,
            success: false,
            error: `Al-Waseet API error: ${apiResult.error}`,
        };
    }

    const waseetOrder = apiResult.data;

    // Update our order with Al-Waseet response data
    const now = new Date().toISOString();
    const { error: updateError } = await supabaseAdmin
        .from("orders")
        .update({
            delivery_company: "waseet",
            delivery_order_id: waseetOrder.qr_id,
            waseet_qr_id: waseetOrder.qr_id,
            waseet_qr_link: waseetOrder.qr_link,
            waseet_merchant_price: Number(waseetOrder.merchant_price) || null,
            waseet_company_price: Number(waseetOrder.company_price) || null,
            waseet_submitted_at: now,
            status: "in_transit",
        })
        .eq("id", order.id);

    if (updateError) {
        console.error(`[Waseet] Order ${order.order_id}: submitted to Al-Waseet (qr_id=${waseetOrder.qr_id}) but DB update failed:`, updateError);
        return {
            ...baseResult,
            success: false,
            error: `Submitted to Al-Waseet but failed to update local DB: ${updateError.message}. Al-Waseet QR ID: ${waseetOrder.qr_id}`,
            waseetQrId: waseetOrder.qr_id,
            waseetQrLink: waseetOrder.qr_link,
        };
    }

    // Log to order_status_history
    try {
        await supabaseAdmin.from("order_status_history").insert({
            order_id: order.id,
            from_status: order.status,
            to_status: "in_transit",
            changed_by: "waseet_api",
            tenant_id: order.tenant_id,
            notes: `Submitted to Al-Waseet (qr_id: ${waseetOrder.qr_id})`,
        });
    } catch (err) {
        console.error("[Waseet] Failed to log status history:", err);
    }

    return {
        ...baseResult,
        success: true,
        waseetQrId: waseetOrder.qr_id,
        waseetQrLink: waseetOrder.qr_link,
    };
}

export const POST = withFailureReport("api/waseet/submit-orders POST", handlePOST);
