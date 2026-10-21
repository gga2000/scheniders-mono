import { NextResponse } from "next/server";
import { Receiver } from "@upstash/qstash";
import { z } from "zod";
import { env } from "@/lib/env";
import { createSupabaseServiceClient } from "@/lib/supabase-server";
import { triggerImmediateConfirmation } from "@/lib/whatsapp-dispatcher";
import { sendNewOrderAlertToStaff } from "@/lib/staff-alerts";
import {
    parseConfirmTenantIds,
    storefrontConfirmationVerdict,
    storefrontOrderGateRowSchema,
} from "@/lib/storefront-order-confirmation";
import type { Order } from "@/types/order";

export const dynamic = "force-dynamic";
// The Interakt client retries (1s, 2s) for the primary, the secondary phone
// and every staff number. A timeout after the claim would lose the send, so
// leave room.
export const maxDuration = 60;

const LOG = "[storefront-order]";

const deliverySchema = z.object({ order_id: z.string().uuid() });

/**
 * QStash delivery: the instant WhatsApp confirmation for a storefront order.
 *
 * The storefront publishes `{ order_id }` after create_order_atomic inserts a
 * NEW order (never a replay, never a draft-view test). Nothing else in the
 * message is trusted: the order is re-read with the service role, the tenant
 * comes from that row, and every gate is checked here (source, is_test,
 * deleted, status, the STOREFRONT_WA_CONFIRM_TENANT_IDS allowlist, one send
 * per order).
 *
 * QStash delivers at least once, so the send is claimed with a conditional
 * UPDATE on orders.confirmation_dispatched_at. Only the delivery that flips it
 * from NULL sends. Then the same two calls the Lightfunnels webhook makes:
 * triggerImmediateConfirmation (unchanged: it honours whatsapp_auto_send,
 * logs to whatsapp_logs, mirrors to the secondary phone, flags a failed send
 * for staff and marks the order contacted), then the staff new-order alert.
 *
 * 401 bad or missing signature · 400 malformed message · 500 a read or claim
 * failure QStash should retry · 200 for everything decided (sent or
 * deliberately skipped), so QStash stops.
 */
export async function POST(request: Request): Promise<NextResponse> {
    const currentSigningKey = env.QSTASH_CURRENT_SIGNING_KEY;
    const nextSigningKey = env.QSTASH_NEXT_SIGNING_KEY;
    if (!currentSigningKey || !nextSigningKey) {
        console.error(`${LOG} QStash signing keys not configured`);
        return NextResponse.json({ error: "QStash signing keys not configured" }, { status: 401 });
    }

    const rawBody = await request.text();
    const signature = request.headers.get("upstash-signature") ?? "";
    try {
        await new Receiver({ currentSigningKey, nextSigningKey }).verify({ signature, body: rawBody });
    } catch (verifyErr) {
        console.error(`${LOG} Invalid QStash signature:`, verifyErr);
        return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    let message: unknown;
    try {
        message = JSON.parse(rawBody);
    } catch (parseErr) {
        console.error(`${LOG} signed body is not valid JSON:`, parseErr);
        return NextResponse.json({ error: "Body is not valid JSON" }, { status: 400 });
    }
    const parsed = deliverySchema.safeParse(message);
    if (!parsed.success) {
        console.error(`${LOG} signed message is not { order_id: uuid }:`, parsed.error.issues);
        return NextResponse.json({ error: "Expected { order_id: uuid }" }, { status: 400 });
    }
    const orderId = parsed.data.order_id;

    const db = createSupabaseServiceClient();
    const { data: row, error: readErr } = await db
        .from("orders")
        .select("*")
        .eq("id", orderId)
        .maybeSingle();
    if (readErr) {
        console.error(`${LOG} order ${orderId}: read failed:`, readErr);
        return NextResponse.json({ error: "Order read failed" }, { status: 500 });
    }
    if (!row) {
        console.log(`${LOG} order ${orderId}: skipped (not_found)`);
        return NextResponse.json({ skipped: "not_found" });
    }

    const gateRow = storefrontOrderGateRowSchema.safeParse(row);
    if (!gateRow.success) {
        console.error(`${LOG} order ${orderId}: row lacks the columns this webhook needs:`, gateRow.error.issues);
        return NextResponse.json({ error: "Order row shape not recognised" }, { status: 500 });
    }

    const verdict = storefrontConfirmationVerdict(
        gateRow.data,
        parseConfirmTenantIds(env.STOREFRONT_WA_CONFIRM_TENANT_IDS),
    );
    if (!verdict.send) {
        console.log(`${LOG} order ${orderId}: skipped (${verdict.reason})`);
        return NextResponse.json({ skipped: verdict.reason });
    }

    // The claim repeats the gates, so a row that changed between the read and
    // this write (staff moved it on, deleted it, another delivery claimed it)
    // matches nothing and nothing is sent.
    const { data: claimed, error: claimErr } = await db
        .from("orders")
        .update({ confirmation_dispatched_at: new Date().toISOString() })
        .eq("id", orderId)
        .eq("tenant_id", verdict.tenantId)
        .eq("source", "storefront")
        .eq("is_test", false)
        .eq("status", "new")
        .is("deleted_at", null)
        .is("confirmation_dispatched_at", null)
        .select("id");
    if (claimErr) {
        console.error(`${LOG} order ${orderId}: claim failed:`, claimErr);
        return NextResponse.json({ error: "Claim failed" }, { status: 500 });
    }
    if (!claimed || claimed.length === 0) {
        console.log(`${LOG} order ${orderId}: skipped (claimed_elsewhere)`);
        return NextResponse.json({ skipped: "claimed_elsewhere" });
    }

    const order: Order = row;
    await triggerImmediateConfirmation(order.id, order.phone);

    // Isolated from the customer send, as in the Lightfunnels webhook: a
    // staff-alert failure must not affect the confirmation.
    try {
        await sendNewOrderAlertToStaff(order, verdict.tenantId);
    } catch (alertErr) {
        console.error(`${LOG} order ${orderId}: staff alert fanout failed:`, alertErr);
    }

    return NextResponse.json({ dispatched: true });
}
