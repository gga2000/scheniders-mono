import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { withFailureReport } from "@/lib/job-monitor";
import { requestIp } from "@/lib/request-ip";
import { newSecretTicket } from "@/lib/secret-ticket";
import { SIGN_IN_CODE_LIFE_MS, describeDevice } from "@/lib/computer-sign-in";
import { COMPUTER_SIGN_INS, NO_STORE, spendLimits } from "@/lib/computer-sign-in-server";
import { createSupabaseServiceClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

// A sign-in page asks for a new code every few minutes while it stays open.
// Mobile carriers and offices share addresses, so the cap is wide.
const IP_LIMIT = 60;
const WINDOW_SECONDS = 10 * 60;

const bodySchema = z.object({ touch: z.boolean().optional() });

/**
 * POST /api/auth/computer-sign-in { touch? } (no account yet): a new code for
 * the computer's sign-in page (lib/computer-sign-in.ts). Returns the request
 * id, which goes in the QR code, and the secret, which stays on this page.
 */
async function handlePOST(request: NextRequest): Promise<NextResponse> {
    const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ success: false, code: "invalid" }, { status: 400 });

    const limited = await spendLimits([[`computer-sign-in:new:${requestIp(request)}`, IP_LIMIT]], WINDOW_SECONDS, "computer-sign-in-new-rate-limit");
    if (limited) return limited;

    const { ticket, hash } = newSecretTicket();
    const device = describeDevice(request.headers.get("user-agent") ?? "", parsed.data.touch ?? false);
    const country = request.headers.get("x-vercel-ip-country")?.toUpperCase() ?? null;
    const expiresAt = new Date(Date.now() + SIGN_IN_CODE_LIFE_MS).toISOString();

    const { data, error } = await createSupabaseServiceClient()
        .from(COMPUTER_SIGN_INS)
        .insert({
            secret_hash: hash,
            expires_at: expiresAt,
            browser: device.browser,
            os: device.os,
            country: country && /^[A-Z]{2}$/.test(country) ? country : null,
        })
        .select("id")
        .single();
    if (error) throw new Error(`computer_sign_ins insert failed: ${error.message}`);
    const id = z.uuid().parse(data.id);

    return NextResponse.json({ success: true, data: { id, secret: ticket, expires_at: expiresAt } }, { headers: NO_STORE });
}

export const POST = withFailureReport("api/auth/computer-sign-in POST", handlePOST);
