import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServiceClient } from "@/lib/supabase-server";
import { requireRequestCaller } from "@/lib/auth/require-request-caller";
import { callerHasPermission } from "@/lib/auth/caller-has-permission";
import { PERMISSIONS } from "@/lib/permissions";
import { getPrimeClient, isPrimeUnreachable, PrimeApiError, type PrimeClient } from "@/lib/prime/client";
import { loadPrimeConnection } from "@/lib/prime/connection";
import { placeTickets, PRIME_TICKETS_PAGE, tenantCases, ticketMessages } from "@/lib/prime/tickets";
import { withFailureReport } from "@/lib/job-monitor";

export const dynamic = "force-dynamic";

const querySchema = z.object({ id: z.coerce.number().int().positive().optional() });

const message = z.string().trim().min(1).max(1000);
const bodySchema = z.discriminatedUnion("action", [
    z.object({ action: z.literal("open"), orderId: z.string().uuid(), subjectCode: z.string().trim().min(1).max(60), message }),
    z.object({ action: z.literal("message"), ticketId: z.number().int().positive(), message }),
]);

type ServiceDb = ReturnType<typeof createSupabaseServiceClient>;

function primeFailure(err: unknown): NextResponse {
    if (isPrimeUnreachable(err)) return NextResponse.json({ success: false, reason: "prime_unreachable" }, { status: 502 });
    if (err instanceof PrimeApiError) return NextResponse.json({ success: false, reason: "prime_rejected", message: err.message }, { status: 502 });
    throw err;
}

/** The ticket's chat when its parcel is the tenant's, else null (Prime's tickets are shared by every tenant of this app). */
async function ownedChat(db: ServiceDb, client: PrimeClient, tenantId: string, ticketId: number) {
    const chat = await client.ticketChat(ticketId);
    const owned = await tenantCases(db, tenantId, chat.caseId ? [chat.caseId] : []);
    return chat.caseId && owned.has(chat.caseId) ? chat : null;
}

/**
 * GET /api/prime/tickets — the tenant's tickets with Prime and the subjects a
 * new one can take. GET ?id=… — one ticket's chat. Any member may read.
 */
async function handleGET(request: NextRequest) {
    const caller = await requireRequestCaller(request, "member");
    if (!caller.ok) return caller.response;

    const parsed = querySchema.safeParse({ id: request.nextUrl.searchParams.get("id") ?? undefined });
    if (!parsed.success) return NextResponse.json({ success: false, error: "Invalid ticket id" }, { status: 400 });

    const client = getPrimeClient();
    const db = createSupabaseServiceClient();
    const connection = client ? await loadPrimeConnection(db, caller.tenantId) : null;
    if (!client || !connection) return NextResponse.json({ success: true, connected: false });

    try {
        if (parsed.data.id !== undefined) {
            const chat = await ownedChat(db, client, caller.tenantId, parsed.data.id);
            if (!chat) return NextResponse.json({ success: false, error: "Ticket not found" }, { status: 404 });
            return NextResponse.json({ success: true, connected: true, open: chat.status !== "CLS", messages: ticketMessages(chat) });
        }
        const [tickets, subjects] = await Promise.all([
            client.tickets(connection.merchantLoginId, 0, PRIME_TICKETS_PAGE),
            client.ticketSubjects(),
        ]);
        return NextResponse.json({
            success: true,
            connected: true,
            tickets: await placeTickets(db, caller.tenantId, tickets),
            subjects: subjects
                .map((s) => ({ code: s.code, name: s.description?.trim() || s.code, sequence: s.sequence ?? 0 }))
                .sort((a, b) => a.sequence - b.sequence),
        });
    } catch (err) {
        return primeFailure(err);
    }
}

/**
 * POST /api/prime/tickets — {action:"open", orderId, subjectCode, message}
 * opens a ticket on the order's parcel; {action:"message", ticketId, message}
 * writes into a ticket's chat. Any member may write; the parcel must be one
 * of the caller's tenant's shipments. Writing to the courier is order work,
 * so the caller needs orders.edit (a viewer may read tickets, not open them).
 */
async function handlePOST(request: NextRequest) {
    const caller = await requireRequestCaller(request, "member");
    if (!caller.ok) return caller.response;
    const permission = await callerHasPermission(request, caller, PERMISSIONS.EDIT_ORDERS, "prime-tickets");
    if (!permission.ok) return permission.response;

    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ success: false, error: "Invalid request" }, { status: 400 });

    const client = getPrimeClient();
    const db = createSupabaseServiceClient();
    const connection = client ? await loadPrimeConnection(db, caller.tenantId) : null;
    if (!client || !connection) return NextResponse.json({ success: false, reason: "not_connected" }, { status: 409 });

    try {
        if (parsed.data.action === "open") {
            const { data, error } = await db
                .from("prime_shipments")
                .select("case_id")
                .eq("tenant_id", caller.tenantId)
                .eq("order_id", parsed.data.orderId)
                .maybeSingle();
            if (error) throw new Error(error.message);
            if (!data) return NextResponse.json({ success: false, reason: "not_sent" }, { status: 404 });
            const ticketId = await client.openTicket(Number(data.case_id), parsed.data.subjectCode, parsed.data.message);
            return NextResponse.json({ success: true, ticketId });
        }
        const chat = await ownedChat(db, client, caller.tenantId, parsed.data.ticketId);
        if (!chat) return NextResponse.json({ success: false, error: "Ticket not found" }, { status: 404 });
        await client.writeTicketMessage(parsed.data.ticketId, parsed.data.message);
        return NextResponse.json({ success: true });
    } catch (err) {
        return primeFailure(err);
    }
}

export const GET = withFailureReport("api/prime/tickets GET", handleGET);
export const POST = withFailureReport("api/prime/tickets POST", handlePOST);
