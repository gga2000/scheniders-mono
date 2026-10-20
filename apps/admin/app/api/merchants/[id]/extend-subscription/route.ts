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
  // Grants paid subscription time without a payment — super_admin only.
  const auth = await requireAdminPermission(request, "manage_subscription");
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

    const { data: sub, error: fetchError } = await supabase
      .from("subscriptions")
      .select("current_period_end")
      .eq("tenant_id", id)
      .single();

    if (fetchError) {
      if (fetchError.code === "PGRST116") {
        return NextResponse.json(
          { error: "No subscription found for this merchant" },
          { status: 404 }
        );
      }
      throw fetchError;
    }

    const base =
      sub.current_period_end && new Date(sub.current_period_end) > new Date()
        ? new Date(sub.current_period_end)
        : new Date();
    const newEnd = new Date(base.getTime() + parsed.data.days * 24 * 60 * 60 * 1000);

    const { data, error } = await supabase
      .from("subscriptions")
      .update({ current_period_end: newEnd.toISOString(), status: "active" })
      .eq("tenant_id", id)
      .select("tenant_id, current_period_end, status")
      .single();

    if (error) throw error;

    await supabase
      .from("tenants")
      .update({ status: "active" })
      .eq("id", id);

    return NextResponse.json(data);
  } catch (error) {
    console.error("Extend subscription error:", error);
    return NextResponse.json(
      { error: "Failed to extend subscription" },
      { status: 500 }
    );
  }
}
