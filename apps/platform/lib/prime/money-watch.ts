import type { createSupabaseServiceClient } from "@/lib/supabase-server";
import type { PrimeClient, PrimeManifestCase } from "@/lib/prime/client";
import type { PrimeConnection } from "@/lib/prime/connection";
import { baghdadDayKey, baghdadDayStart } from "@/lib/order-window";
import { noticeForAdmins } from "@/lib/prime/notify";
import { matchPrimeCases, primeStatementEntry } from "@/lib/prime/statement-load";
import { primeTrack } from "@/lib/prime/track";

type ServiceDb = ReturnType<typeof createSupabaseServiceClient>;

/** How many of Prime's newest payments one run looks at. */
const PAYMENTS_PAGE = 10;
/** The evening summary goes out at the first run from this Baghdad hour. */
export const PRIME_DAILY_HOUR = 21;

export interface PrimePaymentsOutcome {
    /** New payments told to the administrators. */
    announced: number;
    /** Parcels marked paid from the payments' manifests. */
    parcelsPaid: number;
}

/** Marks a manifest's parcels as paid by this payment (only the tenant's, only once). */
async function markPaid(db: ServiceDb, tenantId: string, cases: readonly PrimeManifestCase[], paymentId: number): Promise<number> {
    const caseIds = [...new Set(cases.map((c) => c.caseid).filter((id): id is number => typeof id === "number"))];
    if (caseIds.length === 0) return 0;
    const { data, error } = await db
        .from("prime_shipments")
        .update({ payment_id: paymentId })
        .eq("tenant_id", tenantId)
        .in("case_id", caseIds)
        .is("payment_id", null)
        .select("id");
    if (error) throw new Error(error.message);
    return data?.length ?? 0;
}

async function remember(db: ServiceDb, tenantId: string, fields: { last_payment_id?: number; daily_sent_on?: string }): Promise<void> {
    const { error } = await db.from("prime_connections").update(fields).eq("tenant_id", tenantId);
    if (error) throw new Error(error.message);
}

/**
 * Prime's payments since the last one seen: each one's parcels are marked
 * paid (so the home page knows what Prime still holds) and the payment is
 * told to the administrators with how its parcels match our orders. The
 * first run after the link is switched on only marks the recent payments'
 * parcels, so old payments are not announced as new. Oldest first, and the
 * last one seen is saved after each, so a failure halfway announces nothing
 * twice.
 */
export async function watchPrimePayments(
    db: ServiceDb,
    client: PrimeClient,
    tenantId: string,
    connection: PrimeConnection,
    lastPaymentId: number | null,
): Promise<PrimePaymentsOutcome> {
    const outcome: PrimePaymentsOutcome = { announced: 0, parcelsPaid: 0 };
    const receipts = await client.paymentReceipts(connection.merchantLoginId, 0, PAYMENTS_PAGE);
    const fresh = receipts.filter((r) => lastPaymentId === null || r.id > lastPaymentId).sort((a, b) => a.id - b.id);

    for (const receipt of fresh) {
        const cases = await client.paymentCases(connection.merchantLoginId, receipt.id);
        outcome.parcelsPaid += await markPaid(db, tenantId, cases, receipt.id);
        if (lastPaymentId !== null) {
            const { summary } = await matchPrimeCases(db, tenantId, cases);
            const entry = primeStatementEntry(receipt);
            await noticeForAdmins(
                db,
                tenantId,
                "prime.payment",
                { payment_id: receipt.id, amount: entry.amount, parcels: summary.parcels, matched: summary.matched, different: summary.different + summary.unknown, diff: summary.diff },
                `prime.payment:${receipt.id}`,
            );
            outcome.announced += 1;
        }
        await remember(db, tenantId, { last_payment_id: receipt.id });
    }
    return outcome;
}

/**
 * The evening summary of the Baghdad day for the administrators: parcels
 * Prime delivered, parcels coming back, and the cash Prime collected. Sent
 * once a day, at the first run from 21:00; a day Prime moved nothing sends
 * nothing. Returns whether the day is now done.
 */
export async function sendPrimeDaily(db: ServiceDb, tenantId: string, sentOn: string | null, now: number): Promise<boolean> {
    const today = baghdadDayKey(now);
    const dayStart = baghdadDayStart(today);
    if (sentOn === today || now - dayStart < PRIME_DAILY_HOUR * 3_600_000) return false;

    const { data, error } = await db
        .from("prime_shipments")
        .select("shipment_status, step_code, cancelled_at, receipt_amount_iqd")
        .eq("tenant_id", tenantId)
        .gte("status_changed_at", new Date(dayStart).toISOString());
    if (error) throw new Error(error.message);

    let delivered = 0;
    let returning = 0;
    let collected = 0;
    for (const row of data ?? []) {
        const { state } = primeTrack({
            status: row.shipment_status ?? null,
            stepCode: row.step_code ?? null,
            cancelledAt: row.cancelled_at ?? null,
            pushError: null,
            cancelRefusedAt: null,
        });
        if (state === "returning") returning += 1;
        else if (state === "delivered") {
            delivered += 1;
            collected += Number(row.receipt_amount_iqd ?? 0);
        }
    }

    if (delivered + returning > 0) {
        await noticeForAdmins(db, tenantId, "prime.daily", { day: today, delivered, returning, collected }, `prime.daily:${today}`);
    }
    await remember(db, tenantId, { daily_sent_on: today });
    return true;
}
