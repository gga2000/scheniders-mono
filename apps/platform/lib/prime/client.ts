import { z } from "zod";
import { env } from "@/lib/env";

/**
 * Prime courier partner API (https://<host>/myp/webapi). Scheniders signs in as
 * one integrated system (system code + password + initial token → JWT); every
 * tenant is a Prime merchant + shop under it (prime_connections).
 *
 * Only the calls the link uses are here: create, update and delete shipments,
 * find one by its receipt, read their status and the step names, ask
 * for a returned parcel to be resent, and keep our webhook setting. Server-only:
 * the credentials come from server env.
 */

export interface PrimeConfig {
    baseUrl: string;
    systemCode: string;
    password: string;
    initialToken: string;
}

/** The integrated-system account from env, or null when Prime is not configured. */
export function primeConfigFromEnv(): PrimeConfig | null {
    const { PRIME_API_BASE_URL, PRIME_SYSTEM_CODE, PRIME_PASSWORD, PRIME_INITIAL_TOKEN } = env;
    if (!PRIME_API_BASE_URL || !PRIME_SYSTEM_CODE || !PRIME_PASSWORD || !PRIME_INITIAL_TOKEN) return null;
    return {
        baseUrl: PRIME_API_BASE_URL.replace(/\/+$/, ""),
        systemCode: PRIME_SYSTEM_CODE,
        password: PRIME_PASSWORD,
        initialToken: PRIME_INITIAL_TOKEN,
    };
}

/** An answer from Prime that is not a result: a validation error, a refused login, or a 2xx with nothing in it. */
export class PrimeApiError extends Error {
    constructor(
        message: string,
        readonly status: number,
        /** Prime's errorCode (e.g. 29 = bad phone, 21 = amount out of range, 4015 = no branch), when it sent one. */
        readonly code?: number,
    ) {
        super(message);
        this.name = "PrimeApiError";
    }
}

/**
 * Whether an error means Prime could not be reached or answered with a server
 * fault, as opposed to Prime refusing this particular request. A refused
 * request is final; an unreachable Prime may still have done the work.
 */
export function isPrimeUnreachable(err: unknown): boolean {
    if (err instanceof PrimeApiError) return err.status >= 500;
    // A ZodError means Prime answered in a shape we don't know: not a transport fault, and not this order's fault either.
    return !(err instanceof z.ZodError);
}

/** One shipment as create-shipments takes it. Amounts are whole IQD. */
export interface PrimeShipmentPayload {
    merchantLoginId: string;
    senderId: number;
    custReceiptNoOri: string;
    /** Our order id, so Prime's screens and the shipments-info answer carry it. */
    senderSystemCaseIdWithCharacters: string;
    /** The same id as a number when it is one (Prime stores it in an int column). */
    senderSystemCaseId?: number;
    receiverName: string;
    receiverHp1: string;
    receiverHp2?: string;
    state: string;
    /** Prime's district id within `state`, from /general/state-districts (Prime writes 0 when it is left out). */
    district?: number;
    locationDetails: string;
    receiptAmtIqd: number;
    undeclaredShipmentValue?: number;
    qty: number;
    productInfo: string;
    rmk: string;
    haveReturnItems: "Y" | "N";
    /** What the driver brings back, on a refund or replacement. */
    haveReturnItemsDesc?: string;
}

/**
 * Column limits Prime's database enforces without an error message: a longer
 * value answers 204 with no shipment created. Measured on Prime's test system
 * (the API guide does not list them).
 */
export const PRIME_LIMITS = {
    receiverName: 100,
    locationDetails: 500,
    rmk: 500,
    productInfo: 500,
    /** custReceiptNoOri and senderSystemCaseIdWithCharacters. */
    reference: 40,
    /** receiptAmtIqd beyond this (either way: refunds are negative) is refused with code 21. */
    maxAmountIqd: 5_000_000,
} as const;

const errorBodySchema = z.object({
    errorMessage: z.string().optional(),
    // A number on most endpoints; read a numeric string too, so the code is never lost.
    errorCode: z.union([z.number(), z.string().regex(/^\d+$/).transform(Number)]).optional(),
    message: z.string().optional(),
});

const loginSchema = z.object({ accessToken: z.string().min(20) });

/** {"<receipt no>": <case id>} */
const createdSchema = z.record(z.string(), z.number().int().positive());

