import { createVerify } from "node:crypto";
import { z } from "zod";
import { env } from "@/lib/env";

/**
 * Qi Card payment gateway (https://developers-gate.qi.iq). We use it for one
 * thing: a shop fills its wallet by paying on Qi's own card page. Server-only:
 * the credentials come from server env and never reach the browser.
 *
 * Every call is Basic Auth plus the terminal id header. Qi's "paid" message to
 * our webhook is only a hint; the status that moves money is always the one we
 * read back from Qi's status API with our own credentials.
 */

export interface QiConfig {
    baseUrl: string;
    terminalId: string;
    username: string;
    password: string;
}

/** The merchant terminal from env, or null when Qi is not configured. */
export function qiConfigFromEnv(): QiConfig | null {
    const { QI_API_BASE_URL, QI_TERMINAL_ID, QI_USERNAME, QI_PASSWORD } = env;
    if (!QI_API_BASE_URL || !QI_TERMINAL_ID || !QI_USERNAME || !QI_PASSWORD) return null;
    return {
        baseUrl: QI_API_BASE_URL.replace(/\/+$/, ""),
        terminalId: QI_TERMINAL_ID,
        username: QI_USERNAME,
        password: QI_PASSWORD,
    };
}

/** Qi refused the request or answered with something that is not a payment. */
export class QiApiError extends Error {
    constructor(
        message: string,
        readonly status: number,
        /** Qi's numeric error code (e.g. 12 = payment not found, 27 = bad credentials). */
        readonly code?: number,
    ) {
        super(message);
        this.name = "QiApiError";
    }
}

const paymentSchema = z.object({
    requestId: z.string(),
    paymentId: z.string().regex(/^[0-9A-Za-z-]{1,64}$/),
    /**
     * CREATED, FORM_SHOWED, THREE_DS_METHOD_CALL_REQUIRED, AUTHENTICATION_*,
     * INITIALIZED, STARTED (in progress); SUCCESS, FAILED, AUTHENTICATION_FAILED,
     * ERROR, EXPIRED (final). settle_qi_payment maps them.
     */
    status: z.string(),
    canceled: z.boolean().optional().default(false),
    amount: z.number(),
    /** What Qi actually took; differs from amount while a payment is only held. */
    confirmedAmount: z.number().optional(),
    currency: z.string(),
    creationDate: z.string().optional(),
    formUrl: z.string().url().optional(),
    details: z
        .object({ maskedPan: z.string().optional(), paymentSystem: z.string().optional() })
        .passthrough()
        .optional(),
    /** Present when the payment asked Qi to save the card and it was paid. */
    paymentToken: z
        .object({
            token: z.string().regex(/^[0-9A-Za-z-]{1,100}$/),
            type: z.enum(["AUTH", "NON_RECUR", "UNAUTH"]),
            /** Qi sends it without a time zone; it is UTC (sandbox: "2032-01-31T21:00:00"). */
            validTo: z.string().optional(),
            blocked: z.boolean().optional(),
        })
        .optional(),
});
export type QiPayment = z.infer<typeof paymentSchema>;

const errorSchema = z.object({ error: z.object({ code: z.number(), description: z.string() }) });

/**
 * What a failed Qi call means for money, from Qi's error codes and what its
 * sandbox answers (checked 15 Nov 2026):
 *   unknown    no answer, a 5xx, or Qi's own internal error (23, 24): Qi may
 *              have acted, so only a later status read may decide
 *   ours       our setup is wrong (401/27 credentials, 9 terminal, 21 a field,
 *              26 form domain): never the shop's fault
 *   not_found  12: Qi has no payment for this id or request id
 *   card_dead  the saved card can never be charged again: 31 unknown token,
 *              32 token may not do this, 35 bad token type, 5 "token is blocked"
 *   refused    any other answer with Qi's error code: Qi said no, nothing done
 * Qi's code 5 is generic (also "RequestId ... was already used"), so only its
 * blocked-token wording counts as a dead card; any other 5 is unknown.
 */
export type QiFailure = "unknown" | "ours" | "not_found" | "card_dead" | "refused";

