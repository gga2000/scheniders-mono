import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/admin-supabase";
import { z } from "zod";

const patchSchema = z.object({
  status: z.enum(["active", "trial", "suspended", "cancelled"]).optional(),
  plan: z.enum(["starter", "growth", "professional", "enterprise"]).optional(),
}).refine((d) => d.status || d.plan, { message: "At least one field required" });

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const supabase = createAdminClient();

    const [
      tenantResult,
      walletResult,
      subscriptionResult,
      transactionsResult,
      usageResult,
      teamResult,
      notesResult,
      orderCountResult,
    ] = await Promise.all([
      supabase.from("tenants").select("*").eq("id", id).single(),
      supabase.from("wallet").select("*").eq("tenant_id", id).single(),
      supabase
        .from("subscriptions")
        .select("*")
        .eq("tenant_id", id)
        .single(),
      supabase
        .from("wallet_transactions")
        .select("*")
        .eq("tenant_id", id)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("usage_tracking")
        .select("*")
        .eq("tenant_id", id)
        .order("year", { ascending: false })
        .order("month", { ascending: false })
        .limit(6),
      supabase
        .from("tenant_members")
        .select("*, user_profiles(*)")
        .eq("tenant_id", id),
      supabase
        .from("admin_notes")
        .select("*")
        .eq("tenant_id", id)
        .order("created_at", { ascending: false }),
      supabase
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", id),
    ]);

    if (tenantResult.error) {
      if (tenantResult.error.code === "PGRST116") {
        return NextResponse.json(
          { error: "Merchant not found" },
          { status: 404 }
        );
      }
      throw tenantResult.error;
    }

    return NextResponse.json({
      tenant: tenantResult.data,
      wallet: walletResult.data ?? null,
      subscription: subscriptionResult.data ?? null,
      transactions: transactionsResult.data ?? [],
      usage: usageResult.data ?? [],
      team: teamResult.data ?? [],
      notes: notesResult.data ?? [],
      orderCount: orderCountResult.count ?? 0,
    });
  } catch (error) {
    console.error("Merchant detail API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch merchant details" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const body = await request.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid body" },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();
    const updates: Record<string, string> = {};

    if (parsed.data.status) updates.status = parsed.data.status;
    if (parsed.data.plan) updates.plan = parsed.data.plan;

    const { data, error } = await supabase
      .from("tenants")
      .update(updates)
      .eq("id", id)
      .select("id, status, plan")
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return NextResponse.json({ error: "Merchant not found" }, { status: 404 });
      }
      throw error;
    }

    // If plan changed, also update subscription
    if (parsed.data.plan) {
      await supabase
        .from("subscriptions")
        .update({ plan: parsed.data.plan })
        .eq("tenant_id", id);
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("Merchant PATCH error:", error);
    return NextResponse.json(
      { error: "Failed to update merchant" },
      { status: 500 }
    );
  }
}
