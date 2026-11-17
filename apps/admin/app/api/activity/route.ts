import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/admin-supabase";
import { requireAdminFromRequest } from "@/lib/api-auth";
import { activityKindFilter, isActivityKind } from "@/lib/activity-kinds";
import { z } from "zod";

export async function GET(request: NextRequest) {
  const auth = await requireAdminFromRequest(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const { searchParams } = request.nextUrl;

    // A kind of step (lib/activity-kinds), not a raw action name: the names
    // the old filter offered were never written.
    const kind = searchParams.get("kind");
    if (kind !== null && !isActivityKind(kind)) {
      return NextResponse.json({ error: `"${kind}" is not a kind of step` }, { status: 400 });
    }
    const tenantId = searchParams.get("tenant_id");
    if (tenantId !== null && !z.uuid().safeParse(tenantId).success) {
      return NextResponse.json({ error: "tenant_id must be a shop id" }, { status: 400 });
    }
    const page = Math.max(1, Number(searchParams.get("page") ?? "1"));
    const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit") ?? "50")));

    const offset = (page - 1) * limit;
    // The bell asks every minute on every page and shows no total: counting the
    // whole log each time is work nobody reads. The Activity page pages by it.
    const counted = searchParams.get("count") !== "none";

    const supabase = createAdminClient();

    let query = supabase
      .from("admin_activity_logs")
      .select(
        "id, action, details, tenant_id, admin_user_id, admin_label, actor_email, created_at, tenant:tenants(business_name)",
        counted ? { count: "exact" } : undefined,
      )
      .order("created_at", { ascending: false })
      // Steps written in the same instant need a fixed order, or a page boundary can skip or repeat one.
      .order("id", { ascending: false });

    if (kind) query = query.or(activityKindFilter(kind));
    if (tenantId) query = query.eq("tenant_id", tenantId);

    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) throw error;

    return NextResponse.json({
      logs: (data ?? []).map(({ tenant, ...log }) => {
        const shop = Array.isArray(tenant) ? tenant[0] : tenant;
        return { ...log, business_name: shop?.business_name ?? null };
      }),
      total: counted ? (count ?? 0) : null,
      page,
      limit,
    });
  } catch (error) {
    console.error("Activity API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch activity logs" },
      { status: 500 }
    );
  }
}
