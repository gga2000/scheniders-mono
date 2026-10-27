import { createClient } from "@supabase/supabase-js";
import { env } from "./env";
import type { SendTemplateResult } from "./interakt";

const supabaseAdmin = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export interface WhatsAppFailureMetadata {
    needs_attention: true;
    attention_reasons: string[];
    delivery_note: string;
}

/**
 * Categorize WhatsApp sending failure and generate order flags.
 */
export function categorizeWhatsAppFailure(
    result: SendTemplateResult,
    orderId: string,
    phone: string
): WhatsAppFailureMetadata {
    const statusCode = result.statusCode || 0;
    const errorMsg = result.error || "Unknown error";

    let reason = "whatsapp_send_failed";
    let notePrefix = "فشل إرسال واتساب";

    // Categorize by status code and error message
    if (statusCode === 400 || errorMsg.toLowerCase().includes("invalid")) {
        reason = "whatsapp_invalid_number";
        notePrefix = "رقم واتساب غير صالح";
    } else if (statusCode === 429 || errorMsg.toLowerCase().includes("rate limit")) {
        reason = "whatsapp_rate_limited";
        notePrefix = "تم تجاوز حد الإرسال";
    } else if (
        statusCode >= 500 ||
        errorMsg.toLowerCase().includes("network") ||
        errorMsg.toLowerCase().includes("invalid response")
    ) {
        reason = "whatsapp_network_error";
        notePrefix = "خطأ في الشبكة";
    } else if (errorMsg.includes("not configured")) {
        reason = "whatsapp_config_error";
        notePrefix = "خطأ في إعدادات واتساب";
    }

    // Build a clean, human-readable delivery note (no raw error dumps)
    const deliveryNote = `${notePrefix} - رقم: ${phone} - طلب: ${orderId} (HTTP ${statusCode || 'N/A'})`;

    return {
        needs_attention: true,
        attention_reasons: [reason],
        delivery_note: deliveryNote
    };
}

/**
 * Flag order as needing attention due to WhatsApp failure.
 * Merges new attention_reasons with any existing ones (deduped).
 * Also logs the failure to order_status_history for the timeline.
 */
export async function flagOrderForWhatsAppFailure(
    orderUuid: string,
    result: SendTemplateResult,
    orderId: string,
    phone: string
): Promise<void> {
    const flags = categorizeWhatsAppFailure(result, orderId, phone);
    // The order's tenant, stamped on the timeline row below: order_status_history
    // is tenant-scoped by RLS, so a row without it is invisible (NEW-P1-17).
    let tenantId: string | null = null;

    try {
        // Fetch existing attention_reasons to merge (not overwrite)
        const { data: current } = await supabaseAdmin
            .from("orders")
            .select("attention_reasons, tenant_id")
            .eq("id", orderUuid)
            .single();

        tenantId = current?.tenant_id ?? null;
        const existing = (current?.attention_reasons as string[]) || [];
        const merged = [...new Set([...existing, ...flags.attention_reasons])];

        await supabaseAdmin
            .from("orders")
            .update({
                needs_attention: true,
                attention_reasons: merged,
                delivery_note: flags.delivery_note,
                updated_at: new Date().toISOString(),
            })
            .eq("id", orderUuid);

        console.log(`[WhatsApp Error Handler] Order ${orderId} flagged with: ${flags.attention_reasons[0]} (merged: ${merged.join(', ')})`);
    } catch (err) {
        console.error(`[WhatsApp Error Handler] Failed to flag order ${orderId}:`, err);
    }

    // Log to order_status_history so it shows in the timeline permanently
    try {
        await supabaseAdmin.from("order_status_history").insert({
            order_id: orderUuid,
            from_status: null,
            to_status: null,
            changed_by: "whatsapp_bot",
            notes: flags.delivery_note,
            tenant_id: tenantId,
        });
    } catch (err) {
        console.error(`[WhatsApp Error Handler] Failed to log timeline for order ${orderId}:`, err);
    }
}

/**
 * Clear WhatsApp-specific failure flags from an order after a successful send.
 * Preserves non-WhatsApp attention_reasons (e.g., high_risk_customer, delivery_*).
 */
export async function clearWhatsAppFailureFlags(orderUuid: string): Promise<void> {
    try {
        const { data: current } = await supabaseAdmin
            .from("orders")
            .select("attention_reasons")
            .eq("id", orderUuid)
            .single();

        const existing = (current?.attention_reasons as string[]) || [];
        const remaining = existing.filter(r => !r.startsWith("whatsapp_"));

        await supabaseAdmin
            .from("orders")
            .update({
                needs_attention: remaining.length > 0,
                attention_reasons: remaining.length > 0 ? remaining : null,
                delivery_note: remaining.length > 0 ? undefined : null,
            })
            .eq("id", orderUuid);
    } catch (err) {
        console.error(`[WhatsApp Error Handler] Failed to clear flags for order ${orderUuid}:`, err);
    }
}
