import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRequestCaller } from "@/lib/auth/require-request-caller";
import { withFailureReport } from "@/lib/job-monitor";
import { createSupabaseServiceClient } from "@/lib/supabase-server";
import { QiApiError, blockQiToken, qiConfigFromEnv } from "@/lib/qi/client";
import { REFILL_AMOUNTS } from "@/lib/qi/refill";

export const dynamic = "force-dynamic";

let _supabaseAdmin: ReturnType<typeof createSupabaseServiceClient> | null = null;
const supabaseAdmin = () => (_supabaseAdmin ??= createSupabaseServiceClient());

const patchSchema = z
    .object({
        autoRefill: z.boolean().optional(),
        refillAmount: z
            .number()
            .int()
            .refine((n) => (REFILL_AMOUNTS as readonly number[]).includes(n))
            .optional(),
    })
    .refine((b) => b.autoRefill !== undefined || b.refillAmount !== undefined);

/**
 * PATCH /api/billing/qi/card  { autoRefill?, refillAmount? }
 * Switch auto refill on or off, or change how much it adds (store admins).
 * Switching it back on clears the failed-charge count.
 */
async function handlePATCH(request: NextRequest) {
    const caller = await requireRequestCaller(request, "tenant-admin");
    if (!caller.ok) return caller.response;

    const parsed = patchSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });

    const { data, error } = await supabaseAdmin()
        .from("qi_saved_cards")
        .update({
            ...(parsed.data.autoRefill === undefined ? {} : { auto_refill: parsed.data.autoRefill }),
            ...(parsed.data.autoRefill ? { failures: 0 } : {}),
            ...(parsed.data.refillAmount === undefined ? {} : { refill_amount_iqd: parsed.data.refillAmount }),
            updated_at: new Date().toISOString(),
        })
        .eq("tenant_id", caller.tenantId)
        .select("tenant_id");
    if (error) throw error;
    if (!data?.length) return NextResponse.json({ error: "no_card" }, { status: 404 });
    return NextResponse.json({ ok: true });
}

/**
 * DELETE /api/billing/qi/card
 * Remove the store's saved card: block it at Qi first, so it can never be
 * charged again, then forget it.
 */
async function handleDELETE(request: NextRequest) {
    const caller = await requireRequestCaller(request, "tenant-admin");
    if (!caller.ok) return caller.response;

    const config = qiConfigFromEnv();
    if (!config) return NextResponse.json({ error: "qi_not_configured" }, { status: 503 });

    const { data: card, error } = await supabaseAdmin()
        .from("qi_saved_cards")
        .select("token")
        .eq("tenant_id", caller.tenantId)
        .maybeSingle();
    if (error) throw error;
    if (!card) return NextResponse.json({ ok: true });

    try {
        await blockQiToken(config, card.token, crypto.randomUUID());
    } catch (err) {
        if (!(err instanceof QiApiError)) throw err;
        console.error("[qi] block card refused", { status: err.status, code: err.code, message: err.message });
        return NextResponse.json({ error: "qi_refused" }, { status: 502 });
    }

    const { error: deleteError } = await supabaseAdmin()
        .from("qi_saved_cards")
        .delete()
        .eq("tenant_id", caller.tenantId)
        .eq("token", card.token);
    if (deleteError) throw deleteError;
    return NextResponse.json({ ok: true });
}

export const PATCH = withFailureReport("api/billing/qi/card PATCH", handlePATCH);
export const DELETE = withFailureReport("api/billing/qi/card DELETE", handleDELETE);
