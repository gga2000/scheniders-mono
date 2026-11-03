import { z } from "zod";
import { env } from "@/lib/env";

/**
 * Prime courier partner API (https://<host>/myp/webapi). Scheniders signs in as
 * one integrated system (system code + password + initial token → JWT); every
 * tenant is a Prime merchant + shop under it (prime_connections).
 *
 * Only the calls the link uses are here: create shipments, find one by its
 * receipt, read their status, and the step names. Server-only: the
 * credentials come from server env.
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
    locationDetails: string;
    receiptAmtIqd: number;
    undeclaredShipmentValue?: number;
    qty: number;
    productInfo: string;
    rmk: string;
    haveReturnItems: "Y" | "N";
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
    /** receiptAmtIqd above this (or below 0) is refused with code 21. */
    maxAmountIqd: 5_000_000,
} as const;

const errorBodySchema = z.object({
    errorMessage: z.string().optional(),
    errorCode: z.number().optional(),
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

    async function send(method: "GET" | "POST", path: string, body: unknown, bearer: string | null): Promise<Response> {
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
    async function call<T>(method: "GET" | "POST", path: string, body: unknown, schema: z.ZodType<T>): Promise<T> {
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
