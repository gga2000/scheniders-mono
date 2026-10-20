import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/admin-supabase";
import { requireAdminFromRequest } from "@/lib/api-auth";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ tenantId: string }> }
) {
  // A watchlist is per-admin: any active admin may remove entries, but only
  // their own (GET/POST already key on the caller; this used a placeholder id,
  // so a removal never matched a row).
  const auth = await requireAdminFromRequest(request);
  if (auth instanceof NextResponse) return auth;

  const { tenantId } = await params;

  try {
    const supabase = createAdminClient();
    const { error } = await supabase
      .from("admin_watchlist")
      .delete()
      .eq("admin_user_id", auth.user.id)
      .eq("tenant_id", tenantId);

    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Watchlist DELETE error:", error);
    return NextResponse.json({ error: "Failed to remove from watchlist" }, { status: 500 });
  }
}
