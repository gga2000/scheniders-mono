import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/admin-supabase";
import { requireBearerAdmin } from "@/lib/api-auth";
import { notAnId } from "@/lib/route-id";

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

    const { data, error } = await supabase
      .from("lead_activities")
      .select("*, created_by_user:user_profiles!lead_activities_created_by_fkey(display_name, email, avatar_url)")
      .eq("lead_id", id)
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) throw error;

    return NextResponse.json({ activities: data ?? [] });
  } catch (error) {
    console.error("Lead activities GET error:", error);
    return NextResponse.json({ error: "Failed to fetch activities" }, { status: 500 });
  }
}

// Staff log these by hand. The other kinds (a status change, a store built, a
// conversion) are written by the route or function that made the change.
const HAND_LOGGED = ["note", "call", "whatsapp", "email", "meeting"] as const;
const CONTACT: ReadonlySet<string> = new Set(["call", "whatsapp", "email", "meeting"]);

const activitySchema = z.object({
  activity_type: z.enum(HAND_LOGGED),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional(),
});

const LEAD_GONE = "This lead no longer exists.";

/** The insert names a lead that is gone: Postgres refuses it on this key. */
const leadGone = (error: { code?: string; message?: string } | null) =>
  error?.code === "23503" && Boolean(error.message?.includes("lead_activities_lead_id_fkey"));

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireBearerAdmin(request);
    if (admin instanceof NextResponse) return admin;

    const { id } = await params;
    const missing = notAnId(id);
    if (missing) return missing;
    const parsed = activitySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "A note needs a kind and some text." }, { status: 400 });
    }
    const body = parsed.data;
    const supabase = createAdminClient();

    // A call, message or meeting marks the lead contacted. It goes first, so a
    // retry after a failed save writes the note once, and a lead that is gone
    // is answered 404 before anything is written.
    if (CONTACT.has(body.activity_type)) {
      const { data: lead, error: contactError } = await supabase
        .from("leads")
        .update({ last_contacted_at: new Date().toISOString() })
        .eq("id", id)
        .select("id")
        .maybeSingle();
      if (contactError) throw contactError;
      if (!lead) return NextResponse.json({ error: LEAD_GONE }, { status: 404 });
    }

    // The author is the signed-in staff member, never a value from the body.
    const { data, error } = await supabase
      .from("lead_activities")
      .insert({
        lead_id: id,
        activity_type: body.activity_type,
        title: body.title,
        description: body.description || null,
        created_by: admin.user.id,
      })
      .select()
      .single();

    if (leadGone(error)) return NextResponse.json({ error: LEAD_GONE }, { status: 404 });
    if (error) throw error;

    return NextResponse.json({ activity: data }, { status: 201 });
  } catch (error) {
    console.error("Lead activities POST error:", error);
    return NextResponse.json({ error: "Failed to create activity" }, { status: 500 });
  }
}