/**
 * Prime's test system answers `shipmentStatus`; its guide documents the same
 * field as `status`. Both are read, so a renamed field cannot silently stop
 * every delivery from landing.
 */
const shipmentInfoSchema = z
    .object({
        caseid: z.number().int().positive(),
        custReceiptNoOri: z.string().nullish(),
        shipmentStatus: z.string().nullish(),
        status: z.string().nullish(),
        stepCode: z.string().nullish(),
        shipmentCharge: z.number().nullish(),
        receiptAmtIqd: z.number().nullish(),
    })
    .transform(({ shipmentStatus, status, ...rest }) => ({ ...rest, shipmentStatus: shipmentStatus ?? status ?? null }));
export type PrimeShipmentInfo = z.infer<typeof shipmentInfoSchema>;

/** search-shipments rows carry the shop (senderId) and our id, not the receipt. */
const searchRowSchema = z.object({
    caseid: z.number().int().positive(),
    senderId: z.number().nullish(),
    custReceiptNoOri: z.string().nullish(),
});

const stepSchema = z.object({ code: z.string(), name: z.string().nullish(), nameEn: z.string().nullish() });

/**
 * One movement of a parcel (case-history). Prime's test system answers
 * `queueEnterDate` and `shipmentStatus`; its guide documents `createddt` and
 * `status`. Both are read.
 */
const historyRowSchema = z
    .object({
        stepCode: z.string().nullish(),
        queueEnterDate: z.string().nullish(),
        createddt: z.string().nullish(),
        shipmentStatus: z.string().nullish(),
        status: z.string().nullish(),
    })
    .transform((r) => ({
        stepCode: r.stepCode ?? null,
        /** Baghdad wall clock, "2026-11-04 00:02:24" (see lib/prime/track primeHistoryTime). */
        enteredAt: r.queueEnterDate ?? r.createddt ?? null,
        status: r.shipmentStatus ?? r.status ?? null,
    }));
export type PrimeCaseMovement = z.infer<typeof historyRowSchema>;

/** calculate-shipment-charges: a large object; only the charge is read. Null when Prime has no price for the state. */
const chargeSchema = z.object({ shipmentCharge: z.number().nonnegative().nullish() });
const districtSchema = z.object({ districtId: z.number().int().positive(), districtName: z.string() });
export type PrimeStateDistrict = z.infer<typeof districtSchema>;

/** One payment movement (merchant-payment-receipts): what Prime paid the merchant, and whether it was confirmed. */
const paymentReceiptSchema = z.object({
    id: z.number().int().positive(),
    medium: z.string().nullish(),
    transactionAmountIqd: z.number().nullish(),
    remarks: z.string().nullish(),
    createdDateTime: z.string().nullish(),
    confirmedReception: z.boolean().nullish(),
    confirmationDate: z.string().nullish(),
});
export type PrimePaymentReceipt = z.infer<typeof paymentReceiptSchema>;

/** One parcel on a payment or return manifest: what Prime collected and what it charged. */
const manifestCaseSchema = z.object({
    caseid: z.number().int().positive().nullish(),
    custReceiptNoOri: z.string().nullish(),
    receiptAmtIqd: z.number().nullish(),
    shipmentCharge: z.number().nullish(),
    state: z.string().nullish(),
});
export type PrimeManifestCase = z.infer<typeof manifestCaseSchema>;

const ticketSubjectSchema = z.object({
    code: z.string().min(1),
    description: z.string().nullish(),
    categoreCode: z.string().nullish(),
    sequence: z.number().nullish(),
});
export type PrimeTicketSubject = z.infer<typeof ticketSubjectSchema>;

/** list-tickets and single-ticket-header rows. Times are Baghdad wall clock, "2026-1-14 10:22:31 AM". */
const ticketSchema = z.object({
    ticketId: z.number().int().positive(),
    caseId: z.number().nullish(),
    receiptNo: z.string().nullish(),
    subject: z.string().nullish(),
    status: z.string().nullish(),
    createdAt: z.string().nullish(),
    latestMessage: z.string().nullish(),
    latestMessageAt: z.string().nullish(),
});
export type PrimeTicket = z.infer<typeof ticketSchema>;

