import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/admin-supabase";
import { requireAdminPermission } from "@/lib/api-auth";
import { z } from "zod";

const bodySchema = z.object({
  days: z.number().int().positive().max(365),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Same permission as POST /api/trials/extend.
  const auth = await requireAdminPermission(request, "extend_trial");
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;

  try {
    const body = await request.json();
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid body" },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    const { data: tenant, error: fetchError } = await supabase
      .from("tenants")
      .select("trial_ends_at")
      .eq("id", id)
      .single();

    if (fetchError) {
      if (fetchError.code === "PGRST116") {
        return NextResponse.json({ error: "Merchant not found" }, { status: 404 });
      }
      throw fetchError;
    }

    const base =
      tenant.trial_ends_at && new Date(tenant.trial_ends_at) > new Date()
        ? new Date(tenant.trial_ends_at)
        : new Date();
    const newEnd = new Date(base.getTime() + parsed.data.days * 24 * 60 * 60 * 1000);

    const { data, error } = await supabase
      .from("tenants")
      .update({ trial_ends_at: newEnd.toISOString(), status: "trial" })
      .eq("id", id)
      .select("id, trial_ends_at, status")
      .single();

    if (error) throw error;

    return NextResponse.json(data);
  } catch (error) {
    console.error("Extend trial error:", error);
    return NextResponse.json(
      { error: "Failed to extend trial" },
      { status: 500 }
    );
  }
}
