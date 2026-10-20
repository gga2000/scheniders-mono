import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/admin-supabase";
import { logAdminActivity } from "@/lib/activity-logger";
import { requireAdminPermission } from "@/lib/api-auth";

const BodySchema = z.object({
  period_days: z.number().int().positive().max(365).default(30),
  reason: z.string().max(500).optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Turns a trial into a paid, active subscription — super_admin only.
  const auth = await requireAdminPermission(request, "manage_subscription");
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;

  try {
    const body = await request.json().catch(() => ({}));
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid body" },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    const { data: tenant, error: tenantErr } = await supabase
      .from("tenants")
      .select("id, status, plan, trial_ends_at")
      .eq("id", id)
      .single();

    if (tenantErr) {
      if (tenantErr.code === "PGRST116") {
        return NextResponse.json({ error: "Merchant not found" }, { status: 404 });
      }
      throw tenantErr;
    }

    if (tenant.status !== "trial") {
      return NextResponse.json(
        { error: `Cannot convert: merchant status is ${tenant.status}, not trial` },
        { status: 409 }
      );
    }

    const now = new Date();
    const periodEnd = new Date(
      now.getTime() + parsed.data.period_days * 24 * 60 * 60 * 1000
    );

    // 1. Set tenant status to active
    const { error: updateTenantErr } = await supabase
      .from("tenants")
      .update({ status: "active" })
      .eq("id", id);
    if (updateTenantErr) throw updateTenantErr;

    // 2. Upsert subscription
    const { data: existingSub } = await supabase
      .from("subscriptions")
      .select("id")
      .eq("tenant_id", id)
      .maybeSingle();

    if (existingSub) {
      const { error } = await supabase
        .from("subscriptions")
        .update({
          plan: tenant.plan,
          status: "active",
          current_period_start: now.toISOString(),
          current_period_end: periodEnd.toISOString(),
          auto_renew: true,
        })
        .eq("tenant_id", id);
      if (error) throw error;
    } else {
      const { error } = await supabase.from("subscriptions").insert({
        tenant_id: id,
        plan: tenant.plan,
        status: "active",
        current_period_start: now.toISOString(),
        current_period_end: periodEnd.toISOString(),
        auto_renew: true,
      });
      if (error) throw error;
    }

    await logAdminActivity({
      adminUserId: auth.user.id,
      actorEmail: auth.user.email ?? null,
      tenantId: id,
      action: "convert_trial",
      details: {
        plan: tenant.plan,
        period_days: parsed.data.period_days,
        reason: parsed.data.reason ?? null,
      },
    });

    return NextResponse.json({
      ok: true,
      status: "active",
      current_period_end: periodEnd.toISOString(),
    });
  } catch (error) {
    console.error("Convert trial error:", error);
    return NextResponse.json(
      { error: "Failed to convert trial to paid" },
      { status: 500 }
    );
  }
}
