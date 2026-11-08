import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/admin-supabase";
import { requireAdminFromRequest } from "@/lib/api-auth";

/**
 * GET /api/prime-link-requests — shops waiting for our team to link their
 * Prime account (sent from the Prime page in the merchant app), oldest first.
 * Read by every active admin; marking one linked needs `link_prime`.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdminFromRequest(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("prime_link_requests")
      .select("id, tenant_id, prime_phone, created_at, tenants(business_name, slug)")
      .is("linked_at", null)
      .order("created_at", { ascending: true })
      .limit(50);
    if (error) throw error;
    return NextResponse.json({ requests: data ?? [] });
  } catch (error) {
    console.error("Prime link requests API error:", error);
    return NextResponse.json({ error: "Failed to load Prime link requests" }, { status: 500 });
  }
}
