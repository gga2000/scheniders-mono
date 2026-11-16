import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase-server";
import { requireRequestCaller, type RequestCaller } from "@/lib/auth/require-request-caller";
import { withFailureReport } from "@/lib/job-monitor";
import { supportPostSchema, supportRefusal, type SupportCase, type SupportMessage, type SupportThread } from "@/lib/support/schema";

export const dynamic = "force-dynamic";

type Caller = Extract<RequestCaller, { ok: true }>;
type ServiceDb = ReturnType<typeof createSupabaseServiceClient>;

/** How far back the chat shows; older lines stay on record for staff. */
const THREAD_LIMIT = 200;

/**
 * The signed-in member's own support thread in their active shop: their cases
 * (never a teammate's), newest first, and the messages inside them.
 */
async function loadThread(db: ServiceDb, caller: Caller): Promise<SupportThread> {
    const { data: caseRows, error: caseError } = await db
        .from("support_cases")
        .select("id, status, rating, solved_at, created_at, merchant_last_read_at")
        .eq("tenant_id", caller.tenantId)
        .eq("opened_by", caller.userId)
        .order("created_at", { ascending: false })
        .limit(20);
    if (caseError) throw new Error(`Support cases read failed: ${caseError.message}`);

    const cases = (caseRows ?? []) as (SupportCase & { merchant_last_read_at: string })[];
    if (cases.length === 0) return { case: null, messages: [], unread: 0 };

    const { data: messageRows, error: messageError } = await db
        .from("support_messages")
        .select("id, case_id, sender_kind, sender_name, body, created_at")
        .eq("tenant_id", caller.tenantId)
        .in("case_id", cases.map((c) => c.id))
        .order("created_at", { ascending: false })
        .limit(THREAD_LIMIT);
    if (messageError) throw new Error(`Support messages read failed: ${messageError.message}`);

    const messages = ((messageRows ?? []) as SupportMessage[]).reverse();
    const readAt = new Map(cases.map((c) => [c.id, c.merchant_last_read_at]));
    const unread = messages.filter((m) => {
        const seen = readAt.get(m.case_id);
        return m.sender_kind === "staff" && seen !== undefined && m.created_at > seen;
    }).length;

    const { id, status, rating, solved_at, created_at } = cases[0];
    return { case: { id, status, rating, solved_at, created_at }, messages, unread };
}

/** GET /api/support — my conversation with the support team. */
async function handleGET(request: NextRequest) {
    const caller = await requireRequestCaller(request, "member");
    if (!caller.ok) return caller.response;

    const thread = await loadThread(createSupabaseServiceClient(), caller);
    return NextResponse.json({ success: true, data: thread });
}

/** The name staff see on this member's messages. */
async function memberName(db: ServiceDb, caller: Caller): Promise<string> {
    const { data, error } = await db.from("user_profiles").select("display_name").eq("id", caller.userId).maybeSingle();
    if (error) throw new Error(`Profile read failed: ${error.message}`);
    const name = typeof data?.display_name === "string" ? data.display_name.trim() : "";
    return (name || caller.email || "Member").slice(0, 120);
}

/**
 * POST /api/support
 *   {action:"send", body, context}  write to support (opens a case if none is open)
 *   {action:"rate", caseId, rating} answer "did this solve it?" on a solved case
 *   {action:"read"}                 mark staff replies as seen
 * The shop and the member come from the session; a body cannot name either.
 */
async function handlePOST(request: NextRequest) {
    const caller = await requireRequestCaller(request, "member");
    if (!caller.ok) return caller.response;

    const parsed = supportPostSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ success: false, error: "Invalid request" }, { status: 400 });
    const input = parsed.data;

    const db = createSupabaseServiceClient();

    if (input.action === "read") {
        const { error } = await db
            .from("support_cases")
            .update({ merchant_last_read_at: new Date().toISOString() })
            .eq("tenant_id", caller.tenantId)
            .eq("opened_by", caller.userId);
        if (error) throw new Error(`Support read mark failed: ${error.message}`);
        return NextResponse.json({ success: true });
    }

    const { error } =
        input.action === "send"
            ? await db.rpc("support_merchant_send", {
                  p_tenant_id: caller.tenantId,
                  p_user_id: caller.userId,
                  p_user_name: await memberName(db, caller),
                  p_body: input.body,
                  p_context: input.context,
              })
            : await db.rpc("support_merchant_rate", {
                  p_tenant_id: caller.tenantId,
                  p_user_id: caller.userId,
                  p_case_id: input.caseId,
                  p_rating: input.rating,
              });

    const refusal = supportRefusal(error);
    if (refusal) return NextResponse.json({ success: false, error: refusal.code }, { status: refusal.status });
    if (error) throw new Error(`Support ${input.action} failed: ${error.message}`);

    return NextResponse.json({ success: true, data: await loadThread(db, caller) });
}

export const GET = withFailureReport("api/support GET", handleGET);
export const POST = withFailureReport("api/support POST", handlePOST);
