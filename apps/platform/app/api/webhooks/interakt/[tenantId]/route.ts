import { NextRequest, NextResponse } from "next/server";
import { formatPhoneToStandard } from "@/lib/order-utils";
import { env } from "@/lib/env";
import { createSupabaseServiceClient } from "@/lib/supabase-server";
import {
    enforceWebhookAuth,
    resolveWebhookAuthMode,
    verifyWebhookAuth,
} from "@/lib/webhook-auth";
import {
    INTERAKT_DELIVERY_STATUSES,
    recordWhatsAppDeliveryReceipt,
} from "@/lib/whatsapp-delivery-receipts";

/**
 * Tenant-specific Interakt Webhook Endpoint
 * URL: POST /api/webhooks/interakt/[tenantId]
 *
 * Routes incoming WhatsApp interactions to the correct tenant's orders.
 */

let _supabaseAdmin: ReturnType<typeof createSupabaseServiceClient> | null = null;
const supabaseAdmin = () => (_supabaseAdmin ??= createSupabaseServiceClient());

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
        const { data: integration } = await supabaseAdmin()
            .from("tenant_integrations")
            .select("credentials, is_active")
            .eq("tenant_id", tenantId)
            .eq("provider", "interakt")
            .single();

        if (!integration?.is_active) {
            return NextResponse.json({ error: "Integration not active" }, { status: 403 });
        }

        // Authenticate. The tenant's `credentials.webhook_secret` is both the
        // Interakt "Secret Key" (Interakt signs every delivery with it as
        // `Interakt-Signature: sha256=<hex HMAC of the body>`) and the shared
        // secret accepted from a header or `?token=`. Missing credentials, or a
        // tenant with no webhook_secret, are refused unless the explicit
        // monitor opt-out is set; a wrong one is always refused. See
        // lib/webhook-auth.ts.
        const credentials = integration.credentials as Record<string, unknown> | null;
        const webhookSecret =
            typeof credentials?.webhook_secret === "string" && credentials.webhook_secret
                ? credentials.webhook_secret
                : undefined;
        const rawBody = await request.text();
        const authResult = verifyWebhookAuth(
            { headers: request.headers, url: request.url, rawBody },
            {
                sharedSecret: webhookSecret,
                secretHeaders: ["x-webhook-secret", "x-interakt-secret"],
                hmac: {
                    header: "interakt-signature",
                    secret: webhookSecret,
                    encoding: "hex",
                    prefix: "sha256=",
                    acceptReserializedBody: true,
                },
            },
        );
        const authMode = resolveWebhookAuthMode(env.INTERAKT_WEBHOOK_AUTH_MODE, env.WEBHOOK_AUTH_MODE);
        const denied = enforceWebhookAuth(`/api/webhooks/interakt/${tenantId}`, request, authResult, authMode);
        if (denied) return denied;

        let parsed: unknown;
        try {
            parsed = JSON.parse(rawBody);
        } catch {
            return NextResponse.json({ error: "Body is not valid JSON" }, { status: 400 });
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const payload = parsed as any;
        const webhookType = payload.type || payload.eventType || "";

        // Delivery status events. OBS-3: this branch answered "logged" and wrote
        // nothing, which is why WhatsApp receipts stop dead at 2026-06-01 in the
        // data — the traffic moved to this endpoint and every delivered, read
        // and failed receipt since has been discarded.
        const deliveryStatus = INTERAKT_DELIVERY_STATUSES[webhookType];
        if (deliveryStatus) {
            await recordWhatsAppDeliveryReceipt(payload, deliveryStatus, tenantId);
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
            const { data } = await supabaseAdmin()
                .from("orders").select("id, order_id, status")
                .eq("id", callbackData).eq("tenant_id", tenantId).single();
            order = data;
        }

        if (!order && phone) {
            const standardPhone = formatPhoneToStandard(phone);
            const { data } = await supabaseAdmin()
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
        await supabaseAdmin().from("orders").update({
            status: action,
            updated_at: new Date().toISOString(),
            ...(action === "cancelled" ? { cancelled_at: new Date().toISOString() } : {}),
        }).eq("id", order.id);

        await supabaseAdmin().from("order_status_history").insert({
            order_id: order.id,
            from_status: "contacted",
            to_status: action,
            changed_by: "whatsapp_bot",
            tenant_id: tenantId,
        });

        // Record what the customer actually said.
        //
        // This route never wrote to whatsapp_logs at all. It confirms the order
        // correctly — that has always worked — but since Interakt moved to the
        // per-tenant URL there has been no `inbound` row since 2026-06-01, while
        // 1,017 were recorded before it. So the reply that moved an order is not
        // recoverable, and the OBS-3 WhatsApp views, which read this table,
        // undercount every customer reply.
        //
        // Non-critical: a logging failure must never cost the order update that
        // already succeeded above.
        try {
            await supabaseAdmin().from("whatsapp_logs").insert({
                order_id: order.order_id,
                order_uuid: order.id,
                phone: phone || "unknown",
                template_name: "cod_order_confirm",
                direction: "inbound",
                status: "received",
                payload: payload as unknown as Record<string, unknown>,
            });
        } catch (logErr) {
            console.warn("[Interakt Webhook] Failed to log inbound message:", logErr);
        }

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
