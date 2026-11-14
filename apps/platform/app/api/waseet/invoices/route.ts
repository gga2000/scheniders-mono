import { NextRequest, NextResponse } from "next/server";
import { authorizeWaseetCaller, WASEET_MONEY_ROLES } from "@/lib/waseet-caller";
import { fetchMerchantInvoices } from "@/lib/waseet-api";
import { withFailureReport } from "@/lib/job-monitor";

/**
 * GET /api/waseet/invoices
 *
 * Fetch Al-Waseet merchant invoices.
 */
async function handleGET(request: NextRequest) {
    try {
        const caller = await authorizeWaseetCaller(request, WASEET_MONEY_ROLES);
        if (!caller.ok) return caller.response;

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

export const GET = withFailureReport("api/waseet/invoices GET", handleGET);