const ticketChatSchema = z.object({
    ticketId: z.number().int().positive(),
    chatId: z.number().nullish(),
    caseId: z.number().nullish(),
    status: z.string().nullish(),
    messages: z
        .array(
            z.object({
                messageId: z.number().nullish(),
                message: z.string().nullish(),
                createdAt: z.string().nullish(),
                senderName: z.string().nullish(),
                fromSupport: z.boolean().nullish(),
                type: z.string().nullish(),
                mediaUrl: z.string().nullish(),
            }),
        )
        .nullish()
        .transform((m) => m ?? []),
});
export type PrimeTicketChat = z.infer<typeof ticketChatSchema>;

const openedTicketSchema = z.object({ ticketId: z.number().int().positive() });

/** update-case-status answers {success, caseid, custReceiptNoOri}; a refusal is {success:false, errorMessage} with 422. */
const resendSchema = z.object({ success: z.literal(true), caseid: z.number().nullish() });

/**
 * The fields update-shipment takes. It replaces the whole set: a field left
 * out is written as NULL or 0 on Prime's side, so every call sends all of them.
 * The receipt number and our ids are not in the set and never change.
 */
export type PrimeShipmentUpdate = Pick<
    PrimeShipmentPayload,
    | "senderId"
    | "receiverName"
    | "receiverHp1"
    | "receiverHp2"
    | "state"
    | "district"
    | "locationDetails"
    | "receiptAmtIqd"
    | "undeclaredShipmentValue"
    | "qty"
    | "productInfo"
    | "rmk"
    | "haveReturnItems"
    | "haveReturnItemsDesc"
>;

/** A column a resend request may change (update-case-status allowlist), with its new value. */
export interface PrimeResendFix {
    column: "c_rcv_hp1" | "c_rcv_hp2" | "c_rcv_addr_rmk" | "c_rcv_state" | "c_receiptamt" | "c_rmk";
    value: string;
}

/** Prime error codes the link acts on. */
export const PRIME_ERROR = {
    /** update-shipment: the shipment's stage or step no longer allows edits. */
    notEditable: 5,
    /** delete-shipment: Prime already received the parcel. */
    alreadyReceived: 12,
    /** Shipment not found or not ours (already deleted, say). */
    notFound: 4005,
    /** update-case-status: the shipment was already resent. */
    alreadyResent: 7000,
} as const;

/** The events Prime can call us for. */
export type PrimeWebhookEvent = "UPDATE_STATUS" | "TICKET_NEW_CHAT_MESSAGE";

/** One value Prime puts in an UPDATE_STATUS call, and the JSON key it goes under. */
export interface PrimeWebhookField {
    field: string;
    jsonKey: string;
}

/** What we ask Prime to save: where to call, the header that proves the call is Prime's, and the fields it carries. */
export interface PrimeWebhookSetting {
    url: string;
    authenticationMode: "CUSTOM_HEADER";
    headerName: string;
    secret: string;
    /** UPDATE_STATUS only: the ticket event's payload is fixed by Prime. */
    fields?: PrimeWebhookField[];
}

const webhookConfigSchema = z.object({
    configured: z.boolean(),
    url: z.string().nullish(),
    authenticationMode: z.string().nullish(),
    headerName: z.string().nullish(),
    secretConfigured: z.boolean().nullish(),
    fields: z.array(z.object({ field: z.string(), jsonKey: z.string() })).nullish(),
});
export type PrimeWebhookConfig = z.infer<typeof webhookConfigSchema>;

/** Case ids per shipments-info call. */
export const PRIME_INFO_BATCH = 50;
const REQUEST_TIMEOUT_MS = 15_000;
/** Re-sign in this long before the JWT says it expires (or a tenth of its life when that is shorter). */
const TOKEN_MARGIN_MS = 60 * 60 * 1000;
/** Step names change about never; one read per warm instance per day. */
const STEPS_TTL_MS = 24 * 60 * 60 * 1000;
const USER_AGENT = "Scheniders/1.0 (+https://schenidersapp.xyz)";

/** Expiry of a JWT from its `exp` claim, or null when it has none we can read. */
export function jwtExpiryMs(token: string): number | null {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const parsed = z
        .object({ exp: z.number() })
        .safeParse(safeJson(Buffer.from(payload, "base64url").toString("utf8")));
    return parsed.success ? parsed.data.exp * 1000 : null;
}

type FetchLike = typeof fetch;

