import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServiceClient } from "@/lib/supabase-server";
import { requireRequestCaller } from "@/lib/auth/require-request-caller";
import { getPrimeClient, isPrimeUnreachable, PrimeApiError } from "@/lib/prime/client";
import { loadPrimeConnection } from "@/lib/prime/connection";
import { loadPrimeStatement, primeStatementEntry, PRIME_STATEMENTS_PAGE } from "@/lib/prime/statement-load";

export const dynamic = "force-dynamic";

const querySchema = z.object({ id: z.coerce.number().int().positive().optional() });

/**
 * GET /api/prime/statements — what Prime paid the store: the latest payments,
 * with the newest one laid against our orders. GET ?id=… — one payment's
 * parcels, each matched to its order. Money, so administrators only; the
 * merchant is the caller's own tenant's Prime link, never the request's.
 */
export async function GET(request: NextRequest) {
    const caller = await requireRequestCaller(request, "tenant-admin");
    if (!caller.ok) return caller.response;

    const parsed = querySchema.safeParse({ id: request.nextUrl.searchParams.get("id") ?? undefined });
    if (!parsed.success) return NextResponse.json({ success: false, error: "Invalid statement id" }, { status: 400 });

    const client = getPrimeClient();
    const db = createSupabaseServiceClient();
    const connection = client ? await loadPrimeConnection(db, caller.tenantId) : null;
    if (!client || !connection) return NextResponse.json({ success: true, connected: false });

    try {
        if (parsed.data.id !== undefined) {
            const statement = await loadPrimeStatement(db, client, caller.tenantId, connection, parsed.data.id);
            return NextResponse.json({ success: true, connected: true, statement });
        }
        const entries = (await client.paymentReceipts(connection.merchantLoginId, 0, PRIME_STATEMENTS_PAGE)).map(primeStatementEntry);
        const newest = entries[0];
        const latest = newest ? { id: newest.id, summary: (await loadPrimeStatement(db, client, caller.tenantId, connection, newest.id)).summary } : null;
        return NextResponse.json({ success: true, connected: true, statements: entries, latest });
    } catch (err) {
        if (isPrimeUnreachable(err)) return NextResponse.json({ success: false, reason: "prime_unreachable" }, { status: 502 });
        if (err instanceof PrimeApiError) return NextResponse.json({ success: false, reason: "prime_rejected", message: err.message }, { status: 502 });
        throw err;
    }
}
