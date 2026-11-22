import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/admin-supabase";
import { requireAdminFromRequest } from "@/lib/api-auth";

const BodySchema = z.object({
  tenant_ids: z.array(z.string().uuid()).min(1).max(200),
});

/** Each shop's newest staff step, one per shop, as admin_last_actors answers it. */
const LastStepsSchema = z.record(
  z.string(),
  z.object({
    admin_user_id: z.string().nullable(),
    admin_label: z.string().nullable(),
    actor_email: z.string().nullable(),
    action: z.string(),
    created_at: z.string(),
  }),
);

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

    // One step per shop, however busy the other shops are (audit R3-6).
    const { data, error } = await supabase.rpc("admin_last_actors", { p_tenant_ids: parsed.data.tenant_ids });
    if (error) throw error;
    const latestByTenant = LastStepsSchema.parse(data);

    const adminIds = Array.from(
      new Set(
        Object.values(latestByTenant)
          .map((v) => v.admin_user_id)
          .filter((v): v is string => typeof v === "string" && v.length > 0)
      )
    );

    let profilesById = new Map<
      string,
      { id: string; display_name: string | null; email: string; avatar_url: string | null }
    >();
    if (adminIds.length > 0) {
      const { data: profiles, error: profileError } = await supabase
        .from("user_profiles")
        .select("id, display_name, email, avatar_url")
        .in("id", adminIds);
      // A failed read must not name every step "system".
      if (profileError) throw profileError;
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
    for (const [tenantId, entry] of Object.entries(latestByTenant)) {
      const profile = entry.admin_user_id ? profilesById.get(entry.admin_user_id) : null;
      // As the shop's timeline names a row (logActor): the staff member's
      // name, else the email the row kept, else its label; "system" only for
      // the system's own steps (round 23 data new 3).
      const label = entry.admin_label && entry.admin_label !== "system" ? entry.admin_label : null;
      const email = profile?.email ?? entry.actor_email;
      actors[tenantId] = {
        display_name: profile?.display_name ?? entry.actor_email ?? label ?? "system",
        email,
        avatar_url: profile?.avatar_url ?? null,
        action: entry.action,
        when: entry.created_at,
        is_system: !profile && !entry.actor_email && !label,
      };
    }

    return NextResponse.json({ actors });
  } catch (error) {
    console.error("Last actors API error:", error);
    return NextResponse.json({ error: "Failed to fetch last actors" }, { status: 500 });
  }
}
