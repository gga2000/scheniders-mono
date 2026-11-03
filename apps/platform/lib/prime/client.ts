import { z } from "zod";
import { env } from "@/lib/env";

/**
 * Prime courier partner API (https://<host>/myp/webapi). Scheniders signs in as
 * one integrated system (system code + password + initial token → JWT); every
 * tenant is a Prime merchant + shop under it (prime_connections).
 *
 * Only the calls the link uses are here: create shipments, read their status,
 * and the step names. Server-only: the credentials come from server env.
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

export class PrimeApiError extends Error {
    constructor(
        message: string,
        readonly status: number,
        /** Prime's errorCode (e.g. 29 = bad phone, 4015 = no branch), when it sent one. */
        readonly code?: number,
    ) {
        super(message);
        this.name = "PrimeApiError";
    }
}

/** One shipment as create-shipments takes it. Amounts are whole IQD. */
export interface PrimeShipmentPayload {
    merchantLoginId: string;
    senderId: number;
    custReceiptNoOri: string;
    senderSystemCaseIdWithCharacters: string;
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

const errorBodySchema = z.object({
    errorMessage: z.string().optional(),
    errorCode: z.number().optional(),
    message: z.string().optional(),
});

const loginSchema = z.object({ accessToken: z.string().min(20) });

/** {"<receipt no>": <case id>} */
const createdSchema = z.record(z.string(), z.number().int().positive());

const shipmentInfoSchema = z.object({
    caseid: z.number().int().positive(),
    custReceiptNoOri: z.string().nullish(),
    shipmentStatus: z.string().nullish(),
    stepCode: z.string().nullish(),
    shipmentCharge: z.number().nullish(),
    receiptAmtIqd: z.number().nullish(),
});
export type PrimeShipmentInfo = z.infer<typeof shipmentInfoSchema>;

const stepSchema = z.object({ code: z.string(), name: z.string().nullish(), nameEn: z.string().nullish() });

/** Case ids per shipments-info call. */
export const PRIME_INFO_BATCH = 50;
const REQUEST_TIMEOUT_MS = 20_000;
/** Re-sign in this long before the JWT says it expires. */
const TOKEN_MARGIN_MS = 60 * 60 * 1000;

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

export function createPrimeClient(config: PrimeConfig, fetchImpl: FetchLike = fetch) {
    let token: { value: string; expiresAt: number } | null = null;

    async function send(method: "GET" | "POST", path: string, body: unknown, bearer: string | null): Promise<Response> {
        return fetchImpl(`${config.baseUrl}${path}`, {
            method,
            headers: {
                Accept: "application/json",
                "Accept-Language": "ar",
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

    async function signIn(): Promise<string> {
        const res = await send("POST", "/auth/external-system-login", {
            login: config.systemCode,
            password: config.password,
            initialToken: config.initialToken,
        }, null);
        // A wrong login answers 401 with no body.
        if (!res.ok) throw res.status === 401 ? new PrimeApiError("Prime refused the system login", 401) : await failure(res, "login");
        const { accessToken } = loginSchema.parse(await res.json());
        const expiry = jwtExpiryMs(accessToken);
        token = { value: accessToken, expiresAt: expiry ? expiry - TOKEN_MARGIN_MS : Date.now() + TOKEN_MARGIN_MS };
        return accessToken;
    }

    async function bearer(): Promise<string> {
        return token && token.expiresAt > Date.now() ? token.value : signIn();
    }

    /** One call; a 401 (expired token) signs in again and retries once. */
    async function call<T>(method: "GET" | "POST", path: string, body: unknown, schema: z.ZodType<T>): Promise<T> {
        let res = await send(method, path, body, await bearer());
        if (res.status === 401) res = await send(method, path, body, await signIn());
        if (!res.ok) throw await failure(res, path);
        return schema.parse(await res.json());
    }

    return {
        /** Creates one shipment and returns Prime's case id. The same receipt within 12h returns the same case. */
        async createShipment(payload: PrimeShipmentPayload): Promise<number> {
            const created = await call("POST", "/external/create-shipments", [payload], createdSchema);
            const caseId = created[payload.custReceiptNoOri];
            if (!caseId) throw new PrimeApiError("Prime did not return a case id for this receipt", 502);
            return caseId;
        },

        /** Current status of up to PRIME_INFO_BATCH shipments. Shipments not ours are left out by Prime. */
        async shipmentsInfo(caseIds: number[]): Promise<PrimeShipmentInfo[]> {
            if (caseIds.length === 0) return [];
            if (caseIds.length > PRIME_INFO_BATCH) throw new Error(`shipmentsInfo takes at most ${PRIME_INFO_BATCH} ids`);
            return call("POST", "/external/shipments-info", caseIds, z.array(shipmentInfoSchema));
        },

        /** Step code → Arabic step name (falls back to the English name). */
        async stepNames(): Promise<Map<string, string>> {
            const steps = await call("GET", "/external/list-of-system-steps", undefined, z.array(stepSchema));
            return new Map(steps.map((s) => [s.code, s.name || s.nameEn || s.code]));
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
