import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/admin-supabase";
import { requireAdminPermission } from "@/lib/api-auth";

const ExtendSchema = z.object({
  tenant_id: z.string().min(1),
  days: z.number().int().min(1).max(90),
});

export async function POST(request: NextRequest) {
  const auth = await requireAdminPermission(request, "extend_trial");
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await request.json();
    const parsed = ExtendSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { tenant_id, days } = parsed.data;
    const supabase = createAdminClient();

    // 1. Get current tenant
    const { data: tenant, error: fetchError } = await supabase
      .from("tenants")
      .select("trial_ends_at, status")
      .eq("id", tenant_id)
      .single();

    if (fetchError || !tenant) {
      return NextResponse.json(
        { error: "Tenant not found" },
        { status: 404 }
      );
    }

    // 2. Verify status is trial
    if (tenant.status !== "trial") {
      return NextResponse.json(
        { error: "Tenant is not on a trial plan" },
        { status: 400 }
      );
    }

    // 3. Calculate new trial_ends_at: max(current trial_ends_at, now) + days
    const currentEnd = new Date(tenant.trial_ends_at).getTime();
    const now = Date.now();
    const base = Math.max(currentEnd, now);
    const newDate = new Date(base + days * 24 * 60 * 60 * 1000);

    // 4. Update tenant
    const { error: updateError } = await supabase
      .from("tenants")
      .update({ trial_ends_at: newDate.toISOString() })
      .eq("id", tenant_id);

    if (updateError) throw updateError;

    return NextResponse.json({
      success: true,
      new_trial_ends_at: newDate.toISOString(),
    });
  } catch (error) {
    console.error("Extend trial error:", error);
    return NextResponse.json(
      { error: "Failed to extend trial" },
      { status: 500 }
    );
  }
}