const OUR_SETUP_CODES = new Set([9, 21, 26, 27]);
const DEAD_CARD_CODES = new Set([31, 32, 35]);
const QI_INTERNAL_CODES = new Set([23, 24]);

export function classifyQiFailure(err: unknown): QiFailure {
    if (!(err instanceof QiApiError) || err.status >= 500 || err.code === undefined) return "unknown";
    if (QI_INTERNAL_CODES.has(err.code)) return "unknown";
    if (err.status === 401 || OUR_SETUP_CODES.has(err.code)) return "ours";
    if (err.code === 12) return "not_found";
    if (DEAD_CARD_CODES.has(err.code)) return "card_dead";
    if (err.code === 5) return /token is blocked/i.test(err.message) ? "card_dead" : "unknown";
    return "refused";
}

async function send(config: QiConfig, path: string, init: { method: "GET" | "POST"; body?: unknown }): Promise<unknown> {
    const auth = Buffer.from(`${config.username}:${config.password}`).toString("base64");
    const response = await fetch(`${config.baseUrl}${path}`, {
        method: init.method,
        headers: {
            Authorization: `Basic ${auth}`,
            "X-Terminal-Id": config.terminalId,
            Accept: "application/json",
            ...(init.body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        cache: "no-store",
        signal: AbortSignal.timeout(20_000),
    });
    const json: unknown = await response.json().catch(() => null);
    if (!response.ok) {
        const parsed = errorSchema.safeParse(json);
        throw parsed.success
            ? new QiApiError(parsed.data.error.description, response.status, parsed.data.error.code)
            : new QiApiError(`Qi answered ${response.status}`, response.status);
    }
    return json;
}

async function call(config: QiConfig, path: string, init: { method: "GET" | "POST"; body?: unknown }): Promise<QiPayment> {
    const parsed = paymentSchema.safeParse(await send(config, path, init));
    // A 2xx that is not a payment: Qi may have acted, so it is not a refusal.
    if (!parsed.success) throw new QiApiError("Qi answered without a payment", 502);
    return parsed.data;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface CreateQiPaymentInput {
    /** Our qi_payments row id; Qi wants a fresh UUID per request. */
    requestId: string;
    amountIqd: number;
    /** Where Qi sends the shop's browser after paying. */
    finishPaymentUrl: string;
    /** Our webhook. Must be public https. */
    notificationUrl: string;
    locale: "ar_IQ" | "en_US";
    /** Ask Qi to keep the card (an AUTH token, which we may charge later without the shop). */
    saveCard?: boolean;
}

/** Open a payment; the shop pays on the returned formUrl. */
export async function createQiPayment(config: QiConfig, input: CreateQiPaymentInput): Promise<QiPayment & { formUrl: string }> {
    const payment = await call(config, "/payment", {
        method: "POST",
        body: {
            requestId: input.requestId,
            amount: input.amountIqd,
            currency: "IQD",
            locale: input.locale,
            finishPaymentUrl: input.finishPaymentUrl,
            notificationUrl: input.notificationUrl,
            ...(input.saveCard ? { needPaymentToken: true, tokenType: "AUTH" } : {}),
        },
    });
    if (!payment.formUrl) throw new QiApiError("Qi opened the payment without a payment page", 200);
    return { ...payment, formUrl: payment.formUrl };
}

export interface ChargeQiTokenInput {
    requestId: string;
    amountIqd: number;
    token: string;
    finishPaymentUrl: string;
    notificationUrl: string;
}

/**
 * Charge a saved card without the shop present (auto refill). Needs an AUTH
 * token and recurring payments switched on for the terminal. withoutAuthenticate
 * marks it as an operation with no payer to authenticate: Qi's sandbox answers
 * AUTHENTICATION_FAILED to a recurring token charge without it (15 Nov 2026).
 * Qi usually answers with the final status at once; the webhook follows.
 */
export function chargeQiToken(config: QiConfig, input: ChargeQiTokenInput): Promise<QiPayment> {
    return call(config, "/payment", {
        method: "POST",
        body: {
            requestId: input.requestId,
            amount: input.amountIqd,
            currency: "IQD",
            recurrent: true,
            withoutAuthenticate: true,
            paymentData: { paymentType: "PAYMENT_TOKEN", paymentToken: input.token },
            finishPaymentUrl: input.finishPaymentUrl,
            notificationUrl: input.notificationUrl,
        },
    });
}

const blockedSchema = z.object({ blocked: z.literal(true) });

/**
 * Stop a saved card from ever being charged again. Done when Qi confirms the
 * block, or answers that the token is already blocked or unknown (it can no
 * longer be charged either way); anything else throws.
 */
export async function blockQiToken(config: QiConfig, token: string): Promise<void> {
    if (!/^[0-9A-Za-z-]{1,100}$/.test(token)) throw new QiApiError("Bad token", 400);
    try {
        const answer = await send(config, `/token/${token}/block`, { method: "POST", body: { requestId: crypto.randomUUID() } });
        if (!blockedSchema.safeParse(answer).success) throw new QiApiError("Qi did not confirm the block", 502);
    } catch (err) {
        const gone = err instanceof QiApiError && (err.code === 31 || (err.code === 5 && /token is blocked/i.test(err.message)));
        if (gone) return;
        throw err;
    }
}

/** Read a payment's current state from Qi. This is the only status we act on. */
export async function getQiPaymentStatus(config: QiConfig, paymentId: string): Promise<QiPayment> {
    if (!/^[0-9A-Za-z-]{1,64}$/.test(paymentId)) throw new QiApiError("Bad payment id", 400);
    return call(config, `/payment/${paymentId}/status`, { method: "GET" });
}

/**
 * Find the payment Qi opened for our request id (our qi_payments row id), for
 * a request whose answer we never got. null means Qi has no such payment.
 */
export async function findQiPaymentByRequest(config: QiConfig, requestId: string): Promise<QiPayment | null> {
    if (!UUID.test(requestId)) throw new QiApiError("Bad request id", 400);
    try {
        return await call(config, `/payment/status/by/request/${requestId}`, { method: "GET" });
    } catch (err) {
        if (classifyQiFailure(err) === "not_found") return null;
        throw err;
    }
}

/**
 * Cancel a payment that is not yet being processed (or is paid but only held),
 * by our request id. Qi answers with the payment, canceled: true; code 15 means
 * it can no longer be canceled (it is processing or final).
 */
export async function cancelQiPaymentByRequest(config: QiConfig, requestId: string): Promise<QiPayment> {
    if (!UUID.test(requestId)) throw new QiApiError("Bad request id", 400);
    return call(config, `/payment/cancel/by/request/${requestId}`, { method: "POST", body: { requestId: crypto.randomUUID() } });
}

/** The fields of Qi's payment message we read. */
export const qiWebhookSchema = z.object({
    requestId: z.string(),
    paymentId: z.string(),
    status: z.string().optional(),
    amount: z.number().optional(),
    currency: z.string().optional(),
    creationDate: z.string().optional(),
});
export type QiWebhookBody = z.infer<typeof qiWebhookSchema>;

/**
 * The text Qi signs on a payment message:
 * paymentId|amount with 3 decimals|currency|creationDate|status, "-" for a missing field.
 */
export function qiSignedString(body: QiWebhookBody): string {
    return [
        body.paymentId || "-",
        body.amount ? body.amount.toFixed(3) : "-",
        body.currency || "-",
        body.creationDate || "-",
        body.status || "-",
    ].join("|");
}

/** Whether X-Signature is Qi's RSA-SHA256 signature of the message. */
export function verifyQiSignature(body: QiWebhookBody, signatureBase64: string, publicKeyPem: string): boolean {
    try {
        const verifier = createVerify("sha256");
        verifier.update(qiSignedString(body));
        verifier.end();
        return verifier.verify(publicKeyPem, Buffer.from(signatureBase64, "base64"));
    } catch {
        // A malformed key or signature is a failed check, not a server error.
        return false;
    }
}
