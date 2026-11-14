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
    status: z.string(),
    canceled: z.boolean().optional().default(false),
    amount: z.number(),
    currency: z.string(),
    creationDate: z.string().optional(),
    formUrl: z.string().url().optional(),
    details: z.object({ maskedPan: z.string().optional() }).passthrough().optional(),
    /** Present when the payment asked Qi to save the card and it was paid. */
    paymentToken: z
        .object({
            token: z.string().regex(/^[0-9A-Za-z-]{1,100}$/),
            type: z.enum(["AUTH", "NON_RECUR", "UNAUTH"]),
            /** Qi sends it without a time zone; it is UTC. */
            validTo: z.string().optional(),
        })
        .optional(),
});
export type QiPayment = z.infer<typeof paymentSchema>;

const errorSchema = z.object({ error: z.object({ code: z.number(), description: z.string() }) });

async function call(config: QiConfig, path: string, init: { method: "GET" | "POST"; body?: unknown }): Promise<QiPayment> {
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
    const parsed = paymentSchema.safeParse(json);
    if (!parsed.success) throw new QiApiError("Qi answered without a payment", response.status);
    return parsed.data;
}

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
 * token and recurring payments switched on for the terminal. Qi usually
 * answers with the final status at once; the webhook follows as for any payment.
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

/** Qi's answer when the token is already blocked (5) or unknown (31): either way it can no longer be charged. */
const TOKEN_ALREADY_GONE = new Set([5, 31]);

/** Stop a saved card from ever being charged again. */
export async function blockQiToken(config: QiConfig, token: string, requestId: string): Promise<void> {
    if (!/^[0-9A-Za-z-]{1,100}$/.test(token)) throw new QiApiError("Bad token", 400);
    const auth = Buffer.from(`${config.username}:${config.password}`).toString("base64");
    const response = await fetch(`${config.baseUrl}/token/${token}/block`, {
        method: "POST",
        headers: {
            Authorization: `Basic ${auth}`,
            "X-Terminal-Id": config.terminalId,
            Accept: "application/json",
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ requestId }),
        cache: "no-store",
        signal: AbortSignal.timeout(20_000),
    });
    if (response.ok) return;
    const parsed = errorSchema.safeParse(await response.json().catch(() => null));
    if (parsed.success && TOKEN_ALREADY_GONE.has(parsed.data.error.code)) return;
    throw parsed.success
        ? new QiApiError(parsed.data.error.description, response.status, parsed.data.error.code)
        : new QiApiError(`Qi answered ${response.status}`, response.status);
}

/** Read a payment's current state from Qi. This is the only status we act on. */
export async function getQiPaymentStatus(config: QiConfig, paymentId: string): Promise<QiPayment> {
    if (!/^[0-9A-Za-z-]{1,64}$/.test(paymentId)) throw new QiApiError("Bad payment id", 400);
    return call(config, `/payment/${paymentId}/status`, { method: "GET" });
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
