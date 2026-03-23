import { NextRequest, NextResponse } from "next/server";
import { verifyAccessToken } from "@/lib/supabase-server";
import { fetchMerchantInvoices } from "@/lib/waseet-api";

/**
 * GET /api/waseet/invoices
 *
 * Fetch Al-Waseet merchant invoices.
 */
export async function GET(request: NextRequest) {
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

        const result = await fetchMerchantInvoices();

        if (!result.success) {
            return NextResponse.json({ success: false, error: result.error }, { status: 502 });
        }

        return NextResponse.json({ success: true, data: result.data });
    } catch (error) {
        console.error("[Waseet] Invoices fetch error:", error);
        return NextResponse.json(
            { success: false, error: error instanceof Error ? error.message : "Failed to fetch invoices" },
            { status: 500 }
        );
    }
}
