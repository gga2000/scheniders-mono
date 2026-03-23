import { NextRequest, NextResponse } from "next/server";
import { verifyAccessToken } from "@/lib/supabase-server";
import { receiveMerchantInvoice } from "@/lib/waseet-api";

/**
 * POST /api/waseet/receive-invoice
 *
 * Confirm receipt of an Al-Waseet invoice.
 * This is an alternative to scanning the QR code in the Al-Waseet app.
 */
export async function POST(request: NextRequest) {
    try {
        const authHeader = request.headers.get("Authorization");
        const token = authHeader?.replace("Bearer ", "");
        if (!token) {
            return NextResponse.json({ success: false, error: "Missing Authorization header" }, { status: 401 });
        }

        const { user, error: authError } = await verifyAccessToken(token);
        if (authError || !user) {
            return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
        }

        const body = await request.json();
        const { invoice_id } = body;

        if (!invoice_id) {
            return NextResponse.json({ success: false, error: "invoice_id is required" }, { status: 400 });
        }

        const result = await receiveMerchantInvoice(String(invoice_id));

        if (!result.success) {
            return NextResponse.json({ success: false, error: result.error }, { status: 502 });
        }

        return NextResponse.json({ success: true, data: result.data });
    } catch (error) {
        console.error("[Waseet] Receive invoice error:", error);
        return NextResponse.json(
            { success: false, error: error instanceof Error ? error.message : "Failed to receive invoice" },
            { status: 500 }
        );
    }
}
