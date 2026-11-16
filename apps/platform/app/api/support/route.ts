import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase-server";
import { requireRequestCaller, type RequestCaller } from "@/lib/auth/require-request-caller";
import { withFailureReport } from "@/lib/job-monitor";
import { normalizeIraqiMobile } from "@scheniders/shared";
import {
    SUPPORT_SHOT_BUCKET,
    SUPPORT_VOICE_BUCKET,
    supportPostSchema,
    supportRefusal,
    type SupportCallBack,
    type SupportCase,
    type SupportMessage,
    type SupportThread,
} from "@/lib/support/schema";

export const dynamic = "force-dynamic";

type Caller = Extract<RequestCaller, { ok: true }>;
type ServiceDb = ReturnType<typeof createSupabaseServiceClient>;

/** How far back the chat shows; older lines stay on record for staff. */
const THREAD_LIMIT = 200;
/** How long a link to a picture or a voice note works. The chat refetches well before. */
const FILE_LINK_SECONDS = 60 * 60;

type MessageRow = Omit<SupportMessage, "screenshot_url" | "voice_url"> & {
    context: { screenshot?: unknown; voice?: unknown } | null;
};

/** Signed links for every path in one call; a file that is gone has no link. */
async function signPaths(db: ServiceDb, bucket: string, paths: string[]): Promise<Map<string, string>> {
    const links = new Map<string, string>();
    if (paths.length === 0) return links;
    const { data, error } = await db.storage.from(bucket).createSignedUrls(paths, FILE_LINK_SECONDS);
    if (error) throw new Error(`Support file links failed (${bucket}): ${error.message}`);
    for (const link of data ?? []) {
        if (link.path && link.signedUrl && !link.error) links.set(link.path, link.signedUrl);
    }
    return links;
}

const pathOf = (value: unknown): string | null => (typeof value === "string" ? value : null);

/** Links to the pictures and voice notes merchants sent, one call per kind. */
async function signFiles(db: ServiceDb, rows: MessageRow[]): Promise<SupportMessage[]> {
    const shots = rows.flatMap((r) => pathOf(r.context?.screenshot) ?? []);
    const voices = rows.flatMap((r) => pathOf(r.context?.voice) ?? []);
    const [shotLinks, voiceLinks] = await Promise.all([
        signPaths(db, SUPPORT_SHOT_BUCKET, shots),
        signPaths(db, SUPPORT_VOICE_BUCKET, voices),
    ]);
    return rows.map(({ context, ...row }) => {
        const shot = pathOf(context?.screenshot);
        const voice = pathOf(context?.voice);
        return {
            ...row,
            screenshot_url: shot ? (shotLinks.get(shot) ?? null) : null,
            voice_url: voice ? (voiceLinks.get(voice) ?? null) : null,
        };
    });
}

/** The name of the shop's support person (support_shop_owners), as staff set it. */
async function ownerName(db: ServiceDb, tenantId: string): Promise<string | null> {
    const { data, error } = await db
        .from("support_shop_owners")
        .select("admin_users(display_name)")
        .eq("tenant_id", tenantId)
        .maybeSingle();
    if (error) throw new Error(`Support owner read failed: ${error.message}`);
    const admin = (data as { admin_users: { display_name: string | null } | null } | null)?.admin_users;
    const name = admin?.display_name?.trim() ?? "";
    return name === "" ? null : name.slice(0, 60);
}

/** The call the shop asked for that staff have not made yet (one at most). */
async function openCallBack(db: ServiceDb, tenantId: string): Promise<SupportCallBack | null> {
    const { data, error } = await db
        .from("support_tasks")
        .select("phone, due_at")
        .eq("tenant_id", tenantId)
        .eq("kind", "call_back")
        .is("done_at", null)
        .maybeSingle();
    if (error) throw new Error(`Support call-back read failed: ${error.message}`);
    const row = data as { phone: string | null; due_at: string } | null;
    return row?.phone ? { phone: row.phone, due_at: row.due_at } : null;
}

/** The shop's contact mobile in 07XXXXXXXXX form, when it has a valid one. */
async function shopPhone(db: ServiceDb, tenantId: string): Promise<string | null> {
    const { data, error } = await db.from("tenants").select("contact_phone").eq("id", tenantId).maybeSingle();
    if (error) throw new Error(`Shop phone read failed: ${error.message}`);
    return normalizeIraqiMobile((data as { contact_phone: string | null } | null)?.contact_phone);
}

/** What the chat shows about the shop, beside the conversation itself. */
async function shopSide(db: ServiceDb, tenantId: string) {
    const owner = await ownerName(db, tenantId);
    const callBack = await openCallBack(db, tenantId);
    const contactPhone = await shopPhone(db, tenantId);
    return { owner, callBack, contactPhone };
}

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
    if (cases.length === 0) return { case: null, messages: [], unread: 0, ...(await shopSide(db, caller.tenantId)) };

    const { data: messageRows, error: messageError } = await db
        .from("support_messages")
        .select("id, case_id, sender_kind, sender_name, body, created_at, context")
        .eq("tenant_id", caller.tenantId)
        .in("case_id", cases.map((c) => c.id))
        .order("created_at", { ascending: false })
        .limit(THREAD_LIMIT);
    if (messageError) throw new Error(`Support messages read failed: ${messageError.message}`);

    const messages = await signFiles(db, ((messageRows ?? []) as MessageRow[]).reverse());
    const readAt = new Map(cases.map((c) => [c.id, c.merchant_last_read_at]));
    const unread = messages.filter((m) => {
        const seen = readAt.get(m.case_id);
        return m.sender_kind === "staff" && seen !== undefined && m.created_at > seen;
    }).length;

    const { id, status, rating, solved_at, created_at } = cases[0];
    return { case: { id, status, rating, solved_at, created_at }, messages, unread, ...(await shopSide(db, caller.tenantId)) };
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
 *   {action:"callBack", phone}      ask staff to call this number (a task in their Today list)
 * The shop and the member come from the session; a body cannot name either.
 */
async function handlePOST(request: NextRequest) {
    const caller = await requireRequestCaller(request, "member");
    if (!caller.ok) return caller.response;

    const parsed = supportPostSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
        const badPhone = parsed.error.issues.some((issue) => issue.message === "support_bad_phone");
        return NextResponse.json({ success: false, error: badPhone ? "support_bad_phone" : "Invalid request" }, { status: 400 });
    }
    const input = parsed.data;

    // A picture or voice note belongs to the shop that sent it: its path starts with the shop's id.
    if (input.action === "send") {
        const own = (path: string | undefined) => path === undefined || path.startsWith(`${caller.tenantId}/`);
        if (!own(input.context.screenshot) || !own(input.context.voice)) {
            return NextResponse.json({ success: false, error: "Invalid request" }, { status: 400 });
        }
    }

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
            : input.action === "callBack"
              ? await db.rpc("support_request_call_back", {
                    p_tenant_id: caller.tenantId,
                    p_user_id: caller.userId,
                    p_user_name: await memberName(db, caller),
                    p_phone: input.phone,
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
