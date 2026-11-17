import { NextRequest, NextResponse } from "next/server";
import { convertedLeadsDeleteMessage, leadConvertedLockResponse, prospectStoreLeadsMessage } from "@/lib/lead-converted-lock";
import { createAdminClient } from "@/lib/admin-supabase";
import { requireAdminPermission, requireBearerAdmin } from "@/lib/api-auth";
import { notAnId } from "@/lib/route-id";
import { INDUSTRY_GONE, isIndustryGone, leadPatchSchema } from "@/lib/lead-update";
import { saveLead } from "@/lib/lead-save";
import { deleteLeads } from "@/lib/lead-delete";

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
    const parsed = leadPatchSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid lead" }, { status: 400 });
    }
    const { status, assigned_to, was = {}, ...rest } = parsed.data;
    if (status === undefined && assigned_to === undefined && Object.keys(rest).length === 0) {
      return NextResponse.json({ error: "Nothing to change" }, { status: 400 });
    }
    const supabase = createAdminClient();

    // One transaction under the lead's lock (lib/lead-save): a list a
    // colleague changed since the form opened is refused before anything is
    // written, and an error undoes the whole save, status and owner included.
    const saved = await saveLead(supabase, id, { status, owner: assigned_to, changes: rest, was }, admin.user);
    if (!saved.ok) return NextResponse.json({ error: saved.error }, { status: saved.status });

    // The form reads the lead again itself, so a read here could only fail
    // after the save and say it had not saved.
    return NextResponse.json({ saved: true });
  } catch (error) {
    const locked = leadConvertedLockResponse(error);
    if (locked) return locked;
    // An industry a colleague removed while this form was open.
    if (isIndustryGone(error)) return NextResponse.json({ error: INDUSTRY_GONE }, { status: 409 });
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

    // A lead that became a shop, or has a prospect store, is not deleted: its
    // sale and commission stay on record, and a prospect store would stay
    // online with no lead to find it by. The database skips such a lead in the
    // delete itself, so one converted or built at the same moment is kept, and
    // writes the staff log row (all that remains of a deleted lead) in the
    // same transaction.
    const result = await deleteLeads(supabase, [id], admin.user, false);
    if (result.kept_converted.length > 0) {
      return NextResponse.json({ error: convertedLeadsDeleteMessage(result.kept_converted) }, { status: 409 });
    }
    if (result.kept_with_store.length > 0) {
      return NextResponse.json({ error: prospectStoreLeadsMessage(result.kept_with_store) }, { status: 409 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Lead DELETE error:", error);
    return NextResponse.json({ error: "Failed to delete lead" }, { status: 500 });
  }
}
