import { NextResponse } from "next/server";
import { Receiver } from "@upstash/qstash";
import { createClient } from "@supabase/supabase-js";
import { sendTemplateMessage, type TemplateType } from "@/lib/interakt";
import { env } from "@/lib/env";
import { scheduleFollowUp, DISCOUNT_DELAY_HOURS, REMINDER_DELAY_HOURS } from "@/lib/qstash";
import { flagOrderForWhatsAppFailure } from "@/lib/whatsapp-error-handler";

const supabaseAdmin = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

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

    const receiver = new Receiver({ currentSigningKey, nextSigningKey });
    const body = await request.text();
    const signature = request.headers.get("upstash-signature") || "";

    try {
        await receiver.verify({ signature, body });
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

    console.log(`[Auto Follow-up] Processing ${templateType} for order ${orderUuid}`);

    // Fetch the order first (to get tenant_id for scoped settings)
    const { data: order, error: fetchErr } = await supabaseAdmin
        .from("orders")
        .select("*")
        .eq("id", orderUuid)
        .single();

    if (fetchErr || !order) {
        console.error("[Auto Follow-up] Order not found:", orderUuid);
        return NextResponse.json({ skipped: true, reason: "order_not_found" });
    }

    // Check if auto-send is enabled for this tenant
    let settingsQuery = supabaseAdmin
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

    // 1. Claim the follow-up by incrementing contact_count atomically
    const newContactCount = contactCount + 1;
    const { data: updatedOrds, error: updateErr } = await supabaseAdmin
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
        await supabaseAdmin
            .from("orders")
            .update({ contact_count: contactCount })
            .eq("id", orderUuid);

        // 4. Flag order for manual review
        await flagOrderForWhatsAppFailure(orderUuid, result, order.order_id, order.phone);

        return NextResponse.json({ success: false, error: result.error }, { status: 500 });
    }

    // Log to whatsapp_logs
    await supabaseAdmin.from("whatsapp_logs").insert({
        order_id: order.order_id,
        order_uuid: order.id,
        phone: order.phone,
        template_name: templateType === "reminder" ? "order_reminder" : "order_discount_offer",
        direction: "outbound",
        status: "sent",
        interakt_message_id: result.messageId || null,
        payload: { source: "auto_follow_up", templateType },
        tenant_id: order.tenant_id,
    });

    console.log(`[Auto Follow-up] ${templateType} sent for ${order.order_id} (count: ${contactCount} → ${newContactCount})`);

    // If this was a reminder, schedule the discount follow-up
    if (templateType === "reminder") {
        const baseUrl = process.env.NEXT_PUBLIC_SITE_URL
            || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");

        if (baseUrl) {
            const discountDelay = (DISCOUNT_DELAY_HOURS - REMINDER_DELAY_HOURS) * 3600;
            await scheduleFollowUp(orderUuid, "discount", discountDelay, baseUrl);
        }
    }

    return NextResponse.json({
        success: true,
        templateType,
        orderNumber: order.order_id,
        newContactCount,
    });
}
