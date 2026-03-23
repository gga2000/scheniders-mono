import { NextRequest, NextResponse } from "next/server";
import { verifyAccessToken } from "@/lib/supabase-server";
import { fetchMerchantInvoiceOrders } from "@/lib/waseet-api";

/**
 * GET /api/waseet/invoice-orders?invoice_id=ID
 *
 * Fetch orders for a specific Al-Waseet invoice.
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

        const invoiceId = request.nextUrl.searchParams.get("invoice_id");
        if (!invoiceId) {
            return NextResponse.json({ success: false, error: "invoice_id parameter is required" }, { status: 400 });
        }

        const result = await fetchMerchantInvoiceOrders(invoiceId);

        if (!result.success) {
            return NextResponse.json({ success: false, error: result.error }, { status: 502 });
        }

        return NextResponse.json({ success: true, data: result.data });
    } catch (error) {
        console.error("[Waseet] Invoice orders fetch error:", error);
        return NextResponse.json(
            { success: false, error: error instanceof Error ? error.message : "Failed to fetch invoice orders" },
            { status: 500 }
        );
    }
}
