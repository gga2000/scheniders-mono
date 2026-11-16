import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/admin-supabase";
import { requireBearerAdmin } from "@/lib/api-auth";

/**
 * How many open leads have no owner yet: the count beside Leads on the menu.
 * Open means not converted and not lost. Counted in the database, so it is not
 * capped at a page of rows.
 */
export async function GET(request: NextRequest) {
  const admin = await requireBearerAdmin(request);
  if (admin instanceof NextResponse) return admin;

  const { count, error } = await createAdminClient()
    .from("leads")
    .select("id", { count: "exact", head: true })
    .is("assigned_to", null)
    .not("status", "in", "(converted,lost)");

  if (error) {
    console.error("Leads with no owner count error:", error);
    return NextResponse.json({ error: "Failed to count leads with no owner" }, { status: 500 });
  }
  return NextResponse.json({ noOwner: count ?? 0 });
}
