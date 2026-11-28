import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { withFailureReport } from "@/lib/job-monitor";
import { reportOrderError } from "@/lib/order-telemetry";
import { requestIp } from "@/lib/request-ip";
import { secretTicketMatches } from "@/lib/secret-ticket";
import { SIGN_IN_COLLECT_MS, computerSignInState } from "@/lib/computer-sign-in";
import { COMPUTER_SIGN_INS, NO_STORE, readComputerSignIn, spendLimits } from "@/lib/computer-sign-in-server";
import { createSupabaseServerClient, createSupabaseServiceClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

// The page asks every 2 seconds while its code is on screen (about 300 times
// in 10 minutes). Per address the cap leaves room for a few pages behind one
// carrier address; per request it is what one page needs, with room.
const IP_LIMIT = 1200;
const REQUEST_LIMIT = 400;
const WINDOW_SECONDS = 10 * 60;

const bodySchema = z.object({
    id: z.uuid(),
    secret: z.string().min(16).max(128),
});

const unknown = () => NextResponse.json({ success: false, code: "unknown" }, { status: 404, headers: NO_STORE });
const answer = (state: string) => NextResponse.json({ success: true, data: { state } }, { headers: NO_STORE });

/**
 * POST /api/auth/computer-sign-in/wait { id, secret }: the computer asking
 * whether its code was scanned. Once the phone said yes, the first ask with
 * the right secret spends the request and is answered with the session
 * cookies of the person on the phone (state "signed_in"). Answers nothing
 * about a request without its secret.
 */
async function handlePOST(request: NextRequest): Promise<NextResponse> {
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ success: false, code: "invalid" }, { status: 400 });
    const { id, secret } = parsed.data;

    const limited = await spendLimits(
        [[`computer-sign-in:wait:ip:${requestIp(request)}`, IP_LIMIT], [`computer-sign-in:wait:id:${id}`, REQUEST_LIMIT]],
        WINDOW_SECONDS,
        "computer-sign-in-wait-rate-limit",
    );
    if (limited) return limited;

    const admin = createSupabaseServiceClient();
    const row = await readComputerSignIn(admin, id);
    if (!row || !secretTicketMatches(secret, row.secret_hash)) return unknown();

    const state = computerSignInState(row);
    if (state !== "approved") return answer(state);

    // Spend it in one statement, so two asks at once cannot both collect.
    const now = Date.now();
    const { data: spent, error: spendError } = await admin
        .from(COMPUTER_SIGN_INS)
        .update({ used_at: new Date(now).toISOString() })
        .eq("id", id)
        .is("used_at", null)
        .not("approved_user_id", "is", null)
        .gt("approved_at", new Date(now - SIGN_IN_COLLECT_MS).toISOString())
        .select("approved_user_id")
        .maybeSingle();
    if (spendError) throw new Error(`computer_sign_ins spend failed: ${spendError.message}`);
    if (!spent) return answer("expired");
    const userId = z.uuid().parse(spent.approved_user_id);

    const { data: account, error: accountError } = await admin.auth.admin.getUserById(userId);
    const email = account?.user?.email;
    if (accountError || !email) {
        reportOrderError(new Error(`computer sign-in: no email for approved account (${accountError?.message ?? "none"})`), { operation: "computer-sign-in-account" });
        return answer("failed");
    }

    // A one-time sign-in token for that account, made here and used here at
    // once: nothing is emailed.
    const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: "magiclink", email });
    if (linkError || !link.properties?.hashed_token) {
        reportOrderError(new Error(`computer sign-in: token not made (${linkError?.message ?? "no token"})`), { operation: "computer-sign-in-token" });
        return answer("failed");
    }

    // The shared cookie client writes the new session onto this response.
    const supabase = await createSupabaseServerClient();
    const { error: verifyError } = await supabase.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: "magiclink" });
    if (verifyError) {
        reportOrderError(new Error(`computer sign-in: token refused (${verifyError.message})`), { operation: "computer-sign-in-verify" });
        return answer("failed");
    }
    return answer("signed_in");
}

export const POST = withFailureReport("api/auth/computer-sign-in/wait POST", handlePOST);
