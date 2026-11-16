import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/admin-supabase";
import { requireAdminFromRequest } from "@/lib/api-auth";

const BodySchema = z.object({
  tenant_ids: z.array(z.string().uuid()).min(1).max(200),
});

export async function POST(request: NextRequest) {
  const auth = await requireAdminFromRequest(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await request.json();
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid body" },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();
    const ids = parsed.data.tenant_ids;

    // Fetch latest activity per tenant via window function approach.
    // Since supabase-js doesn't expose window functions directly, do a fetch
    // sorted desc and dedupe by tenant_id in app code.
    const { data: rows, error } = await supabase
      .from("admin_activity_logs")
      .select("admin_user_id, admin_label, action, created_at, tenant_id")
      .in("tenant_id", ids)
      .order("created_at", { ascending: false })
      .limit(ids.length * 5);

    if (error) throw error;

    const latestByTenant = new Map<
      string,
      {
        admin_user_id: string | null;
        admin_label: string | null;
        action: string;
        created_at: string;
      }
    >();
    for (const r of rows ?? []) {
      if (!r.tenant_id || latestByTenant.has(r.tenant_id)) continue;
      latestByTenant.set(r.tenant_id, {
        admin_user_id: r.admin_user_id,
        admin_label: r.admin_label,
        action: r.action,
        created_at: r.created_at,
      });
    }

    const adminIds = Array.from(
      new Set(
        Array.from(latestByTenant.values())
          .map((v) => v.admin_user_id)
          .filter((v): v is string => typeof v === "string" && v.length > 0)
      )
    );

    let profilesById = new Map<
      string,
      { id: string; display_name: string | null; email: string; avatar_url: string | null }
    >();
    if (adminIds.length > 0) {
      const { data: profiles } = await supabase
        .from("user_profiles")
        .select("id, display_name, email, avatar_url")
        .in("id", adminIds);
      profilesById = new Map((profiles ?? []).map((p) => [p.id, p]));
    }

    const actors: Record<
      string,
      {
        display_name: string;
        email: string | null;
        avatar_url: string | null;
        action: string;
        when: string;
        is_system: boolean;
      }
    > = {};
    for (const [tenantId, entry] of latestByTenant.entries()) {
      const profile = entry.admin_user_id ? profilesById.get(entry.admin_user_id) : null;
      actors[tenantId] = {
        display_name: profile?.display_name ?? entry.admin_label ?? "system",
        email: profile?.email ?? null,
        avatar_url: profile?.avatar_url ?? null,
        action: entry.action,
        when: entry.created_at,
        is_system: !profile,
      };
    }

    return NextResponse.json({ actors });
  } catch (error) {
    console.error("Last actors API error:", error);
    return NextResponse.json({ error: "Failed to fetch last actors" }, { status: 500 });
  }
}
