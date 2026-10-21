import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServiceClient, verifyAccessToken } from "@/lib/supabase-server";
import { isAdminRole, type UserRole } from "@/lib/permissions";
import { resolveActiveTenant } from "@/lib/auth/resolve-active-tenant";
import {
    ORDER_PIPELINE_SETTINGS_KEY,
    normalizePipelineStages,
    pipelineLayoutSchema,
    type PipelineStageId,
} from "@/lib/order-pipeline";

export const dynamic = "force-dynamic";

type Caller = { tenantId: string; userId: string; role: UserRole };

/**
 * Resolve the caller from the Authorization bearer token: their active,
 * membership-verified tenant and their role in it.
 * Returns { error: Response } if the token is missing/invalid.
 */
async function resolveCaller(request: NextRequest): Promise<{ caller: Caller } | { error: NextResponse }> {
    const token = request.headers.get("Authorization")?.replace("Bearer ", "");
    if (!token) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };

    const { user, error } = await verifyAccessToken(token);
    if (error || !user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };

    const active = await resolveActiveTenant(user.id);
    if (!active.ok) return { error: NextResponse.json({ error: active.error }, { status: active.status }) };

    return { caller: { tenantId: active.tenantId, userId: user.id, role: active.role } };
}

async function readOrgDefault(tenantId: string): Promise<PipelineStageId[] | null> {
    const supabase = createSupabaseServiceClient();
    const { data } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", ORDER_PIPELINE_SETTINGS_KEY)
        .eq("tenant_id", tenantId)
        .maybeSingle();

    const raw = data?.value as { stages?: unknown } | undefined;
    return normalizePipelineStages(raw?.stages);
}

export async function GET(request: NextRequest) {
    const r = await resolveCaller(request);
    if ("error" in r) return r.error;
    try {
        return NextResponse.json({ stages: await readOrgDefault(r.caller.tenantId) });
    } catch {
        return NextResponse.json({ stages: null });
    }
}

export async function PUT(request: NextRequest) {
    const r = await resolveCaller(request);
    if ("error" in r) return r.error;

    // Only admins/owners may change the layout every employee sees.
    if (!isAdminRole(r.caller.role)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    try {
        const parsed = pipelineLayoutSchema.safeParse(await request.json());
        if (!parsed.success) {
            return NextResponse.json({ error: "Invalid pipeline layout" }, { status: 400 });
        }

        // Normalize defensively (dedupe + drop unknowns) before persisting.
        const stages = normalizePipelineStages(parsed.data.stages) ?? [];

        const supabase = createSupabaseServiceClient();
        const { error } = await supabase.from("app_settings").upsert(
            {
                key: ORDER_PIPELINE_SETTINGS_KEY,
                tenant_id: r.caller.tenantId,
                value: { stages },
                updated_at: new Date().toISOString(),
                updated_by: r.caller.userId,
            },
            { onConflict: "key,tenant_id" },
        );
        if (error) throw new Error(error.message);

        return NextResponse.json({ stages });
    } catch (err) {
        return NextResponse.json(
            { error: err instanceof Error ? err.message : "Internal error" },
            { status: 500 },
        );
    }
}
