import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import { formatPhoneToStandard } from "@/lib/order-utils";

/**
 * Tenant-specific Interakt Webhook Endpoint
 * URL: POST /api/webhooks/interakt/[tenantId]
 *
 * Routes incoming WhatsApp interactions to the correct tenant's orders.
 */

if (!env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for the Interakt tenant webhook");
}
const supabaseAdmin = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
);

const CONFIRM_PATTERNS = ["تأكيد", "تاكيد", "confirm", "تأكيد ✅"];
const CANCEL_PATTERNS = ["إلغاء", "الغاء", "cancel", "إلغاء ❌"];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractResponseText(data: any): string | null {
    if (!data) return null;
    const msg = data.message || data.msg || {};
    if (msg.button_reply?.title) return msg.button_reply.title.trim();
    if (msg.interactive_reply?.title) return msg.interactive_reply.title.trim();
    if (msg.button_text) return msg.button_text.trim();
    if (msg.button?.text) return msg.button.text.trim();
    if (msg.button_title) return msg.button_title.trim();
    if (data.button_text) return data.button_text.trim();
    if (data.button_reply?.title) return data.button_reply.title.trim();
    if (msg.text && typeof msg.text === "string") return msg.text.trim();
    return null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractCallbackData(data: any): string | null {
    const msg = data?.message;
    if (!msg) return null;
    return msg.context?.callback_data || msg.meta_data?.source_data?.callback_data || null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractPhone(data: any): string | null {
    const c = data?.customer;
    if (!c?.phone_number) return null;
    let phone = c.phone_number.replace(/\D/g, "");
    if (c.country_code) {
        const cc = c.country_code.replace(/\D/g, "");
        if (!phone.startsWith(cc)) phone = cc + phone;
    }
    return phone || null;
}

function matchResponse(text: string): "confirmed" | "cancelled" | null {
    const normalized = text.replace(/\s+/g, " ").trim().toLowerCase();
    for (const p of CONFIRM_PATTERNS) { if (normalized.includes(p.toLowerCase())) return "confirmed"; }
    for (const p of CANCEL_PATTERNS) { if (normalized.includes(p.toLowerCase())) return "cancelled"; }
    return null;
}

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ tenantId: string }> }
) {
    const { tenantId } = await params;

    try {
        // Validate tenant has active Interakt integration
        const { data: integration } = await supabaseAdmin
            .from("tenant_integrations")
            .select("credentials, is_active")
            .eq("tenant_id", tenantId)
            .eq("provider", "interakt")
            .single();

        if (!integration?.is_active) {
            return NextResponse.json({ error: "Integration not active" }, { status: 403 });
        }

        // Verify webhook secret
        const expectedSecret = integration.credentials?.webhook_secret;
        if (expectedSecret) {
            const provided = request.headers.get("x-webhook-secret") || request.headers.get("x-interakt-secret");
            if (provided && provided !== expectedSecret) {
                return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
            }
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const payload = await request.json() as any;
        const webhookType = payload.type || payload.eventType || "";

        // Delivery status events — just log
        const DELIVERY_TYPES: Record<string, string> = {
            message_api_sent: "sent", message_api_delivered: "delivered",
            message_api_read: "read", message_api_failed: "failed",
            message_api_clicked: "button_clicked",
        };

        if (DELIVERY_TYPES[webhookType] && webhookType !== "message_api_clicked") {
            return NextResponse.json({ success: true, message: `Status "${webhookType}" logged` });
        }

        if (webhookType !== "message_received" && webhookType !== "message_api_clicked" &&
            !webhookType.toLowerCase().includes("button") && !webhookType.toLowerCase().includes("click")) {
            return NextResponse.json({ success: true, message: `Type "${webhookType}" acknowledged` });
        }

        const responseText = extractResponseText(payload.data);
        if (!responseText) {
            return NextResponse.json({ success: true, message: "No actionable text" });
        }

        const action = matchResponse(responseText);
        if (!action) {
            return NextResponse.json({ success: true, message: "Manual handling required" });
        }

        // Find order scoped to this tenant
        const callbackData = extractCallbackData(payload.data);
        const phone = extractPhone(payload.data);

        let order: { id: string; order_id: string; status: string } | null = null;

        if (callbackData) {
            const { data } = await supabaseAdmin
                .from("orders").select("id, order_id, status")
                .eq("id", callbackData).eq("tenant_id", tenantId).single();
            order = data;
        }

        if (!order && phone) {
            const standardPhone = formatPhoneToStandard(phone);
            const { data } = await supabaseAdmin
                .from("orders").select("id, order_id, status")
                .eq("status", "contacted").eq("tenant_id", tenantId)
                .or(`phone.eq.${standardPhone},phone.eq.${phone}`)
                .order("created_at", { ascending: false }).limit(1).single();
            order = data;
        }

        if (!order) {
            return NextResponse.json({ success: false, error: "No matching order" }, { status: 404 });
        }

        if (order.status !== "contacted") {
            return NextResponse.json({ success: true, message: `Order already "${order.status}"` });
        }

        // Update order
        await supabaseAdmin.from("orders").update({
            status: action,
            updated_at: new Date().toISOString(),
            ...(action === "cancelled" ? { cancelled_at: new Date().toISOString() } : {}),
        }).eq("id", order.id);

        await supabaseAdmin.from("order_status_history").insert({
            order_id: order.id,
            from_status: "contacted",
            to_status: action,
            changed_by: "whatsapp_bot",
            tenant_id: tenantId,
        });

        return NextResponse.json({
            success: true,
            message: `Order ${order.order_id} updated to ${action}`,
            order_id: order.order_id,
            new_status: action,
        });
    } catch (error) {
        console.error("[Interakt Webhook] Error:", error);
        return NextResponse.json(
            { success: false, error: error instanceof Error ? error.message : "Internal error" },
            { status: 500 }
        );
    }
}
