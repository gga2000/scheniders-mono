import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/admin-supabase";
import { logAdminActivity } from "@/lib/activity-logger";
import { requireAdminPermission } from "@/lib/api-auth";
import { pausedShop } from "@/lib/tenant-pause";
import { notAnId } from "@/lib/route-id";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminPermission(request, "reactivate_tenant");
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const missing = notAnId(id);
  if (missing) return missing;

  try {
    const supabase = createAdminClient();

    // The database gives the shop back the status it had before the pause
    // (trial, paying, suspended) and touches no shop that is not paused. This
    // route used to write "active" to any shop: a trial shop came back as a
    // paying shop that the billing lock never held. In the same transaction it
    // settles the billing lock, so a locked shop whose wallet holds the month
    // pays it and opens now, not at the next hourly lock check.
    const { data: rows, error } = await supabase.rpc("lift_pause_and_settle", { _tenant_id: id });
    if (error) throw error;

    const data = pausedShop(rows);
    if (!data) {
      const { data: shops, error: readError } = await supabase.from("tenants").select("id").eq("id", id);
      if (readError) throw readError;
      if (!shops || shops.length === 0) {
        return NextResponse.json({ error: "Merchant not found" }, { status: 404 });
      }
      return NextResponse.json({ error: "This shop is not paused" }, { status: 409 });
    }

    await logAdminActivity({
      adminUserId: auth.user.id,
      actorEmail: auth.user.email ?? null,
      tenantId: id,
      action: "unpause_tenant",
      // What the shop went back to (active when it paid its month just now).
      details: { status: data.status },
    });

    return NextResponse.json(data);
  } catch (error) {
    console.error("Unpause merchant error:", error);
    return NextResponse.json({ error: "Failed to unpause merchant" }, { status: 500 });
  }
}
