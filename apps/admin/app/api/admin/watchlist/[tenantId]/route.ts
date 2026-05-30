import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/admin-supabase";

// TODO: replace with real admin user lookup once admin auth is wired
const ADMIN_USER_PLACEHOLDER = "00000000-0000-0000-0000-000000000000";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ tenantId: string }> }
) {
  const { tenantId } = await params;

  try {
    const supabase = createAdminClient();
    const { error } = await supabase
      .from("admin_watchlist")
      .delete()
      .eq("admin_user_id", ADMIN_USER_PLACEHOLDER)
      .eq("tenant_id", tenantId);

    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Watchlist DELETE error:", error);
    return NextResponse.json({ error: "Failed to remove from watchlist" }, { status: 500 });
  }
}
