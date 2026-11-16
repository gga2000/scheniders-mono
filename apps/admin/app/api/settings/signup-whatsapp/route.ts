import { NextRequest, NextResponse } from "next/server";
import {
  SIGNUP_WHATSAPP_SETTINGS_KEY,
  readSignupWhatsAppSettings,
  signupWhatsAppSettingsSchema,
} from "@scheniders/shared/signup-whatsapp";
import { createAdminClient } from "@/lib/admin-supabase";
import { requireAdminFromRequest, requireAdminPermission } from "@/lib/api-auth";
import { logAdminAction } from "@/lib/activity-logger";

/**
 * The WhatsApp messages a new shop's owner gets at signup (Fermi B11): the
 * code that proves their number and the welcome with the store link and the
 * short video. Off until Interakt approves the templates.
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
      .eq("key", SIGNUP_WHATSAPP_SETTINGS_KEY)
      .maybeSingle();
    if (error) throw error;
    return NextResponse.json({ settings: readSignupWhatsAppSettings(data?.value ?? null), updated_at: data?.updated_at ?? null });
  } catch (error) {
    console.error("Signup WhatsApp GET error:", error);
    return NextResponse.json({ error: "Failed to load the signup WhatsApp settings" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const auth = await requireAdminPermission(request, "update_settings");
  if (auth instanceof NextResponse) return auth;

  const parsed = signupWhatsAppSettingsSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid signup WhatsApp settings" },
      { status: 400 },
    );
  }

  try {
    const { error } = await createAdminClient().from("admin_settings").upsert(
      { key: SIGNUP_WHATSAPP_SETTINGS_KEY, value: parsed.data, updated_by: auth.user.id, updated_at: new Date().toISOString() },
      { onConflict: "key" },
    );
    if (error) throw error;
    await logAdminAction(auth, "update_signup_whatsapp", { details: parsed.data });
    return NextResponse.json({ settings: parsed.data });
  } catch (error) {
    console.error("Signup WhatsApp PUT error:", error);
    return NextResponse.json({ error: "Failed to save the signup WhatsApp settings" }, { status: 500 });
  }
}
