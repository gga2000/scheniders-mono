import * as Sentry from "@sentry/nextjs";
import { z } from "zod";
import { createSupabaseServiceClient } from "@/lib/supabase-server";
import {
    QiApiError,
    blockQiToken,
    cancelQiPaymentByRequest,
    findQiPaymentByRequest,
    getQiPaymentStatus,
    type QiConfig,
    type QiPayment,
} from "./client";
import { QiTokenSealError, openQiToken, qiTokenKeyFromEnv, sealQiToken } from "./token-seal";

/** The qi_payments columns settling needs. */
export const QI_PAYMENT_COLUMNS = "id, tenant_id, qi_payment_id, status, amount_iqd, save_card, kind, card_saved, created_at";
export const qiPaymentRowSchema = z.object({
    id: z.string().uuid(),
    tenant_id: z.string().uuid(),
    qi_payment_id: z.string().nullable(),
    status: z.enum(["created", "success", "failed", "canceled"]),
    amount_iqd: z.number(),
    save_card: z.boolean(),
    kind: z.enum(["topup", "auto_refill"]),
    card_saved: z.boolean().nullable(),
    created_at: z.string(),
});
export type QiPaymentRow = z.infer<typeof qiPaymentRowSchema>;

const settleResultSchema = z.object({
    success: z.boolean(),
    status: z.enum(["created", "success", "failed", "canceled"]).optional(),
    error: z.string().optional(),
    duplicate: z.boolean().optional(),
    unconfirmed: z.boolean().optional(),
    card_saved: z.boolean().nullable().optional(),
    replaced_token: z.string().nullable().optional(),
});
export type QiSettleResult = z.infer<typeof settleResultSchema>;

const closeResultSchema = z.object({ success: z.boolean(), status: z.string().optional(), error: z.string().optional() });

type Admin = ReturnType<typeof createSupabaseServiceClient>;

/**
 * Money that needs a person: Qi and our records disagree. Raised as a Sentry
 * issue (one per kind of problem) as well as logged.
 */
export function qiMoneyAlarm(problem: string, extra: Record<string, unknown>): void {
    console.error(`[qi] ${problem}`, extra);
    Sentry.captureMessage(`Qi money: ${problem}`, { level: "error", tags: { job: "qi" }, fingerprint: ["qi-money", problem], extra });
}

/** Qi's validTo has no time zone; it is UTC. */
function utc(validTo: string | undefined): string | null {
    if (!validTo) return null;
    const when = new Date(/[zZ]|[+-]\d\d:\d\d$/.test(validTo) ? validTo : `${validTo}Z`);
    return Number.isNaN(when.getTime()) ? null : when.toISOString();
}

type CardToKeep = {
    /** Sealed with the store's id; see token-seal. */
    token: string;
    valid_to: string | null;
    payment_system: string | null;
};

/**
 * From a paid "save my card" top-up: the card to keep (sealed), or the token
 * to block at Qi because we may never charge it alone. Only an AUTH token
 * allows charging without the shop (Qi can return a weaker type than asked).
 */
function cardFrom(row: QiPaymentRow, payment: QiPayment): { keep: CardToKeep | null; drop: string | null } {
    const offered = payment.paymentToken;
    if (!row.save_card || !offered || offered.blocked) return { keep: null, drop: null };
    const key = qiTokenKeyFromEnv();
    if (offered.type !== "AUTH" || !key) return { keep: null, drop: offered.token };
    const system = payment.details?.paymentSystem;
    return {
        keep: {
            token: sealQiToken(offered.token, row.tenant_id, key),
            valid_to: utc(offered.validTo),
            payment_system: system && /^[A-Z_]{1,32}$/.test(system) ? system : null,
        },
        drop: null,
    };
}

/**
 * After a save-card top-up is credited: block the token we did not keep, and
 * the store's previous card when the new one is a different card. The money
 * is already recorded, so a failure here is raised, not thrown (a throw would
 * only make Qi resend a message that now changes nothing).
 */
async function tidyCards(config: QiConfig, row: QiPaymentRow, payment: QiPayment, drop: string | null, replaced: string | null) {
    const block = async (token: string, what: string) => {
        try {
            await blockQiToken(config, token);
        } catch (err) {
            qiMoneyAlarm(`could not block ${what} at Qi`, { tenant: row.tenant_id, payment: row.id, error: String(err) });
        }
    };
    if (drop) await block(drop, "a card we may not charge alone");
    if (!replaced) return;
    const key = qiTokenKeyFromEnv();
    if (!key) return qiMoneyAlarm("replaced card left unblocked: no QI_TOKEN_KEY", { tenant: row.tenant_id });
    let previous: string;
    try {
        previous = openQiToken(replaced, row.tenant_id, key);
    } catch (err) {
        if (!(err instanceof QiTokenSealError)) throw err;
        return qiMoneyAlarm("replaced card left unblocked: its token does not open", { tenant: row.tenant_id });
    }
    // Qi may give the same card the same token again; blocking it would kill the new card.
    if (previous !== payment.paymentToken?.token) await block(previous, "the replaced card");
}

/**
 * Record what Qi says about a payment (settle_qi_payment), reading the status
 * from Qi's API with our credentials, or from `known` when the caller has just
 * read it. A paid payment credits the shop's wallet once, and keeps its card
 * when the shop asked; calling this again, from the webhook, the return check
 * and the cron at the same time, is safe.
 */
