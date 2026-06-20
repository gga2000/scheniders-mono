import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { assignAbArm } from "@scheniders/shared";
import type { Experiment } from "@scheniders/shared";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const bodySchema = z.object({
  tenant_id: z.string().uuid(),
  experiment_id: z.string().min(1),
  // EC19: accepted for back-compat but IGNORED — the arm is re-derived
  // server-side from the visitor key, so a client can't credit a chosen arm.
  arm_id: z.string().min(1).optional(),
  event_type: z.enum(["view", "add_to_cart", "click"]),
});

export async function POST(req: Request): Promise<NextResponse> {
  try {
    // 1. Parse + validate body.
    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }

    const { tenant_id, experiment_id, event_type } = parsed.data;

    // 2. Visitor key from httpOnly cookie — written by middleware.
    const visitor_key = (await cookies()).get("sb_vid")?.value;
    if (!visitor_key) {
      // Can't attribute — no-op (beacon is fire-and-forget; 204 is fine).
      return new NextResponse(null, { status: 204 });
    }

    const serviceClient = createSupabaseServiceClient();

    // 3. Anti-garbage validation: confirm the experiment + arm are real and running.
    const { data: tenant, error: tenantError } = await serviceClient
      .from("tenants")
      .select("store_config_v2")
      .eq("id", tenant_id)
      .single();

    if (tenantError || !tenant) {
      // Unknown tenant — silently ignore (stale/forged event).
      return new NextResponse(null, { status: 204 });
    }

    const storeConfig = tenant.store_config_v2 as
      | { experiments?: Experiment[] }
      | null
      | undefined;

    const experiments = storeConfig?.experiments ?? [];
    const experiment = experiments.find((e) => e.id === experiment_id);

    if (!experiment || experiment.status !== "running") {
      // Experiment not found or not running — silently ignore.
      return new NextResponse(null, { status: 204 });
    }

    // EC19: re-derive the visitor's arm deterministically from their key —
    // never trust a client-supplied arm_id (which would let an attacker pour
    // events into whichever arm they want to declare the "winner").
    const arm_id = assignAbArm(experiment, visitor_key);
    if (!arm_id) {
      // Visitor isn't bucketed (experiment paused / no arms) — ignore.
      return new NextResponse(null, { status: 204 });
    }

    // 4. Insert the event via service role (bypasses SELECT-only RLS).
    const { error: insertError } = await serviceClient
      .from("store_config_experiment_events")
      .insert({
        tenant_id,
        experiment_id,
        arm_id,
        visitor_key,
        event_type,
        revenue_iqd: null,
      });

    if (insertError) {
      console.error("[exp-event] insert error:", insertError);
      return new NextResponse(null, { status: 500 });
    }

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    console.error("[exp-event] unexpected error:", err);
    return new NextResponse(null, { status: 500 });
  }
}
