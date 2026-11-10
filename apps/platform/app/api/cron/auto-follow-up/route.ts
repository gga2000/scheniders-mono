import { NextResponse } from "next/server";
import { verifyQstashCallback } from "@/lib/qstash-verify";
import { sendTemplateMessage, TEMPLATE_NAMES, type TemplateType } from "@/lib/interakt";
import { env } from "@/lib/env";
import { DISCOUNT_DELAY_HOURS, REMINDER_DELAY_HOURS } from "@/lib/qstash";
import { scheduleFollowUpInWindow } from "@/lib/follow-up-schedule";
import { isInsideWindow, parseFollowUpWindow } from "@/lib/follow-up-window";
import { flagOrderForWhatsAppFailure } from "@/lib/whatsapp-error-handler";
import { createSupabaseServiceClient } from "@/lib/supabase-server";
import { automationFollowUpStamp } from "@/lib/follow-up-state";
import { ORDER_READ_COLUMNS } from "@/lib/repositories/order-columns";

let _supabaseAdmin: ReturnType<typeof createSupabaseServiceClient> | null = null;
const supabaseAdmin = () => (_supabaseAdmin ??= createSupabaseServiceClient());

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * QStash callback: Auto-send follow-up WhatsApp templates.
 *
 * Called by QStash after a scheduled delay (6h for reminder, 10h for discount).
 * Verifies the order is still in "contacted" status before sending.
 */
