import { NextRequest, NextResponse } from "next/server";
import { leadConvertedLockResponse, prospectStoreLeadsMessage } from "@/lib/lead-converted-lock";
import { createAdminClient } from "@/lib/admin-supabase";
import { requireAdminPermission, requireBearerAdmin } from "@/lib/api-auth";
import { logAdminAction } from "@/lib/activity-logger";
import { notAnId } from "@/lib/route-id";
import { leadUpdateSchema } from "@/lib/lead-update";
import { changeLeads } from "@/lib/lead-change";

// The lead with its industry and, once built, its prospect store's web address
// (the Store tab shows and copies it).
const LEAD_WITH_PARTS = "*, industry:industries(*), prospect_tenant:tenants!leads_prospect_tenant_id_fkey(slug, business_name)";

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
          .select(LEAD_WITH_PARTS)
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
    // A part that failed must fail the page: answered as [], it read as "no
    // history", "no follow-ups" or "no owner" for a lead that has them.
    if (activitiesResult.error) throw activitiesResult.error;
    if (followUpsResult.error) throw followUpsResult.error;
    if (socialLinksResult.error) throw socialLinksResult.error;
    if (competitorsResult.error) throw competitorsResult.error;

    // A person whose profile is gone shows no name; a failed read is an error.
    const profile = async (userId: string | null) => {
      if (!userId) return null;
      const { data, error } = await supabase
        .from("user_profiles")
        .select("id, display_name, email, avatar_url")
        .eq("id", userId)
        .maybeSingle();
      if (error) throw error;
      return data;
    };
    const [assigned_user, created_by_user] = await Promise.all([
      profile(leadResult.data.assigned_to),
      profile(leadResult.data.created_by),
    ]);

    return NextResponse.json({
      lead: {
        ...leadResult.data,
        assigned_user,
        created_by_user,
      },
      activities: activitiesResult.data,
      follow_ups: followUpsResult.data,
      social_links: socialLinksResult.data,
      competitors: competitorsResult.data,
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
    const { status, assigned_to, ...rest } = parsed.data;
    if (status === undefined && assigned_to === undefined && Object.keys(rest).length === 0) {
      return NextResponse.json({ error: "Nothing to change" }, { status: 400 });
    }
    const supabase = createAdminClient();

    // Status and owner go through the same rule as the bulk bar
    // (lib/lead-change): compared with what is stored under a lock, so a form
    // save that leaves them alone writes nothing, and a real change writes its
    // history line and staff log row in the same transaction.
    if (status !== undefined || assigned_to !== undefined) {
      const result = await changeLeads(supabase, [id], { status, owner: assigned_to }, admin.user);
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
      if (result.found === 0) return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    if (Object.keys(rest).length > 0) {
      const { error } = await supabase.from("leads").update(rest).eq("id", id);
      if (error) throw error;
    }

    const { data: lead, error } = await supabase
      .from("leads")
      .select(LEAD_WITH_PARTS)
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

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

    // A lead with a prospect store is not deleted: its store would stay online
    // with the business's name, phone and address, and no screen could find
    // it again. The filter is in the delete itself, so a store built at the
    // same moment keeps its lead.
    const { data: removed, error } = await supabase
      .from("leads")
      .delete()
      .eq("id", id)
      .is("prospect_tenant_id", null)
      .select("merchant_name")
      .maybeSingle();

    if (error) throw error;

    if (!removed) {
      const { data: kept, error: readError } = await supabase
        .from("leads")
        .select("merchant_name")
        .eq("id", id)
        .not("prospect_tenant_id", "is", null)
        .maybeSingle();
      if (readError) throw readError;
      if (kept) return NextResponse.json({ error: prospectStoreLeadsMessage([kept.merchant_name]) }, { status: 409 });
    }

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
