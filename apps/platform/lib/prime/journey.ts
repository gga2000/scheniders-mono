import type { createSupabaseServiceClient } from "@/lib/supabase-server";
import { isPrimeUnreachable, PRIME_ERROR, PrimeApiError, type PrimeClient } from "@/lib/prime/client";
import { primeHistoryTime } from "@/lib/prime/track";

type ServiceDb = ReturnType<typeof createSupabaseServiceClient>;

/** One step of a parcel's journey as the order card's panel shows it. */
export interface PrimeJourneyStep {
    /** ISO instant, or null when Prime gave no readable time. */
    at: string | null;
    stepCode: string | null;
    /** Prime's own Arabic name for the step; null for a code Prime does not list. */
    stepName: string | null;
    status: string | null;
}

export type PrimeJourneyResult =
    | { ok: true; caseId: number; sentAt: string; resentAt: string | null; steps: PrimeJourneyStep[] }
    | { ok: false; reason: "not_sent" | "prime_unreachable" };

/**
 * A parcel's journey at Prime, newest step first: every movement Prime
 * recorded (case-history), named with Prime's own step names. The order and
 * its case are read from the caller's tenant, never from the request. A case
 * Prime no longer has (deleted when the order was cancelled) has no steps.
 */
export async function loadPrimeJourney(db: ServiceDb, client: PrimeClient, tenantId: string, orderId: string): Promise<PrimeJourneyResult> {
    const { data: row, error } = await db
        .from("prime_shipments")
        .select("case_id, sent_at, resent_at")
        .eq("tenant_id", tenantId)
        .eq("order_id", orderId)
        .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) return { ok: false, reason: "not_sent" };
    const caseId = Number(row.case_id);
    const base = { ok: true as const, caseId, sentAt: String(row.sent_at), resentAt: (row.resent_at as string | null) ?? null };

    try {
        const [movements, names] = await Promise.all([client.caseHistory(caseId), client.stepNames()]);
        const steps = movements
            .map((m): PrimeJourneyStep => ({
                at: m.enteredAt ? primeHistoryTime(m.enteredAt) : null,
                stepCode: m.stepCode,
                stepName: m.stepCode ? (names.get(m.stepCode) ?? null) : null,
                status: m.status,
            }))
            // Prime lists oldest first; reversed first so steps with the same time keep newest-first too.
            .reverse()
            .sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""));
        return { ...base, steps };
    } catch (err) {
        if (err instanceof PrimeApiError && err.code === PRIME_ERROR.notFound) return { ...base, steps: [] };
        if (isPrimeUnreachable(err)) return { ok: false, reason: "prime_unreachable" };
        throw err;
    }
}
