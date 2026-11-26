import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/admin-supabase";
import { requireAdminFromRequest } from "@/lib/api-auth";

/**
 * GET /api/prime-link-requests — shops whose Prime link is not made yet, and
 * why (Fermi A3): Prime has not linked the account to our system, another
 * shop uses the account (our team approves), the shop is picking a Prime
 * shop, no active shop, or Prime not answering. With the Prime account the
 * merchant app found, so an approval needs no lookup. A shop with no Prime
 * account asks us to open one (kind 'new'): what to create, never its
 * password. Oldest first.
 * Read by every active admin; approving needs `link_prime`.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdminFromRequest(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("prime_link_requests")
      .select(
        "id, tenant_id, prime_phone, created_at, outcome, checked_at, prime_login_id, prime_name, prime_shop_id, prime_shops, kind, new_name, new_state, new_login_id, approved_at, tenants(business_name, slug)",
      )
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
