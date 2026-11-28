import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { withFailureReport } from "@/lib/job-monitor";
import { requireRequestCaller } from "@/lib/auth/require-request-caller";
import { SIGN_IN_ANSWER_MARGIN_MS, computerSignInState } from "@/lib/computer-sign-in";
import { COMPUTER_SIGN_INS, NO_STORE, readComputerSignIn, spendLimits } from "@/lib/computer-sign-in-server";
import { createSupabaseServiceClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

// A person scans a few codes at most; the cap stops anyone walking ids.
const USER_LIMIT = 30;
const WINDOW_SECONDS = 10 * 60;

const idSchema = z.uuid();
const answerSchema = z.object({ answer: z.enum(["yes", "no"]) });

type Params = { params: Promise<{ id: string }> };

const gone = () => NextResponse.json({ success: false, code: "expired" }, { status: 410, headers: NO_STORE });

/**
 * GET /api/auth/computer-sign-in/<id> (signed-in phone): what the phone shows
 * before the person answers: the computer's browser, system and country, and
 * whether the code can still be answered.
 */
async function handleGET(request: NextRequest, { params }: Params): Promise<NextResponse> {
    const caller = await requireRequestCaller(request, "member");
    if (!caller.ok) return caller.response;
    const id = idSchema.safeParse((await params).id);
    if (!id.success) return gone();

    const limited = await spendLimits([[`computer-sign-in:look:${caller.userId}`, USER_LIMIT]], WINDOW_SECONDS, "computer-sign-in-look-rate-limit");
    if (limited) return limited;

    const row = await readComputerSignIn(createSupabaseServiceClient(), id.data);
    if (!row) return gone();
    return NextResponse.json(
        {
            success: true,
            data: {
                browser: row.browser,
                os: row.os,
                country: row.country,
                created_at: row.created_at,
                // Seen from the phone: a code in its last seconds can no longer be answered.
                state: computerSignInState(row, Date.now() + SIGN_IN_ANSWER_MARGIN_MS),
            },
        },
        { headers: NO_STORE },
    );
}

/**
 * POST /api/auth/computer-sign-in/<id> { answer: "yes" | "no" } (signed-in
 * phone): the person's answer. Yes names them on the request, so the waiting
 * computer is signed in as them. Only a code still on screen, not yet
 * answered and not in its last seconds (SIGN_IN_ANSWER_MARGIN_MS) can be
 * answered. A look-only support view is refused (it may not write), so it
 * can never hand its sign-in to a computer.
 */
async function handlePOST(request: NextRequest, { params }: Params): Promise<NextResponse> {
    const caller = await requireRequestCaller(request, "member");
    if (!caller.ok) return caller.response;
    const id = idSchema.safeParse((await params).id);
    if (!id.success) return gone();
    const body = answerSchema.safeParse(await request.json().catch(() => null));
    if (!body.success) return NextResponse.json({ success: false, code: "invalid" }, { status: 400 });

    const limited = await spendLimits([[`computer-sign-in:answer:${caller.userId}`, USER_LIMIT]], WINDOW_SECONDS, "computer-sign-in-answer-rate-limit");
    if (limited) return limited;

    const now = Date.now();
    const at = new Date(now).toISOString();
    const change = body.data.answer === "yes" ? { approved_user_id: caller.userId, approved_at: at } : { declined_at: at };
    const { data, error } = await createSupabaseServiceClient()
        .from(COMPUTER_SIGN_INS)
        .update(change)
        .eq("id", id.data)
        .is("approved_at", null)
        .is("declined_at", null)
        .gt("expires_at", new Date(now + SIGN_IN_ANSWER_MARGIN_MS).toISOString())
        .select("id")
        .maybeSingle();
    if (error) throw new Error(`computer_sign_ins answer failed: ${error.message}`);
    if (!data) return gone();
    return NextResponse.json({ success: true, data: { answer: body.data.answer } }, { headers: NO_STORE });
}

export const GET = withFailureReport("api/auth/computer-sign-in/[id] GET", handleGET);
export const POST = withFailureReport("api/auth/computer-sign-in/[id] POST", handlePOST);
