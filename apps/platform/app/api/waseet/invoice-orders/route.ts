import { NextRequest, NextResponse } from "next/server";
import { authorizeWaseetCaller, WASEET_MONEY_ROLES } from "@/lib/waseet-caller";
import { fetchMerchantInvoiceOrders } from "@/lib/waseet-api";
import { withFailureReport } from "@/lib/job-monitor";

/**
 * GET /api/waseet/invoice-orders?invoice_id=ID
 *
 * Fetch orders for a specific Al-Waseet invoice.
 */
async function handleGET(request: NextRequest) {
    try {
        const caller = await authorizeWaseetCaller(request, WASEET_MONEY_ROLES);
        if (!caller.ok) return caller.response;

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

export const GET = withFailureReport("api/waseet/invoice-orders GET", handleGET);
