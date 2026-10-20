import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/admin-supabase";
import { requireAdminFromRequest } from "@/lib/api-auth";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Read — open to every active admin, like the cross-tenant /api/activity feed.
  const auth = await requireAdminFromRequest(request);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const url = new URL(request.url);
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") ?? "100")));
  const action = url.searchParams.get("action");
  const search = url.searchParams.get("search");

  try {
    const supabase = createAdminClient();

    let query = supabase
      .from("admin_activity_logs")
      .select(
        "id, admin_user_id, admin_label, actor_email, action, details, ip_address, user_agent, created_at"
      )
      .eq("tenant_id", id)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (action) query = query.eq("action", action);

    const { data: logs, error } = await query;
    if (error) throw error;

    // Join user_profiles for entries that have a real admin_user_id (LEFT JOIN simulated)
    const adminIds = Array.from(
      new Set(
        (logs ?? [])
          .map((l) => l.admin_user_id)
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

    const enriched = (logs ?? [])
      .map((l) => {
        const profile = l.admin_user_id ? profilesById.get(l.admin_user_id) : null;
        return {
          ...l,
          actor: {
            display_name: profile?.display_name ?? l.admin_label ?? "system",
            email: profile?.email ?? l.actor_email ?? null,
            avatar_url: profile?.avatar_url ?? null,
            is_system: !profile,
          },
        };
      })
      .filter((l) => {
        if (!search) return true;
        const haystack = JSON.stringify(l).toLowerCase();
        return haystack.includes(search.toLowerCase());
      });

    return NextResponse.json({ logs: enriched, total: enriched.length });
  } catch (error) {
    console.error("Audit log API error:", error);
    return NextResponse.json({ error: "Failed to fetch audit log" }, { status: 500 });
  }
}
