import { NextResponse } from "next/server";
import { z } from "zod";
import { consumeRateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { reportOrderError } from "@/lib/order-telemetry";
import type { createSupabaseServiceClient } from "@/lib/supabase-server";

// Server side of scan-to-sign-in (lib/computer-sign-in.ts): the row as the
// routes read it, and the per-key limits each route spends before any work.

type ServiceClient = ReturnType<typeof createSupabaseServiceClient>;

export const COMPUTER_SIGN_INS = "computer_sign_ins";

export const computerSignInRowSchema = z.object({
    id: z.uuid(),
    secret_hash: z.string(),
    created_at: z.string(),
    expires_at: z.string(),
    browser: z.string(),
    os: z.string(),
    country: z.string().nullable(),
    approved_user_id: z.uuid().nullable(),
    approved_at: z.string().nullable(),
    declined_at: z.string().nullable(),
    used_at: z.string().nullable(),
});
export type ComputerSignInRow = z.infer<typeof computerSignInRowSchema>;

const ROW_COLUMNS = "id, secret_hash, created_at, expires_at, browser, os, country, approved_user_id, approved_at, declined_at, used_at";

export async function readComputerSignIn(admin: ServiceClient, id: string): Promise<ComputerSignInRow | null> {
    const { data, error } = await admin.from(COMPUTER_SIGN_INS).select(ROW_COLUMNS).eq("id", id).maybeSingle();
    if (error) throw new Error(`computer_sign_ins read failed: ${error.message}`);
    return data ? computerSignInRowSchema.parse(data) : null;
}

/**
 * Spends one unit of each limit. Returns a 429 for the first one used up, or
 * null to go on. A broken limiter lets the request through and is reported.
 */
export async function spendLimits(
    limits: readonly (readonly [key: string, max: number])[],
    windowSeconds: number,
    operation: string,
): Promise<NextResponse | null> {
    for (const [key, max] of limits) {
        const limit = await consumeRateLimit(key, max, windowSeconds);
        if (limit.error) reportOrderError(new Error(`Rate limiter unavailable: ${limit.error}`), { operation });
        if (!limit.allowed) {
            return NextResponse.json({ success: false, code: "too_many" }, { status: 429, headers: rateLimitHeaders(limit, max) });
        }
    }
    return null;
}

export const NO_STORE = { "Cache-Control": "no-store" } as const;
