import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { dispatchWhatsAppEvent } from "@/lib/whatsapp-dispatcher";
import type { TemplateType } from "@/lib/interakt";

// This endpoint receives an order ID and sends a WhatsApp template. The actual
// work lives in dispatchWhatsAppEvent() so it can also be called in-process
// (see triggerImmediateConfirmation) without an HTTP self-call.
export async function POST(request: NextRequest) {
    try {
        const payload = await request.json();
        const orderId = payload.orderId as string;
        const overridePhone = payload.overridePhone as string | undefined;
        const templateType = (payload.templateType as TemplateType) || "confirmation";

        if (!orderId) {
            return NextResponse.json({ success: false, error: "Missing orderId" }, { status: 400 });
        }

        const result = await dispatchWhatsAppEvent({ orderId, templateType, overridePhone });

        if (result.notFound) {
            return NextResponse.json({ success: false, error: result.error }, { status: 404 });
        }
        if (result.skipped) {
            return NextResponse.json({ success: true, message: "Skipped (disabled)" });
        }
        if (!result.success) {
            return NextResponse.json({ success: false, error: result.error }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (err: unknown) {
        console.error("[WhatsApp Dispatcher] Critical error:", err);
        return NextResponse.json({ success: false, error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
    }
}
