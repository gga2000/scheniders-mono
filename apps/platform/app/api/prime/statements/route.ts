import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServiceClient } from "@/lib/supabase-server";
import { requireRequestCaller } from "@/lib/auth/require-request-caller";
import { getPrimeClient, isPrimeUnreachable, PrimeApiError } from "@/lib/prime/client";
import { loadPrimeConnection } from "@/lib/prime/connection";
import { acceptPrimePrice, approvePrimePayment, loadPrimeApprovals, loadPrimePayment, loadPrimePaymentChecks } from "@/lib/prime/payment-check";
import { primeStatementEntry, PRIME_STATEMENTS_PAGE } from "@/lib/prime/statement-load";

export const dynamic = "force-dynamic";

const querySchema = z.object({ id: z.coerce.number().int().positive().optional() });

const bodySchema = z.discriminatedUnion("action", [
    z.object({ action: z.literal("approve"), id: z.number().int().positive() }),
    z.object({ action: z.literal("accept_price"), id: z.number().int().positive(), orderId: z.string().uuid() }),
]);

function primeFailure(err: unknown) {
    if (isPrimeUnreachable(err)) return NextResponse.json({ success: false, reason: "prime_unreachable" }, { status: 502 });
    if (err instanceof PrimeApiError) return NextResponse.json({ success: false, reason: "prime_rejected", message: err.message }, { status: 502 });
    throw err;
}

async function primeLink(tenantId: string) {
    const client = getPrimeClient();
    const db = createSupabaseServiceClient();
    const connection = client ? await loadPrimeConnection(db, tenantId) : null;
    return client && connection ? { client, db, connection } : null;
}

/**
 * GET /api/prime/statements — what Prime paid the store: the latest payments,
 * each with how its parcels matched our orders (when checked) and whether it
 * is already closed in our books, with the newest one checked now.
 * GET ?id=… — one payment's parcels, each matched to its order. Money, so
 * administrators only; the merchant is the caller's own tenant's Prime link,
 * never the request's.
 */
export async function GET(request: NextRequest) {
    const caller = await requireRequestCaller(request, "tenant-admin");
    if (!caller.ok) return caller.response;

    const parsed = querySchema.safeParse({ id: request.nextUrl.searchParams.get("id") ?? undefined });
    if (!parsed.success) return NextResponse.json({ success: false, error: "Invalid statement id" }, { status: 400 });

    const link = await primeLink(caller.tenantId);
    if (!link) return NextResponse.json({ success: true, connected: false });
    const { client, db, connection } = link;

    try {
        if (parsed.data.id !== undefined) {
            const { statement, approval } = await loadPrimePayment(db, client, caller.tenantId, connection, parsed.data.id);
            return NextResponse.json({ success: true, connected: true, statement, approval });
        }
        const entries = (await client.paymentReceipts(connection.merchantLoginId, 0, PRIME_STATEMENTS_PAGE)).map(primeStatementEntry);
        const newest = entries[0];
        const latest = newest ? { id: newest.id, summary: (await loadPrimePayment(db, client, caller.tenantId, connection, newest.id)).statement.summary } : null;
        const ids = entries.map((e) => e.id);
        const [checks, approvals] = await Promise.all([loadPrimePaymentChecks(db, caller.tenantId, ids), loadPrimeApprovals(db, caller.tenantId, ids)]);
        const statements = entries.map((e) => ({ ...e, check: checks.get(e.id) ?? null, approval: approvals.get(e.id) ?? null }));
        return NextResponse.json({ success: true, connected: true, statements, latest });
    } catch (err) {
        return primeFailure(err);
    }
}

/**
 * POST /api/prime/statements — {action:"approve", id} closes a payment's
 * matched orders as paid; {action:"accept_price", id, orderId} takes what
 * Prime collected for one of the payment's parcels as the order's price.
 * Administrators only; every amount is read from Prime again here.
 */
export async function POST(request: NextRequest) {
    const caller = await requireRequestCaller(request, "tenant-admin");
    if (!caller.ok) return caller.response;

    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ success: false, error: "Invalid request" }, { status: 400 });

    const link = await primeLink(caller.tenantId);
    if (!link) return NextResponse.json({ success: false, reason: "not_connected" }, { status: 409 });
    const { client, db, connection } = link;

    try {
        if (parsed.data.action === "approve") {
            const outcome = await approvePrimePayment(db, client, caller.tenantId, connection, parsed.data.id, caller.userId);
            if (outcome.kind === "unknown_payment") return NextResponse.json({ success: false, reason: "unknown_payment" }, { status: 404 });
            return NextResponse.json({ success: true, outcome });
        }
        const outcome = await acceptPrimePrice(db, client, caller.tenantId, connection, parsed.data.id, parsed.data.orderId);
        if (outcome.kind === "not_on_payment") return NextResponse.json({ success: false, reason: "not_on_payment" }, { status: 404 });
        if (outcome.kind === "conflict") return NextResponse.json({ success: false, reason: "conflict" }, { status: 409 });
        if (outcome.kind === "prepaid") return NextResponse.json({ success: false, reason: "prepaid" }, { status: 409 });
        return NextResponse.json({ success: true, outcome });
    } catch (err) {
        return primeFailure(err);
    }
}
