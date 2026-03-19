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
    } else if (statusCode >= 500 || errorMsg.toLowerCase().includes("network")) {
        reason = "whatsapp_network_error";
        notePrefix = "خطأ في الشبكة";
    } else if (errorMsg.includes("not configured")) {
        reason = "whatsapp_config_error";
        notePrefix = "خطأ في إعدادات واتساب";
    }

    const deliveryNote = `${notePrefix}: ${errorMsg} (كود: ${statusCode || 'N/A'}) - رقم: ${phone} - طلب: ${orderId}`;

    return {
        needs_attention: true,
        attention_reasons: [reason],
        delivery_note: deliveryNote
    };
}

/**
 * Flag order as needing attention due to WhatsApp failure.
 */
export async function flagOrderForWhatsAppFailure(
    orderUuid: string,
    result: SendTemplateResult,
    orderId: string,
    phone: string
): Promise<void> {
    const flags = categorizeWhatsAppFailure(result, orderId, phone);

    try {
        await supabaseAdmin
            .from("orders")
            .update({
                needs_attention: flags.needs_attention,
                attention_reasons: flags.attention_reasons,
                delivery_note: flags.delivery_note,
                updated_at: new Date().toISOString(),
            })
            .eq("id", orderUuid);

        console.log(`[WhatsApp Error Handler] Order ${orderId} flagged with: ${flags.attention_reasons[0]}`);
    } catch (err) {
        console.error(`[WhatsApp Error Handler] Failed to flag order ${orderId}:`, err);
    }
}
