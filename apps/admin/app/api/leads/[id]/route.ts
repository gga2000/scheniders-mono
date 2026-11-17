import { NextRequest, NextResponse } from "next/server";
import { leadConvertedLockResponse } from "@/lib/lead-converted-lock";
import { createAdminClient } from "@/lib/admin-supabase";
import { requireAdminPermission, requireBearerAdmin } from "@/lib/api-auth";
import { logAdminAction } from "@/lib/activity-logger";
import { notAnId } from "@/lib/route-id";
import { leadUpdateSchema, type LeadUpdate } from "@/lib/lead-update";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireBearerAdmin(_request);
    if (admin instanceof NextResponse) return admin;

    const { id } = await params;
    const missing = notAnId(id);
    if (missing) return missing;
    const supabase = createAdminClient();

    const [leadResult, activitiesResult, followUpsResult, socialLinksResult, competitorsResult] =
      await Promise.all([
        supabase
          .from("leads")
          .select("*, industry:industries(*)")
          .eq("id", id)
          .single(),
        supabase
          .from("lead_activities")
          .select("*, created_by_user:user_profiles!lead_activities_created_by_fkey(display_name, email, avatar_url)")
          .eq("lead_id", id)
          .order("created_at", { ascending: false })
          .limit(100),
        supabase
          .from("lead_follow_ups")
          .select("*, assigned_user:user_profiles!lead_follow_ups_assigned_to_fkey(display_name, email, avatar_url)")
          .eq("lead_id", id)
          .order("scheduled_at", { ascending: true }),
        supabase
          .from("lead_social_links")
          .select("*")
          .eq("lead_id", id),
        supabase
          .from("lead_competitors")
          .select("*, competitor_lead:leads!lead_competitors_competitor_lead_id_fkey(id, merchant_name, follower_count, tier), competitor_tenant:tenants!lead_competitors_competitor_tenant_id_fkey(id, business_name, slug)")
          .eq("lead_id", id),
      ]);

    if (leadResult.error) {
      if (leadResult.error.code === "PGRST116") {
        return NextResponse.json({ error: "Lead not found" }, { status: 404 });
      }
      throw leadResult.error;
    }

    // Fetch assigned user info if assigned_to exists
    let assigned_user = null;
    if (leadResult.data.assigned_to) {
      const { data: user } = await supabase
        .from("user_profiles")
        .select("id, display_name, email, avatar_url")
        .eq("id", leadResult.data.assigned_to)
        .single();
      assigned_user = user;
    }

    // Fetch created_by user info
    let created_by_user = null;
    if (leadResult.data.created_by) {
      const { data: user } = await supabase
        .from("user_profiles")
        .select("id, display_name, email, avatar_url")
        .eq("id", leadResult.data.created_by)
        .single();
      created_by_user = user;
    }

    return NextResponse.json({
      lead: {
        ...leadResult.data,
        assigned_user,
        created_by_user,
      },
      activities: activitiesResult.data ?? [],
      follow_ups: followUpsResult.data ?? [],
      social_links: socialLinksResult.data ?? [],
      competitors: competitorsResult.data ?? [],
    });
  } catch (error) {
    console.error("Lead GET error:", error);
    return NextResponse.json({ error: "Failed to fetch lead" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireBearerAdmin(request);
    if (admin instanceof NextResponse) return admin;

    const { id } = await params;
    const missing = notAnId(id);
    if (missing) return missing;
    const parsed = leadUpdateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid lead" }, { status: 400 });
    }
    const changes: LeadUpdate & { last_contacted_at?: string; assigned_at?: string | null } = { ...parsed.data };
    if (Object.keys(changes).length === 0) {
      return NextResponse.json({ error: "Nothing to change" }, { status: 400 });
    }
    const supabase = createAdminClient();

    // The status and the owner are compared with what is stored, so an edit
    // that leaves them alone neither writes history nor restarts assigned_at.
    let statusFrom: string | null = null;
    let ownerMove: { from: string | null; to: string | null } | null = null;
    if (parsed.data.status !== undefined || parsed.data.assigned_to !== undefined) {
      const { data: current, error: readError } = await supabase
        .from("leads")
        .select("status, assigned_to")
        .eq("id", id)
        .maybeSingle();
      if (readError) throw readError;
      if (!current) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

      if (parsed.data.status !== undefined && current.status !== parsed.data.status) {
        statusFrom = current.status;
        if (parsed.data.status === "contacted") changes.last_contacted_at = new Date().toISOString();
      }
      if (parsed.data.assigned_to !== undefined && current.assigned_to !== parsed.data.assigned_to) {
        changes.assigned_at = parsed.data.assigned_to ? new Date().toISOString() : null;
        ownerMove = { from: current.assigned_to, to: parsed.data.assigned_to };
      }
    }

    const { data: lead, error } = await supabase
      .from("leads")
      .update(changes)
      .eq("id", id)
      .select("*, industry:industries(*)")
      .single();

    if (error) throw error;

    // Who owns a lead decides whose work it counts as, so moving it is a
    // staff step: the log keeps who moved it, from whom, to whom.
    if (ownerMove) {
      await logAdminAction(admin, "reassign_lead", {
        details: { lead_id: id, merchant_name: lead.merchant_name, ...ownerMove },
      });
    }

    // History is written once the change is saved: a refused change (a
    // converted lead is locked) leaves no "Status changed" line behind.
    if (statusFrom !== null) {
      const { error: historyError } = await supabase.from("lead_activities").insert({
        lead_id: id,
        activity_type: "status_change",
        title: `Status changed from ${statusFrom} to ${parsed.data.status}`,
        metadata: { from: statusFrom, to: parsed.data.status },
        created_by: admin.user.id,
      });
      if (historyError) {
        console.error("Lead PATCH history error:", historyError);
        return NextResponse.json(
          { error: "The lead was saved, but its status change could not be added to its history." },
          { status: 500 },
        );
      }
    }

    return NextResponse.json({ lead });
  } catch (error) {
    const locked = leadConvertedLockResponse(error);
    if (locked) return locked;
    console.error("Lead PATCH error:", error);
    return NextResponse.json({ error: "Failed to update lead" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireAdminPermission(_request, "delete_leads");
    if (admin instanceof NextResponse) return admin;

    const { id } = await params;
    const missing = notAnId(id);
    if (missing) return missing;
    const supabase = createAdminClient();

    const { data: removed, error } = await supabase
      .from("leads")
      .delete()
      .eq("id", id)
      .select("merchant_name")
      .maybeSingle();

    if (error) throw error;

    // A deleted lead takes its history with it: this row is what remains.
    if (removed) {
      await logAdminAction(admin, "delete_lead", {
        details: { lead_id: id, merchant_name: removed.merchant_name },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Lead DELETE error:", error);
    return NextResponse.json({ error: "Failed to delete lead" }, { status: 500 });
  }
}
