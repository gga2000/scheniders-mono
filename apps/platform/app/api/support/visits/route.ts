import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase-server";
import { requireRequestCaller } from "@/lib/auth/require-request-caller";
import { withFailureReport } from "@/lib/job-monitor";
import { staffVisitsSchema } from "@/lib/support/schema";

export const dynamic = "force-dynamic";

/**
 * GET /api/support/visits — what our support staff did on my shop, newest
 * first (support_staff_visits). Shop admins only; the shop is the caller's
 * own, never one named in the request.
 */
async function handleGET(request: NextRequest) {
    const caller = await requireRequestCaller(request, "tenant-admin");
    if (!caller.ok) return caller.response;

    const { data, error } = await createSupabaseServiceClient().rpc("support_staff_visits", {
        p_tenant_id: caller.tenantId,
    });
    if (error) throw new Error(`Staff visits read failed: ${error.message}`);
    return NextResponse.json({ success: true, data: staffVisitsSchema.parse(data) });
}

export const GET = withFailureReport("api/support/visits GET", handleGET);
