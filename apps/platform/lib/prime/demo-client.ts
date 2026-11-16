import type { createSupabaseServiceClient } from "@/lib/supabase-server";
import {
    PRIME_ERROR,
    PrimeApiError,
    type PrimeCaseMovement,
    type PrimeClient,
    type PrimeManifestCase,
    type PrimePaymentReceipt,
    type PrimeShipmentInfo,
} from "@/lib/prime/client";
import type { PrimeConnection } from "@/lib/prime/connection";

type ServiceDb = ReturnType<typeof createSupabaseServiceClient>;

/**
 * The demo store's Prime link (Fermi B13). The demo store has no
 * prime_connections row, so the cron, the webhooks and the courier walls
 * never see it; its Prime page talks to this client instead, which answers
 * from the store's own prime_shipments rows and never calls Prime.
 */
export const DEMO_PRIME_CONNECTION: PrimeConnection = { merchantLoginId: "fermi-demo", shopId: 9, branchName: "فرع مثال" };

/** Prime's flat charge per parcel, as it bills real stores. */
export const DEMO_PRIME_FEE = 5000;

/** New parcels get case ids from here up: nine digits, where Prime's real ones have eight. */
const DEMO_CASE_FROM = 950_000_000;
const DEMO_CASE_SPAN = 49_999_999;

const HOUR = 3_600_000;

/** Prime's own Arabic names for the steps the demo parcels go through. */
const DEMO_STEP_NAMES: ReadonlyMap<string, string> = new Map([
    ["READYTOPICKUP", "جاهز للبيك اب"],
    ["NEWINSTORE", "في مخزن Prime"],
    ["NEW_ONWAY", "في الطريق إلى المحافظة"],
    ["ONWAY", "عند مندوب التوصيل"],
    ["POSTPONED", "مؤجل"],
    ["RTN_WITHAGENT", "تعذر التوصيل"],
    ["RTN_WITH_PICKUPAGENT", "راجع عند مندوب الأستلام"],
    ["RTN_MANIFEST_LIAISON", "راجع في المخزن : منفيست رواجع الفروع"],
    ["DLEIVERD", "شحنات سلمت بنجاح"],
    ["SUCC_CHANGEPRICE", "سلمت مع تغيير المبلغ"],
    ["PART_SUCC", "تسليم جزئيا أو أستبدال"],
]);

/** The road every parcel takes before its last step, with the hours after the send each is reached. */
const ROAD: readonly { step: string; after: number }[] = [
    { step: "READYTOPICKUP", after: 0 },
    { step: "NEWINSTORE", after: 6 },
    { step: "NEW_ONWAY", after: 18 },
    { step: "ONWAY", after: 26 },
];

/** Final steps that first passed a failed attempt (تعذر التوصيل). */
const AFTER_FAILED_ATTEMPT = new Set(["RTN_WITH_PICKUPAGENT", "RTN_MANIFEST_LIAISON"]);

/** One demo parcel as the client reads it. */
export interface DemoShipment {
    caseId: number;
    receipt: string;
    status: string | null;
    stepCode: string | null;
    charge: number | null;
    collect: number | null;
    sentAt: string;
    changedAt: string | null;
    paymentId: number | null;
    state: string | null;
}

/** A time as Prime writes it: Baghdad wall clock, "2026-11-04 00:02:24". */
export function primeWallClock(ms: number): string {
    return new Date(ms + 3 * HOUR).toISOString().slice(0, 19).replace("T", " ");
}

/**
 * The parcel's movements, oldest first: the road up to where it is now, then
 * its current step when that is past the road. A parcel that came back went
 * through a failed attempt first.
 */
export function demoCaseHistory(s: DemoShipment, now: number): PrimeCaseMovement[] {
    const sent = Date.parse(s.sentAt);
    // When the parcel reached its current step: its last move, or the send for one that never moved.
    const at = Math.min(s.changedAt ? Date.parse(s.changedAt) : sent, now);
    const current = s.stepCode ?? "READYTOPICKUP";
    const failed = AFTER_FAILED_ATTEMPT.has(current);
    const onRoad = ROAD.findIndex((r) => r.step === current);
    // The road before the current step, or all of it for a parcel past it, never later than the next move.
    const road = onRoad >= 0 ? ROAD.slice(0, onRoad) : ROAD;
    const roadEnd = Math.max(sent, failed ? at - 20 * HOUR : at);
    const moves: PrimeCaseMovement[] = road.map((r) => ({
        stepCode: r.step,
        enteredAt: primeWallClock(Math.min(sent + r.after * HOUR, roadEnd)),
        status: "ONWAY",
    }));
    if (failed) moves.push({ stepCode: "RTN_WITHAGENT", enteredAt: primeWallClock(roadEnd), status: "CNCL" });
    moves.push({ stepCode: current, enteredAt: primeWallClock(at), status: s.status });
    return moves;
}

/**
 * The payments Prime made to the store, newest first: the delivered parcels
 * grouped by the payment that carried them, each paid what Prime collected
 * less its charge, the day after its last parcel was delivered.
 */
