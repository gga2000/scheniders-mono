import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/admin-supabase";
import { requireAdminPermission } from "@/lib/api-auth";
import { ShopCheckSchema } from "@/lib/support-shop-check";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Params = { params: Promise<{ id: string }> };

/**
 * GET /api/support/cases/<id>/check — "Check this shop" for the shop that
 * wrote this conversation: store, orders, products, wallet, WhatsApp,
 * Al-Waseet, Prime and errors, gathered in one database call. Reads only.
 */
export async function GET(request: NextRequest, { params }: Params) {
  const admin = await requireAdminPermission(request, "handle_support");
  if (admin instanceof NextResponse) return admin;
  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Conversation not found" }, { status: 404 });

  try {
    const supabase = createAdminClient();
    const { data: supportCase, error: caseError } = await supabase
      .from("support_cases")
      .select("tenant_id")
      .eq("id", id)
      .maybeSingle();
    if (caseError) throw caseError;
    if (!supportCase) return NextResponse.json({ error: "Conversation not found" }, { status: 404 });

    const tenantId = (supportCase as { tenant_id: string }).tenant_id;
    const { data, error } = await supabase.rpc("support_shop_check", { p_tenant_id: tenantId });
    if (error) throw error;
    if (data === null) return NextResponse.json({ error: "This shop no longer exists" }, { status: 404 });
    return NextResponse.json({ tenantId, check: ShopCheckSchema.parse(data) });
  } catch (error) {
    console.error("Support shop check API error:", error);
    return NextResponse.json({ error: "Failed to check this shop" }, { status: 500 });
  }
}
