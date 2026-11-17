import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/admin-supabase";
import { requireAdminPermission } from "@/lib/api-auth";
import { notAnId } from "@/lib/route-id";

const bodySchema = z.object({ direction: z.enum(["up", "down"]) });

const resultSchema = z.discriminatedUnion("success", [
  z.object({ success: z.literal(true), place: z.number().int(), of: z.number().int() }),
  z.object({ success: z.literal(false), error: z.enum(["not_found", "at_edge"]) }),
]);

const REFUSALS = {
  not_found: { status: 404, error: "This industry no longer exists." },
  at_edge: { status: 409, error: "This industry is already at the end of the list." },
} as const;

/**
 * POST /api/industries/[id]/move { direction } — one place up or down in
 * Settings > Industries (and in the order the shop onboarding wizard shows).
 * The database moves it, renumbers the list so no two share a place, and
 * writes the staff log row, in one transaction. It used to be two saves that
 * traded numbers: two industries with the same number never moved, and a
 * refused second save left them sharing one.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminPermission(request, "update_settings");
  if (admin instanceof NextResponse) return admin;

  const { id } = await params;
  const missing = notAnId(id);
  if (missing) return missing;
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: 'Send { direction: "up" | "down" }' }, { status: 400 });

  try {
    const { data, error } = await createAdminClient().rpc("admin_move_industry", {
      _industry_id: id,
      _step: body.data.direction === "up" ? -1 : 1,
      _admin_user_id: admin.user.id,
      _email: admin.user.email ?? null,
    });
    if (error) throw error;

    const result = resultSchema.parse(data);
    if (!result.success) {
      const refused = REFUSALS[result.error];
      return NextResponse.json({ error: refused.error }, { status: refused.status });
    }
    return NextResponse.json({ place: result.place, of: result.of });
  } catch (error) {
    console.error("Industry move error:", error);
    return NextResponse.json({ error: "Failed to move the industry" }, { status: 500 });
  }
}
