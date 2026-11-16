import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/admin-supabase";
import { logAdminActivity } from "@/lib/activity-logger";
import { requireAdminPermission } from "@/lib/api-auth";

const BodySchema = z.object({ paused: z.boolean() });
const resultSchema = z.object({
  tenant_id: z.string().uuid(),
  paused: z.boolean(),
  reason: z.enum(["failures", "staff"]).nullable(),
  paused_at: z.string().nullable(),
});

/**
 * POST /api/merchants/[id]/whatsapp-pause { paused } — pause or resume one
 * shop's automatic WhatsApp messages. Orders keep coming in either way; a
 * paused shop's order cards offer "confirm by hand". Resuming starts the
 * shop's failure count afresh, so the 15-minute check does not pause it again
 * for what failed before.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminPermission(request, "pause_whatsapp");
  if (auth instanceof NextResponse) return auth;

  const id = z.string().uuid().safeParse((await params).id);
  if (!id.success) return NextResponse.json({ error: "Invalid merchant id" }, { status: 400 });
  const body = BodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Send { paused: true | false }" }, { status: 400 });

  try {
    const { data, error } = await createAdminClient().rpc("admin_whatsapp_pause", {
      p_tenant_id: id.data,
      p_pause: body.data.paused,
      p_admin_id: auth.user.id,
    });
    if (error) {
      if (error.code === "P0002") return NextResponse.json({ error: "Merchant not found" }, { status: 404 });
      throw error;
    }
    const result = resultSchema.parse(data);

    await logAdminActivity({
      adminUserId: auth.user.id,
      actorEmail: auth.user.email ?? null,
      tenantId: id.data,
      action: body.data.paused ? "pause_whatsapp" : "resume_whatsapp",
      details: { paused: result.paused },
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("WhatsApp pause error:", error);
    return NextResponse.json({ error: "Failed to change the shop's WhatsApp" }, { status: 500 });
  }
}