export function demoPaymentReceipts(shipments: readonly DemoShipment[], now: number): PrimePaymentReceipt[] {
    const payments = new Map<number, { amount: number; lastMove: number }>();
    for (const s of shipments) {
        if (s.paymentId === null) continue;
        const p = payments.get(s.paymentId) ?? { amount: 0, lastMove: 0 };
        p.amount += Math.round(s.collect ?? 0) - Math.round(s.charge ?? 0);
        p.lastMove = Math.max(p.lastMove, Date.parse(s.changedAt ?? s.sentAt));
        payments.set(s.paymentId, p);
    }
    return [...payments]
        .sort(([a], [b]) => b - a)
        .map(([id, p]) => ({
            id,
            medium: "CASH",
            transactionAmountIqd: p.amount,
            remarks: null,
            createdDateTime: primeWallClock(Math.min(p.lastMove + 20 * HOUR, now - HOUR)),
            confirmedReception: true,
            confirmationDate: null,
        }));
}

/** What Prime reports about a parcel now; a parcel just sent waits for pickup. */
export function demoShipmentInfo(s: DemoShipment): PrimeShipmentInfo {
    return {
        caseid: s.caseId,
        custReceiptNoOri: s.receipt,
        stepCode: s.stepCode ?? "READYTOPICKUP",
        shipmentCharge: s.charge ?? DEMO_PRIME_FEE,
        receiptAmtIqd: s.collect,
        shipmentStatus: s.status ?? "ONWAY",
    };
}

function demoOnly(): PrimeApiError {
    return new PrimeApiError("متجر مثال لا يفتح تذاكر ولا يغيّر إعدادات عند Prime", 422);
}

/**
 * A Prime client for the demo store: reads and answers from the store's own
 * parcels, writes nothing at Prime and calls no one. Sending makes a case id
 * no real parcel has; editing, pulling back and resending succeed with
 * nothing to do; tickets and webhook settings are refused.
 */
export function createDemoPrimeClient(db: ServiceDb, tenantId: string, clock: () => number = Date.now): PrimeClient {
    async function shipments(filter?: { caseIds?: number[]; paymentId?: number; receipt?: string }): Promise<DemoShipment[]> {
        let query = db
            .from("prime_shipments")
            .select("case_id, receipt_no, shipment_status, step_code, shipment_charge, receipt_amount_iqd, sent_at, status_changed_at, payment_id, orders(governorate_code)")
            .eq("tenant_id", tenantId);
        if (filter?.caseIds) query = query.in("case_id", filter.caseIds);
        if (filter?.paymentId !== undefined) query = query.eq("payment_id", filter.paymentId);
        if (filter?.receipt !== undefined) query = query.eq("receipt_no", filter.receipt);
        const { data, error } = await query;
        if (error) throw new Error(error.message);
        return (data ?? []).map((r) => {
            const order = Array.isArray(r.orders) ? r.orders[0] : r.orders;
            return {
                caseId: Number(r.case_id),
                receipt: r.receipt_no,
                status: r.shipment_status,
                stepCode: r.step_code,
                charge: r.shipment_charge === null ? null : Number(r.shipment_charge),
                collect: r.receipt_amount_iqd === null ? null : Number(r.receipt_amount_iqd),
                sentAt: r.sent_at,
                changedAt: r.status_changed_at,
                paymentId: r.payment_id === null ? null : Number(r.payment_id),
                state: order?.governorate_code ?? null,
            };
        });
    }

    async function findByReceipt(receipt: string): Promise<number | null> {
        return (await shipments({ receipt }))[0]?.caseId ?? null;
    }

    async function one(caseId: number): Promise<DemoShipment> {
        const found = (await shipments({ caseIds: [caseId] }))[0];
        if (!found) throw new PrimeApiError("Shipment not found", 404, PRIME_ERROR.notFound);
        return found;
    }

    return {
        async createShipment() {
            return DEMO_CASE_FROM + Math.floor(Math.random() * DEMO_CASE_SPAN);
        },
        findByReceipt,
        async shipmentsInfo(caseIds) {
            if (caseIds.length === 0) return [];
            return (await shipments({ caseIds })).map(demoShipmentInfo);
        },
        async updateShipment() {},
        async deleteShipment() {},
        async requestResend() {},
        async caseHistory(caseId) {
            return demoCaseHistory(await one(caseId), clock());
        },
        async shipmentCharge() {
            return DEMO_PRIME_FEE;
        },
        async stateDistricts() {
            return [];
        },
        async paymentReceipts(_merchantLoginId, start, count) {
            const paid = await shipments();
            return demoPaymentReceipts(paid, clock()).slice(start, start + count);
        },
        async paymentCases(_merchantLoginId, paymentId): Promise<PrimeManifestCase[]> {
            return (await shipments({ paymentId })).map((s) => ({
                caseid: s.caseId,
                custReceiptNoOri: s.receipt,
                receiptAmtIqd: s.collect,
                shipmentCharge: s.charge,
                state: s.state,
            }));
        },
        async merchants() {
            return [];
        },
        async merchantShops() {
            return [];
        },
        async ticketSubjects() {
            return [];
        },
        async tickets() {
            return [];
        },
        async ticketChat() {
            throw new PrimeApiError("Ticket not found", 404, PRIME_ERROR.notFound);
        },
        async writeTicketMessage() {
            throw demoOnly();
        },
        async openTicket() {
            throw demoOnly();
        },
        async webhookConfig() {
            throw demoOnly();
        },
        async saveWebhookConfig() {
            throw demoOnly();
        },
        async stepNames() {
            return new Map(DEMO_STEP_NAMES);
        },
    };
}
