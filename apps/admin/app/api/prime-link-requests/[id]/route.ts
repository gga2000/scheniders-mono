import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/admin-supabase";
import { requireAdminPermission } from "@/lib/api-auth";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/prime-link-requests/:id — «تم الربط»: our team linked the shop's
 * Prime account. Stamps the request and tells the shop in its notification
 * feed. A request already marked is answered 409, so the shop is told once.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminPermission(request, "link_prime");
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Invalid request id" }, { status: 400 });

  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("prime_link_requests")
      .update({ linked_at: new Date().toISOString(), linked_by: auth.user.id })
      .eq("id", id)
      .is("linked_at", null)
      .select("id, tenant_id")
      .maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: "Request not found or already linked" }, { status: 409 });

    const { error: noticeError } = await supabase.from("notifications").insert({
      tenant_id: data.tenant_id,
      type: "prime.link_done",
      category: "delivery",
      audience: "tenant",
      recipient_id: null,
      payload: {},
      priority: "high",
      group_key: `prime.link_done:${data.id}`,
    });
    if (noticeError) throw noticeError;

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Prime link request update error:", error);
    return NextResponse.json({ error: "Failed to mark the request linked" }, { status: 500 });
  }
}
