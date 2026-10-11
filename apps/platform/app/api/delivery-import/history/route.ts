import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase-server";
import { requireRequestCaller } from "@/lib/auth/require-request-caller";

/**
 * GET /api/delivery-import/history
 *
 * Fetch past delivery imports for the history view.
 */
export async function GET(request: NextRequest) {
    try {
        // Tenant admins only; the tenant is the caller's verified active tenant.
        const caller = await requireRequestCaller(request, "tenant-admin");
        if (!caller.ok) return caller.response;

        const supabaseAdmin = createSupabaseServiceClient();

        const { data, error } = await supabaseAdmin
            .from("delivery_imports")
            .select("*")
            .eq("tenant_id", caller.tenantId)
            .order("created_at", { ascending: false })
            .limit(50);

        if (error) {
            return NextResponse.json(
                { success: false, error: error.message },
                { status: 500 }
            );
        }

        return NextResponse.json({ success: true, data: data || [] });
    } catch (error) {
        console.error("Delivery import history error:", error);
        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : "Failed to fetch history",
            },
            { status: 500 }
        );
    }
}
