import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/admin-supabase";
import { requireAdminFromRequest, requireAdminPermission } from "@/lib/api-auth";
import { logAdminAction } from "@/lib/activity-logger";
import { paymentDetailsSchema, readPaymentDetails } from "@/lib/topup-queue";

/** The admin_settings row shops read through get_topup_payment_details(). */
const KEY = "topup_payment";

/**
 * Where shops send us money and what their printed receipts name (Fermi B3):
 * the Qi number and account name, the Zain Cash number, the support WhatsApp,
 * working hours and our legal name. Every shop sees these, so nothing secret
 * belongs here.
 *   GET  — any active admin.
 *   PUT  — super_admin only ("update_settings").
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdminFromRequest(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const { data, error } = await createAdminClient()
      .from("admin_settings")
      .select("value, updated_at")
      .eq("key", KEY)
      .maybeSingle();
    if (error) throw error;
    return NextResponse.json({ details: readPaymentDetails(data?.value ?? null), updated_at: data?.updated_at ?? null });
  } catch (error) {
    console.error("Payment details GET error:", error);
    return NextResponse.json({ error: "Failed to load the payment details" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const auth = await requireAdminPermission(request, "update_settings");
  if (auth instanceof NextResponse) return auth;

  const parsed = paymentDetailsSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid payment details" },
      { status: 400 },
    );
  }

  try {
    const { error } = await createAdminClient().from("admin_settings").upsert(
      { key: KEY, value: parsed.data, updated_by: auth.user.id, updated_at: new Date().toISOString() },
      { onConflict: "key" },
    );
    if (error) throw error;
    await logAdminAction(auth, "update_payment_details", { details: parsed.data });
    return NextResponse.json({ details: parsed.data });
  } catch (error) {
    console.error("Payment details PUT error:", error);
    return NextResponse.json({ error: "Failed to save the payment details" }, { status: 500 });
  }
}