export async function POST(request: Request) {
    // Verify QStash signature
    const currentSigningKey = env.QSTASH_CURRENT_SIGNING_KEY;
    const nextSigningKey = env.QSTASH_NEXT_SIGNING_KEY;

    if (!currentSigningKey || !nextSigningKey) {
        return NextResponse.json({ error: "QStash signing keys not configured" }, { status: 401 });
    }
    const body = await request.text();
    const signature = request.headers.get("upstash-signature") || "";

    try {
        await verifyQstashCallback({ currentSigningKey, nextSigningKey, signature, body, requestUrl: request.url });
    } catch {
        console.error("[Auto Follow-up] Invalid QStash signature");
        return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    const payload = JSON.parse(body);
    const { orderUuid, templateType } = payload as {
        orderUuid: string;
        templateType: TemplateType;
    };

    if (!orderUuid || !templateType) {
        return NextResponse.json({ error: "Missing orderUuid or templateType" }, { status: 400 });
    }

    if (templateType !== "reminder" && templateType !== "discount") {
        return NextResponse.json({ error: "templateType must be reminder or discount" }, { status: 400 });
    }

    console.log(`[Auto Follow-up] Processing ${templateType} for order ${orderUuid}`);

    // Fetch the order first (to get tenant_id for scoped settings)
    const { data: order, error: fetchErr } = await supabaseAdmin()
        .from("orders")
        .select(ORDER_READ_COLUMNS)
        .eq("id", orderUuid)
        .single();

    if (fetchErr || !order) {
        console.error("[Auto Follow-up] Order not found:", orderUuid);
        return NextResponse.json({ skipped: true, reason: "order_not_found" });
    }

    if (order.is_test) {
        return NextResponse.json({ skipped: true, reason: "test_order" });
    }

    // Check if auto-send is enabled for this tenant
    let settingsQuery = supabaseAdmin()
        .from("app_settings")
        .select("value")
        .eq("key", "whatsapp_auto_send");

    if (order.tenant_id) {
        settingsQuery = settingsQuery.eq("tenant_id", order.tenant_id);
    }

    const { data: settings } = await settingsQuery.single();

    if (!settings?.value?.enabled) {
        console.log("[Auto Follow-up] Auto-send is disabled, skipping");
        return NextResponse.json({ skipped: true, reason: "auto_send_disabled" });
    }

    // Only send follow-ups for orders still in "contacted" status
    if (order.status !== "contacted") {
        console.log(`[Auto Follow-up] Order ${order.order_id} is "${order.status}", not "contacted". Skipping ${templateType}.`);
        return NextResponse.json({ skipped: true, reason: `status_is_${order.status}` });
    }

    // Validate contact_count matches expectation
    const contactCount = order.contact_count || 0;
    if (templateType === "reminder" && contactCount >= 2) {
        console.log(`[Auto Follow-up] Reminder already sent for ${order.order_id} (count=${contactCount})`);
        return NextResponse.json({ skipped: true, reason: "already_sent" });
    }
    if (templateType === "discount" && contactCount >= 3) {
        console.log(`[Auto Follow-up] Discount already sent for ${order.order_id} (count=${contactCount})`);
        return NextResponse.json({ skipped: true, reason: "already_sent" });
    }

    // The store can switch automatic reminders off; a reminder already queued
    // must then stay unsent. (The discount follow-up is not a reminder.)
    if (templateType === "reminder" && settings.value.reminder_enabled === false) {
        return NextResponse.json({ skipped: true, reason: "reminders_disabled" });
    }

    // Never message a customer outside the store's daytime window. QStash can
    // fire late or retry, so the window is re-checked here and the send is
    // re-queued for the next opening instead of going out at night.
    const window = parseFollowUpWindow(settings.value.reminder_window);
    if (!isInsideWindow(new Date(), window)) {
        await scheduleFollowUpInWindow({ orderUuid, templateType, earliest: new Date(), window });
        return NextResponse.json({ skipped: true, reason: "outside_window" });
    }

    // 1. Claim the follow-up by incrementing contact_count atomically
    const newContactCount = contactCount + 1;
    const { data: updatedOrds, error: updateErr } = await supabaseAdmin()
        .from("orders")
        .update({
            contact_count: newContactCount,
            last_contacted_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        })
        .eq("id", orderUuid)
        // Ensure another invocation hasn't already done this
        .eq("contact_count", contactCount)
        .select("id");

    if (updateErr) {
        console.error("[Auto Follow-up] Failed to claim follow-up for order:", updateErr);
        return NextResponse.json({ success: false, error: updateErr }, { status: 500 });
    }

    if (!updatedOrds || updatedOrds.length === 0) {
        console.log(`[Auto Follow-up] Order ${order.order_id} contact_count changed. Another process may have already sent the follow-up.`);
        return NextResponse.json({ skipped: true, reason: "already_claimed" });
    }

    // 2. Send the template
    const defaultDiscount = settings.value.default_discount_percent || 10;
    const result = await sendTemplateMessage(
        order,
        templateType,
        undefined,
        templateType === "discount" ? defaultDiscount : undefined,
    );

    if (!result.success) {
        console.error(`[Auto Follow-up] Failed to send ${templateType} for ${order.order_id}:`, result.error);

        // 3. Rollback the claim on failure
        await supabaseAdmin()
            .from("orders")
            .update({ contact_count: contactCount })
            .eq("id", orderUuid);

        // 4. Flag order for manual review
        await flagOrderForWhatsAppFailure(orderUuid, result, order.order_id, order.phone);

        return NextResponse.json({ success: false, error: result.error }, { status: 500 });
    }

    // Log to whatsapp_logs
    await supabaseAdmin().from("whatsapp_logs").insert({
        order_id: order.order_id,
        order_uuid: order.id,
        phone: order.phone,
        template_name: TEMPLATE_NAMES[templateType],
        direction: "outbound",
        status: "sent",
        interakt_message_id: result.messageId || null,
        payload: { source: "auto_follow_up", templateType },
        tenant_id: order.tenant_id,
    });

    // Attribute the send so the card's follow-up cue shows the bot rather than
    // nagging for a message that already went out. Written only after a
    // successful send: the claim above is rolled back on failure, this is not.
    const { error: attributionErr } = await supabaseAdmin()
        .from("orders")
        .update(automationFollowUpStamp(templateType))
        .eq("id", orderUuid);

    if (attributionErr) {
        // The message is already out; failing the cron now would make QStash
        // retry and send it twice. Record the failure and carry on.
        console.error("[Auto Follow-up] Failed to record follow-up attribution:", attributionErr);
    }

    console.log(`[Auto Follow-up] ${templateType} sent for ${order.order_id} (count: ${contactCount} → ${newContactCount})`);

    // If this was a reminder, schedule the discount follow-up, again held to the window.
    if (templateType === "reminder") {
        await scheduleFollowUpInWindow({
            orderUuid,
            templateType: "discount",
            earliest: new Date(Date.now() + (DISCOUNT_DELAY_HOURS - REMINDER_DELAY_HOURS) * 3_600_000),
            window,
        });
    }

    return NextResponse.json({
        success: true,
        templateType,
        orderNumber: order.order_id,
        newContactCount,
    });
}
