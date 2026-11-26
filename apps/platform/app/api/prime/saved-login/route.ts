import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase-server";
import { requireRequestCaller } from "@/lib/auth/require-request-caller";
import { consumeRateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { withFailureReport } from "@/lib/job-monitor";
import { openPrimePassword, primeLoginKeyFromEnv } from "@/lib/prime/login-seal";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };
/** Times a store may open its saved password in a minute. */
const REVEAL_LIMIT = 10;
const REVEAL_WINDOW_SECONDS = 60;

/**
 * GET /api/prime/saved-login — the Prime app sign-in the store picked when it
 * asked us for a new Prime account, so the owner can look it up when they
 * forget it. Answers `{ saved: null }` for a store that has none.
 *
 * The login is shown to the store's admins. `?reveal=1` also opens the
 * password, for the store's own admin only: not our staff acting as a store
 * admin, and not a look-only support view.
 */
async function handleGET(request: NextRequest) {
    const caller = await requireRequestCaller(request, "tenant-admin");
    if (!caller.ok) return caller.response;

    const db = createSupabaseServiceClient();
    const { data, error } = await db
        .from("prime_saved_logins")
        .select("login_id, password_sealed")
        .eq("tenant_id", caller.tenantId)
        .maybeSingle();
    if (error) throw new Error(`prime_saved_logins read failed: ${error.message}`);
    if (!data) return NextResponse.json({ success: true, saved: null }, { headers: NO_STORE });

    const reveal = request.nextUrl.searchParams.get("reveal") === "1";
    if (!reveal) return NextResponse.json({ success: true, saved: { loginId: data.login_id } }, { headers: NO_STORE });

    if (caller.role !== "admin" || caller.readOnly) {
        return NextResponse.json({ success: false, error: "Only the store's own admin can see the password." }, { status: 403 });
    }
    const limit = await consumeRateLimit(`prime-saved-login:${caller.tenantId}`, REVEAL_LIMIT, REVEAL_WINDOW_SECONDS);
    if (!limit.allowed) {
        return NextResponse.json(
            { success: false, error: "حاولت هواية مرات. انتظر دقيقة وحاول مرة ثانية." },
            { status: 429, headers: rateLimitHeaders(limit, REVEAL_LIMIT) },
        );
    }
    const key = primeLoginKeyFromEnv();
    if (!key) throw new Error("PRIME_LOGIN_KEY is not set: cannot open the saved Prime password");
    const password = openPrimePassword(data.password_sealed, caller.tenantId, key);
    return NextResponse.json({ success: true, saved: { loginId: data.login_id, password } }, { headers: NO_STORE });
}

export const GET = withFailureReport("api/prime/saved-login GET", handleGET);
