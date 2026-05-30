import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/admin-supabase";
import { requireAdminFromRequest } from "@/lib/api-auth";

export async function GET(request: NextRequest) {
  const auth = await requireAdminFromRequest(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const supabase = createAdminClient();

    // 1. Fetch all trial tenants
    const { data: tenants, error: tenantsError } = await supabase
      .from("tenants")
      .select(
        "id, business_name, slug, plan, status, trial_ends_at, city, contact_email, created_at"
      )
      .eq("status", "trial")
      .order("trial_ends_at", { ascending: true });

    if (tenantsError) throw tenantsError;

    const trialTenants = tenants ?? [];

    if (trialTenants.length === 0) {
      return NextResponse.json({
        trials: [],
        summary: { total: 0, expiringSoon: 0, expired: 0, healthy: 0 },
      });
    }

    // 2. Fetch wallets for these tenants
    const trialTenantIds = trialTenants.map((t) => t.id);
    const { data: wallets, error: walletsError } = await supabase
      .from("wallet")
      .select("tenant_id, balance_iqd")
      .in("tenant_id", trialTenantIds);

    if (walletsError) throw walletsError;

    // 3. Join in JS
    const walletMap = new Map(
      (wallets ?? []).map((w) => [w.tenant_id, w.balance_iqd])
    );

    const now = Date.now();

    const trials = trialTenants.map((t) => {
      const trialEnd = new Date(t.trial_ends_at).getTime();
      const days_remaining = Math.ceil((trialEnd - now) / (1000 * 60 * 60 * 24));
      const is_expired = days_remaining <= 0;
      return {
        ...t,
        balance_iqd: walletMap.get(t.id) ?? 0,
        days_remaining,
        is_expired,
      };
    });

    // 4. Compute summary
    const summary = {
      total: trials.length,
      expiringSoon: trials.filter((t) => t.days_remaining <= 3 && t.days_remaining > 0).length,
      expired: trials.filter((t) => t.days_remaining <= 0).length,
      healthy: trials.filter((t) => t.days_remaining > 3).length,
    };

    return NextResponse.json({ trials, summary });
  } catch (error) {
    console.error("Trials API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch trials" },
      { status: 500 }
    );
  }
}