export async function settleQiPayment(config: QiConfig, row: QiPaymentRow, known?: QiPayment): Promise<QiSettleResult> {
    if (row.status !== "created") return { success: true, status: row.status, duplicate: true, card_saved: row.card_saved };
    if (!row.qi_payment_id) return { success: false, error: "not_opened" };

    const payment = known ?? (await getQiPaymentStatus(config, row.qi_payment_id));
    if (payment.paymentId !== row.qi_payment_id || payment.requestId !== row.id || payment.currency !== "IQD") {
        qiMoneyAlarm("Qi's payment does not match our row", { id: row.id, paymentId: payment.paymentId, requestId: payment.requestId, currency: payment.currency });
        return { success: false, error: "payment_mismatch" };
    }

    const paid = payment.status === "SUCCESS" && !payment.canceled;
    const card = paid ? cardFrom(row, payment) : { keep: null, drop: null };
    const { data, error } = await createSupabaseServiceClient().rpc("settle_qi_payment", {
        _id: row.id,
        _qi_payment_id: payment.paymentId,
        _qi_status: payment.status,
        _amount: payment.amount,
        _confirmed_amount: payment.confirmedAmount ?? null,
        _canceled: payment.canceled,
        _masked_pan: payment.details?.maskedPan ?? "",
        _card: card.keep,
    });
    if (error) throw error;
    const result = settleResultSchema.parse(data);
    if (!result.success) {
        qiMoneyAlarm(`Qi says ${payment.status} but we could not record it: ${result.error}`, { id: row.id, paymentId: payment.paymentId, amount: payment.amount });
    } else if (result.status === "success" && !result.duplicate) {
        await tidyCards(config, row, payment, card.drop, result.replaced_token ?? null);
    }
    return result;
}

/** Record the Qi payment id of a row whose opening answer we never got. */
export async function attachQiPaymentId(admin: Admin, row: QiPaymentRow, paymentId: string): Promise<QiPaymentRow> {
    const { error } = await admin.from("qi_payments").update({ qi_payment_id: paymentId }).eq("id", row.id).is("qi_payment_id", null);
    if (error) throw error;
    return { ...row, qi_payment_id: paymentId };
}

/**
 * Close a row Qi never opened a payment for (see close_unopened_qi_payment):
 * declined counts against the store's card, card_dead removes it, not_opened
 * counts nothing.
 */
export async function closeUnopenedQiPayment(admin: Admin, id: string, outcome: "declined" | "card_dead" | "not_opened"): Promise<void> {
    const { data, error } = await admin.rpc("close_unopened_qi_payment", { _id: id, _outcome: outcome });
    if (error) throw error;
    const result = closeResultSchema.parse(data);
    if (!result.success) throw new Error(`close_unopened_qi_payment: ${result.error}`);
}

/** Before this, an open row is left to the webhook and the shop's return check. */
export const QI_RECHECK_AFTER_MS = 5 * 60_000;
/** A row with no Qi payment id is looked up by our request id only after this, when Qi has surely finished with it. */
const UNOPENED_LOOKUP_AFTER_MS = 15 * 60_000;
/** An open payment older than this is canceled at Qi: an auto refill should be final at once, a shop never returns to a day-old payment page. */
const STALE_AFTER_MS = { auto_refill: 30 * 60_000, topup: 24 * 60 * 60_000 } as const;

export type QiReconcileOutcome = "settled" | "closed" | "waiting";

/**
 * Bring one open payment to its final state from what Qi says:
 *   no Qi payment id: find it by our request id; Qi has none, close it
 *     (nothing was charged); Qi has one, attach it.
 *   settle from Qi's status.
 *   still in progress and stale: cancel it at Qi, so it can never be paid
 *     later, and record the canceled status Qi then reports. Qi refusing the
 *     cancel (15) means it is processing or final: settle from its status.
 */
export async function reconcileQiPayment(admin: Admin, config: QiConfig, row: QiPaymentRow, now = Date.now()): Promise<QiReconcileOutcome> {
    const age = now - Date.parse(row.created_at);
    let current = row;
    let payment: QiPayment;
    if (!current.qi_payment_id) {
        if (age < UNOPENED_LOOKUP_AFTER_MS) return "waiting";
        const found = await findQiPaymentByRequest(config, current.id);
        if (!found) {
            await closeUnopenedQiPayment(admin, current.id, "not_opened");
            return "closed";
        }
        current = await attachQiPaymentId(admin, current, found.paymentId);
        payment = found;
    } else {
        payment = await getQiPaymentStatus(config, current.qi_payment_id);
    }

    let result = await settleQiPayment(config, current, payment);
    if (!result.success) throw new Error(`settle_qi_payment: ${result.error}`);
    if (result.status !== "created") return "settled";
    if (age < STALE_AFTER_MS[current.kind]) return "waiting";

    try {
        await cancelQiPaymentByRequest(config, current.id);
    } catch (err) {
        if (!(err instanceof QiApiError && err.code === 15)) throw err;
    }
    result = await settleQiPayment(config, current);
    if (!result.success) throw new Error(`settle_qi_payment: ${result.error}`);
    return result.status === "created" ? "waiting" : "settled";
}