export interface PrimeClientOptions {
    /** Pause before the one retry of a failed create (tests pass 0). */
    retryDelayMs?: number;
}

export function createPrimeClient(config: PrimeConfig, fetchImpl: FetchLike = fetch, options: PrimeClientOptions = {}) {
    const retryDelayMs = options.retryDelayMs ?? 1000;
    let token: { value: string; expiresAt: number } | null = null;
    let signingIn: Promise<string> | null = null;
    let steps: { names: Map<string, string>; readAt: number } | null = null;

    type Method = "GET" | "POST" | "PUT" | "DELETE";

    async function send(method: Method, path: string, body: unknown, bearer: string | null): Promise<Response> {
        return fetchImpl(`${config.baseUrl}${path}`, {
            method,
            headers: {
                Accept: "application/json",
                "Accept-Language": "ar",
                "User-Agent": USER_AGENT,
                ...(body === undefined ? {} : { "Content-Type": "application/json" }),
                ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
            },
            body: body === undefined ? undefined : JSON.stringify(body),
            cache: "no-store",
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
    }

    async function failure(res: Response, path: string): Promise<PrimeApiError> {
        const body = errorBodySchema.safeParse(safeJson(await res.text()));
        const parsed = body.success ? body.data : null;
        const message = parsed?.errorMessage || parsed?.message || `Prime ${path} failed (HTTP ${res.status})`;
        return new PrimeApiError(message, res.status, parsed?.errorCode);
    }

    /** The JSON of a 2xx answer. Prime answers some refused writes with 204 and no body: that is a refusal, not a result. */
    async function result<T>(res: Response, path: string, schema: z.ZodType<T>): Promise<T> {
        const data = safeJson(await res.text());
        if (data === null) throw new PrimeApiError(`Prime gave no result for ${path} (HTTP ${res.status}): a field is empty or too long`, res.status);
        return schema.parse(data);
    }

    async function doSignIn(): Promise<string> {
        const res = await send("POST", "/auth/external-system-login", {
            login: config.systemCode,
            password: config.password,
            initialToken: config.initialToken,
        }, null);
        // A wrong login answers 401 with an HTML page, not Prime's error object.
        if (!res.ok) throw res.status === 401 ? new PrimeApiError("Prime refused the system login", 401) : await failure(res, "login");
        const { accessToken } = await result(res, "login", loginSchema);
        const expiry = jwtExpiryMs(accessToken);
        const margin = expiry ? Math.min(TOKEN_MARGIN_MS, Math.max(0, (expiry - Date.now()) / 10)) : 0;
        token = { value: accessToken, expiresAt: expiry ? expiry - margin : Date.now() + TOKEN_MARGIN_MS };
        return accessToken;
    }

    /** One sign-in at a time: parallel calls on a cold instance share it instead of each logging in. */
    function signIn(): Promise<string> {
        if (!signingIn) {
            signingIn = doSignIn().finally(() => {
                signingIn = null;
            });
        }
        return signingIn;
    }

    async function bearer(): Promise<string> {
        return token && token.expiresAt > Date.now() ? token.value : signIn();
    }

    /** One call; a 401 (expired token) signs in again and retries once. */
    async function call<T>(method: Method, path: string, body: unknown, schema: z.ZodType<T>): Promise<T> {
        let res = await send(method, path, body, await bearer());
        if (res.status === 401) {
            token = null;
            res = await send(method, path, body, await signIn());
        }
        if (!res.ok) throw await failure(res, path);
        return result(res, path, schema);
    }

    async function create(payload: PrimeShipmentPayload): Promise<number> {
        const created = await call("POST", "/external/create-shipments", [payload], createdSchema);
        const caseId = created[payload.custReceiptNoOri];
        // Answered, but not for our receipt: not a transport fault, so no retry.
        if (!caseId) throw new PrimeApiError("Prime did not return a case id for this receipt", 200);
        return caseId;
    }

    async function findByReceipt(receipt: string, shopId: number): Promise<number | null> {
        const rows = await call("POST", "/external/search-shipments?page=1", { receiptNoOri: receipt, shop: shopId }, z.array(searchRowSchema));
        const match = rows.find(
            (r) => (r.senderId == null || r.senderId === shopId) && (r.custReceiptNoOri == null || r.custReceiptNoOri === receipt),
        );
        return match?.caseid ?? null;
    }

    return {
        /**
         * Creates one shipment and returns Prime's case id. Prime validates a
         * batch all-or-nothing, so one order per call keeps every refusal
         * attributable. When the answer is lost (timeout, server fault), the
         * call is made once more and then the receipt is looked up: Prime
         * returns the same case for the same receipt within 12 hours, so a
         * shipment is never doubled, and one that Prime did create is found.
         */
        async createShipment(payload: PrimeShipmentPayload): Promise<number> {
            try {
                return await create(payload);
            } catch (first) {
                if (!isPrimeUnreachable(first)) throw first;
                if (retryDelayMs > 0) await new Promise((r) => setTimeout(r, retryDelayMs));
                try {
                    return await create(payload);
                } catch (second) {
                    if (!isPrimeUnreachable(second)) throw second;
                    const found = await findByReceipt(payload.custReceiptNoOri, payload.senderId).catch(() => null);
                    if (found) return found;
                    throw second;
                }
            }
        },

        /** The case Prime holds for a receipt in a shop, or null. */
        findByReceipt,

        /** Current status of up to PRIME_INFO_BATCH shipments. Shipments not ours are left out by Prime. */
        async shipmentsInfo(caseIds: number[]): Promise<PrimeShipmentInfo[]> {
            if (caseIds.length === 0) return [];
            if (caseIds.length > PRIME_INFO_BATCH) throw new Error(`shipmentsInfo takes at most ${PRIME_INFO_BATCH} ids`);
            return call("POST", "/external/shipments-info", caseIds, z.array(shipmentInfoSchema));
        },

        /**
         * Replaces a shipment's details with the order's current ones (Prime
         * takes the full set every time). Prime recalculates its charge and
         * clears its printed flag on each call, so callers send only real
         * changes. Not retried here: the cron keeps the edit queued and sends
         * it again on its next run.
         */
        async updateShipment(caseId: number, fields: PrimeShipmentUpdate): Promise<void> {
            await call("PUT", "/external/update-shipment", { caseid: caseId, ...fields }, z.number());
        },

        /** Deletes a shipment Prime has not received yet. Refused with code 12 once Prime has the parcel. */
        async deleteShipment(caseId: number): Promise<void> {
            const deleted = await call("DELETE", "/external/delete-shipment", { caseid: caseId }, z.boolean());
            if (!deleted) throw new PrimeApiError("Prime did not delete the shipment", 200);
        },

        /**
         * Asks Prime to send a returned parcel out again, with corrected
         * details (a new phone or address the customer gave). Empty values are
         * ignored by Prime, so they are not sent.
         */
        async requestResend(caseId: number, fixes: PrimeResendFix[], remark?: string): Promise<void> {
            const fieldsToChange = fixes.filter((f) => f.value.trim() !== "").map((f) => ({ p_casesFieldName: f.column, value: f.value }));
            await call(
                "POST",
                "/external/update-case-status",
                {
                    caseid: caseId,
                    action: "REQUEST_RESEND",
                    ...(remark?.trim() ? { resendRmk: remark.trim() } : {}),
                    ...(fieldsToChange.length > 0 ? { snagPossibleFixes: [{ fieldsToChange }] } : {}),
                },
                resendSchema,
            );
        },

        /** Every movement of one shipment, oldest first as Prime lists them. Refused with 4005 for a case that is not ours. */
        async caseHistory(caseId: number): Promise<PrimeCaseMovement[]> {
            return call("GET", `/external/case-history/${caseId}`, undefined, z.array(historyRowSchema));
        },

        /**
         * What Prime charges the merchant to deliver a parcel of this amount to
         * this state, in whole IQD, or null when Prime has no price for it (it
         * answers 200 with a null charge for a state it does not serve).
         */
        async shipmentCharge(merchantLoginId: string, state: string, receiptAmtIqd: number, district?: number): Promise<number | null> {
            const body = { merchantLoginId, state, receiptAmtIqd, ...(district ? { district } : {}) };
            const answer = await call("POST", "/external/calculate-shipment-charges", body, chargeSchema);
            return answer.shipmentCharge ?? null;
        },

        /** Prime's districts of one state, in Arabic (parent districts only). An unknown state answers an empty list. */
        async stateDistricts(state: string): Promise<PrimeStateDistrict[]> {
            return call("GET", `/general/state-districts/${encodeURIComponent(state)}`, undefined, z.array(districtSchema));
        },

        /** The merchant's payment movements, newest first as Prime lists them; `start` rows skipped, `count` returned. */
        async paymentReceipts(merchantLoginId: string, start: number, count: number): Promise<PrimePaymentReceipt[]> {
            return call("GET", `/external/merchant-payment-receipts/${encodeURIComponent(merchantLoginId)}/${start}/${count}`, undefined, z.array(paymentReceiptSchema));
        },

        /** The parcels on one payment manifest (its id is the payment movement's id). */
        async paymentCases(merchantLoginId: string, paymentId: number): Promise<PrimeManifestCase[]> {
            return call("GET", `/external/merchant-cases-in-payment-receipt/${encodeURIComponent(merchantLoginId)}/${paymentId}`, undefined, z.array(manifestCaseSchema));
        },

        /** The subjects a ticket can be opened under. */
        async ticketSubjects(): Promise<PrimeTicketSubject[]> {
            return call("GET", "/external/ticket-subjects", undefined, z.array(ticketSubjectSchema));
        },

        /** The merchant's tickets from the last 90 days, latest message first. */
        async tickets(merchantLoginId: string, start: number, count: number): Promise<PrimeTicket[]> {
            const query = `merchant-login-id=${encodeURIComponent(merchantLoginId)}&sort-type=desc`;
            return call("GET", `/external/list-tickets/ALL/${start}/${count}?${query}`, undefined, z.array(ticketSchema));
        },

        /** One ticket's whole chat. Refused with 4005 for a ticket that is not ours. */
        async ticketChat(ticketId: number): Promise<PrimeTicketChat> {
            return call("GET", `/external/ticket-chat/${ticketId}`, undefined, ticketChatSchema);
        },

        /** Writes a message into a ticket's chat. */
        async writeTicketMessage(ticketId: number, message: string): Promise<void> {
            await call("POST", `/external/ticket-chat/write-msg/${ticketId}`, { msg: message }, z.number());
        },

        /** Opens a ticket on one of our shipments with its first message; returns the ticket id. */
        async openTicket(caseId: number, subjectCode: string, message: string): Promise<number> {
            const opened = await call("POST", "/external/open-ticket", { caseId, ticket: { subjectCode }, message }, openedTicketSchema);
            return opened.ticketId;
        },

        /** Our webhook setting at Prime for one event (the secret is never sent back, only whether one is set). */
        async webhookConfig(eventType: PrimeWebhookEvent): Promise<PrimeWebhookConfig> {
            return call("GET", `/external/webhook-config?eventType=${eventType}`, undefined, webhookConfigSchema);
        },

        /** Saves where Prime calls us for one event, how it proves it is Prime, and what the call carries. */
        async saveWebhookConfig(eventType: PrimeWebhookEvent, setting: PrimeWebhookSetting): Promise<void> {
            const saved = await call("PUT", `/external/webhook-config?eventType=${eventType}`, setting, webhookConfigSchema);
            if (!saved.configured) throw new PrimeApiError("Prime did not save the webhook setting", 200);
        },

        /** Step code → Arabic step name (falls back to the English name, then the code). Cached for a day. */
        async stepNames(): Promise<Map<string, string>> {
            if (steps && Date.now() - steps.readAt < STEPS_TTL_MS) return steps.names;
            const list = await call("GET", "/external/list-of-system-steps", undefined, z.array(stepSchema));
            steps = { names: new Map(list.map((s) => [s.code, s.name || s.nameEn || s.code])), readAt: Date.now() };
            return steps.names;
        },
    };
}

export type PrimeClient = ReturnType<typeof createPrimeClient>;

function safeJson(text: string): unknown {
    try {
        return JSON.parse(text);
    } catch {
        // Prime answers some failures with an empty or plain-text body; the caller falls back to the HTTP status.
        return null;
    }
}

let shared: { key: string; client: PrimeClient } | null = null;

/** One client per warm server instance, so the JWT is reused between requests. Null when Prime is not configured. */
export function getPrimeClient(): PrimeClient | null {
    const config = primeConfigFromEnv();
    if (!config) return null;
    const key = `${config.baseUrl}|${config.systemCode}`;
    if (!shared || shared.key !== key) shared = { key, client: createPrimeClient(config) };
    return shared.client;
}
