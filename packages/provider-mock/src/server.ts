/**
 * Provider mock (PKG-00 approach 6a).
 *
 * One small HTTP server that answers like every outbound provider the apps
 * call, closely enough for the apps' own response parsing, so e2e runs, the
 * restore drill and the load test never reach a real host. Point each
 * client's `<PROVIDER>_API_BASE_URL` (QStash: `QSTASH_URL`) at `mock.url`.
 *
 * Every provider call is recorded as { provider, method, path, bodySha256 }
 * (the query string is left out: it can carry tokens such as Meta's
 * `access_token`; token path segments such as Telegram's `/bot<token>/` are
 * redacted; QStash delivery records keep the destination without its query).
 * Read them with `mock.calls()` or `GET /__mock/calls`.
 *
 * QStash publishes are delivered back to their destination after the
 * requested delay, signed like QStash (HS256 JWT, iss "Upstash", sub = the
 * destination URL, body = base64url SHA-256 of the body) with the test signing
 * keys, so the apps' `Receiver.verify` runs for real.
 */

import { createHash, createHmac, randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

export type ProviderName =
    | "interakt"
    | "qstash"
    | "lightfunnels"
    | "telegram"
    | "waseet"
    | "gemini"
    | "anthropic"
    | "meta"
    | "tiktok"
    | "webpush"
    | "unknown";

export interface RecordedCall {
    provider: ProviderName;
    method: string;
    /** Pathname only: never the query, and token segments (Telegram `/bot<token>/`) redacted. */
    path: string;
    /** Hex SHA-256 of the raw request body ("" hashes to e3b0…). */
    bodySha256: string;
    at: string;
}

export interface QStashDelivery {
    messageId: string;
    /** Destination URL without its query string. */
    destination: string;
    /** HTTP status the destination answered, or null when the request failed. */
    status: number | null;
    error?: string;
    at: string;
}

export interface QStashMockOptions {
    currentSigningKey: string;
    nextSigningKey: string;
    /**
     * Multiplier for `Upstash-Delay`. 1 honours the delay, 0 delivers at once;
     * `flushQStash()` delivers everything pending regardless.
     */
    delayScale?: number;
}

export interface ProviderMockOptions {
    /** 0 (default) picks a free port. */
    port?: number;
    host?: string;
    /** Without it, QStash publishes are recorded and acknowledged but never delivered. */
    qstash?: QStashMockOptions;
}

export interface ProviderMock {
    /** Base URL to put in every `<PROVIDER>_API_BASE_URL` and `QSTASH_URL`. */
    url: string;
    calls(): RecordedCall[];
    deliveries(): QStashDelivery[];
    /** Forget recorded calls and deliveries, cancel pending QStash callbacks. */
    reset(): void;
    /** Seed a LightFunnels GraphQL `node(id:)` answer (e.g. a checkout). */
    setLightfunnelsNode(id: string, node: Record<string, unknown>): void;
    /** Deliver every pending QStash callback now and wait for them. */
    flushQStash(): Promise<void>;
    close(): Promise<void>;
}

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

interface MockResponse {
    status: number;
    /** A Buffer is sent as-is; anything else is sent as JSON. */
    body: unknown;
    contentType?: string;
}

interface PendingDelivery {
    messageId: string;
    destination: string;
    body: Buffer;
    contentType: string;
    timer: NodeJS.Timeout;
}

/** 1×1 transparent PNG, served for Telegram file downloads. */
const PNG_1X1 = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
    "base64",
);

export function sha256Hex(body: Buffer | string): string {
    return createHash("sha256").update(body).digest("hex");
}

function base64Url(input: Buffer | string): string {
    return Buffer.from(input).toString("base64url");
}

/** Sign a QStash callback exactly as QStash does, so `Receiver.verify` accepts it. */
export function signQStashRequest(signingKey: string, destination: string, body: Buffer | string): string {
    const now = Math.floor(Date.now() / 1000);
    const header = base64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
    const payload = base64Url(
        JSON.stringify({
            iss: "Upstash",
            sub: destination,
            exp: now + 300,
            nbf: now,
            iat: now,
            jti: `jwt_${randomUUID()}`,
            body: createHash("sha256").update(body).digest("base64url"),
        }),
    );
    const signature = createHmac("sha256", signingKey).update(`${header}.${payload}`).digest("base64url");
    return `${header}.${payload}.${signature}`;
}

/** `Upstash-Delay` → milliseconds ("30s", "10m", "2h", "1d"; bare numbers are seconds). */
export function parseUpstashDelay(value: string | undefined): number {
    if (!value) return 0;
    const match = /^(\d+)\s*([smhd]?)$/.exec(value.trim());
    if (!match) return 0;
    const unitMs: Record<string, number> = { "": 1000, s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
    return Number(match[1]) * unitMs[match[2]];
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Smallest value that satisfies a JSON schema of the kind the apps send as
 * Anthropic `output_config.format.schema` (objects, arrays, strings, numbers,
 * booleans, enums). Strings are non-empty so `.min(1)` parsers accept them.
 */
export function sampleFromJsonSchema(schema: unknown): JsonValue {
    if (!isRecord(schema)) return null;
    if (Array.isArray(schema.enum) && schema.enum.length > 0) return schema.enum[0] as JsonValue;
    if ("const" in schema) return schema.const as JsonValue;
    for (const key of ["anyOf", "oneOf"] as const) {
        const options = schema[key];
        if (Array.isArray(options) && options.length > 0) return sampleFromJsonSchema(options[0]);
    }
    const type = Array.isArray(schema.type) ? schema.type[0] : schema.type;
    switch (type) {
        case "object": {
            const out: Record<string, JsonValue> = {};
            const properties = isRecord(schema.properties) ? schema.properties : {};
            for (const [name, sub] of Object.entries(properties)) out[name] = sampleFromJsonSchema(sub);
            return out;
        }
        case "array": {
            const min = typeof schema.minItems === "number" ? schema.minItems : 1;
            return Array.from({ length: Math.max(min, 1) }, () => sampleFromJsonSchema(schema.items));
        }
        case "string": {
            const min = typeof schema.minLength === "number" ? schema.minLength : 1;
            const base = "mock text";
            return base.length >= min ? base : base.padEnd(min, "x");
        }
        case "integer":
        case "number":
            return typeof schema.minimum === "number" ? schema.minimum : 0;
        case "boolean":
            return false;
        default:
            return null;
    }
}

/** Drop the query string (it can carry tokens) from a path or URL. */
export function stripQuery(value: string): string {
    const queryAt = value.indexOf("?");
    return queryAt === -1 ? value : value.slice(0, queryAt);
}

/**
 * Path as recorded in the call log, with token-bearing segments replaced.
 * Today that is Telegram's `/bot<token>/` and `/file/bot<token>/`; the
 * caller has already stripped the query.
 */
export function redactPath(path: string): string {
    return path.replace(/^(\/(?:file\/)?bot)[^/]+/, "$1<redacted>");
}

function classify(method: string, path: string): ProviderName {
    if (path.startsWith("/v1/public/message")) return "interakt";
    if (path.startsWith("/v2/")) return "qstash";
    if (path === "/api/v2" || path.startsWith("/api/v2/")) return "lightfunnels";
    if (/^\/(file\/)?bot[^/]+\//.test(path)) return "telegram";
    if (path.startsWith("/v1/merchant/")) return "waseet";
    if (/^\/v1(beta)?\/models\//.test(path)) return "gemini";
    if (path === "/v1/messages") return "anthropic";
    if (/^\/v\d+\.\d+\//.test(path)) return "meta";
    if (path.startsWith("/open_api/")) return "tiktok";
    if (path.startsWith("/push/") && method === "POST") return "webpush";
    return "unknown";
}

function parseJson(body: Buffer): unknown {
    if (body.length === 0) return null;
    try {
        return JSON.parse(body.toString("utf8"));
    } catch {
        return null;
    }
}

const json = (body: unknown, status = 200): MockResponse => ({ status, body });

function interaktResponse(): MockResponse {
    return json({
        result: true,
        message: "Message queued for sending via Interakt. Check webhook for delivery status",
        id: randomUUID(),
    }, 201);
}

function telegramResponse(path: string, body: Buffer): MockResponse {
    if (path.startsWith("/file/")) return { status: 200, body: PNG_1X1, contentType: "application/octet-stream" };
    const method = path.split("/").pop() ?? "";
    const input = parseJson(body);
    const chatId = isRecord(input) && typeof input.chat_id === "number" ? input.chat_id : 1;
    const now = Math.floor(Date.now() / 1000);
    switch (method) {
        case "sendMessage":
        case "editMessageText":
            return json({ ok: true, result: { message_id: Math.floor(Math.random() * 1e6), chat: { id: chatId }, date: now } });
        case "getFile":
            return json({
                ok: true,
                result: { file_id: "mock-file", file_unique_id: "mock-unique", file_size: PNG_1X1.length, file_path: "photos/mock.png" },
            });
        default:
            return json({ ok: true, result: true });
    }
}

function waseetResponse(path: string): MockResponse {
    const endpoint = path.slice("/v1/merchant/".length);
    const ok = (data: unknown) => json({ status: true, errNum: "S000", msg: "ok", data });
    switch (endpoint) {
        case "login":
            return ok({ token: "mock-waseet-token" });
        case "citys":
            return ok([{ id: "1", city_name: "بغداد" }]);
        case "regions":
            return ok([{ id: "1", region_name: "الكرادة" }]);
        case "package-sizes":
            return ok([{ id: "1", size: "عادي" }]);
        case "statuses":
            return ok([{ id: "1", status: "تم استلام الطلب من قبل المندوب" }]);
        case "create-order":
        case "edit-order": {
            const qrId = String(Math.floor(Math.random() * 1e8));
            return ok({ id: Number(qrId), qr_id: qrId, qr_link: `https://mock.invalid/qr/${qrId}` });
        }
        case "merchant-orders":
        case "get-orders-by-ids-bulk":
        case "get_merchant_invoices":
            return ok([]);
        default:
            return ok(null);
    }
}

function geminiResponse(): MockResponse {
    const text = JSON.stringify({
        customer_name: "Mock Customer",
        phone: "07700000000",
        secondary_phone: "",
        city: "بغداد",
        address: "بغداد - الكرادة",
    });
    return json({
        candidates: [{ content: { role: "model", parts: [{ text }] }, finishReason: "STOP", index: 0 }],
        usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 },
    });
}

function anthropicResponse(body: Buffer): MockResponse {
    const input = parseJson(body);
    const outputConfig = isRecord(input) && isRecord(input.output_config) ? input.output_config : null;
    const format = outputConfig && isRecord(outputConfig.format) ? outputConfig.format : null;
    const text = format && "schema" in format
        ? JSON.stringify(sampleFromJsonSchema(format.schema))
        : "Mock summary from the provider mock.";
    return json({
        id: `msg_mock_${randomUUID()}`,
        type: "message",
        role: "assistant",
        model: isRecord(input) && typeof input.model === "string" ? input.model : "mock",
        content: [{ type: "text", text }],
        stop_reason: "end_turn",
        stop_sequence: null,
        usage: { input_tokens: 1, output_tokens: 1 },
    });
}

function lightfunnelsResponse(body: Buffer, nodes: Map<string, Record<string, unknown>>): MockResponse {
    const input = parseJson(body);
    const query = isRecord(input) && typeof input.query === "string" ? input.query : "";
    const variables = isRecord(input) && isRecord(input.variables) ? input.variables : {};
    const emptyPage = { edges: [], pageInfo: { hasNextPage: false, endCursor: null } };
    if (/\bnode\s*\(/.test(query)) {
        const id = typeof variables.id === "string" ? variables.id : "";
        return json({ data: { node: nodes.get(id) ?? null } });
    }
    if (/\bcheckouts\s*\(/.test(query)) return json({ data: { checkouts: emptyPage } });
    if (/\borders\s*\(/.test(query)) return json({ data: { orders: emptyPage } });
    return json({ data: {} });
}

function readBody(req: IncomingMessage): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        req.on("data", (chunk: Buffer) => chunks.push(chunk));
        req.on("end", () => resolve(Buffer.concat(chunks)));
        req.on("error", reject);
    });
}

function send(res: ServerResponse, response: MockResponse): void {
    const isBuffer = Buffer.isBuffer(response.body);
    const payload = Buffer.isBuffer(response.body) ? response.body : JSON.stringify(response.body);
    res.writeHead(response.status, {
        "content-type": response.contentType ?? (isBuffer ? "application/octet-stream" : "application/json"),
    });
    res.end(payload);
}

export async function startProviderMock(options: ProviderMockOptions = {}): Promise<ProviderMock> {
    const host = options.host ?? "127.0.0.1";
    const recorded: RecordedCall[] = [];
    const delivered: QStashDelivery[] = [];
    const pending = new Map<string, PendingDelivery>();
    const inFlight = new Set<Promise<void>>();
    const lightfunnelsNodes = new Map<string, Record<string, unknown>>();

    async function deliver(item: PendingDelivery): Promise<void> {
        pending.delete(item.messageId);
        const qstash = options.qstash;
        if (!qstash) return;
        const at = new Date().toISOString();
        try {
            const res = await fetch(item.destination, {
                method: "POST",
                headers: {
                    "content-type": item.contentType,
                    "upstash-signature": signQStashRequest(qstash.currentSigningKey, item.destination, item.body),
                    "upstash-message-id": item.messageId,
                    "upstash-retried": "0",
                },
                body: new Uint8Array(item.body),
            });
            await res.arrayBuffer();
            delivered.push({ messageId: item.messageId, destination: stripQuery(item.destination), status: res.status, at });
        } catch (error) {
            delivered.push({
                messageId: item.messageId,
                destination: stripQuery(item.destination),
                status: null,
                error: error instanceof Error ? error.message : String(error),
                at,
            });
        }
    }

    function track(item: PendingDelivery): void {
        const promise = deliver(item).finally(() => inFlight.delete(promise));
        inFlight.add(promise);
    }

    /** `rawUrl` keeps the destination's own query so the callback reaches it unchanged. */
    function qstashResponse(req: IncomingMessage, rawUrl: string, body: Buffer): MockResponse {
        if (!rawUrl.startsWith("/v2/publish/")) return json({});
        const destination = decodeURIComponent(rawUrl.slice("/v2/publish/".length));
        const messageId = `msg_mock_${randomUUID()}`;
        if (options.qstash) {
            const scale = options.qstash.delayScale ?? 1;
            const delayHeader = req.headers["upstash-delay"];
            const delayMs = parseUpstashDelay(Array.isArray(delayHeader) ? delayHeader[0] : delayHeader) * scale;
            const contentTypeHeader = req.headers["content-type"];
            const item: PendingDelivery = {
                messageId,
                destination,
                body,
                contentType: typeof contentTypeHeader === "string" ? contentTypeHeader : "application/json",
                timer: setTimeout(() => track(item), delayMs),
            };
            pending.set(messageId, item);
        }
        return json({ messageId }, 201);
    }

    async function flushQStash(): Promise<void> {
        for (const item of [...pending.values()]) {
            clearTimeout(item.timer);
            track(item);
        }
        await Promise.all([...inFlight]);
    }

    function reset(): void {
        recorded.length = 0;
        delivered.length = 0;
        for (const item of pending.values()) clearTimeout(item.timer);
        pending.clear();
        lightfunnelsNodes.clear();
    }

    async function handleControl(req: IncomingMessage, res: ServerResponse, path: string, body: Buffer): Promise<void> {
        if (path === "/__mock/health") return send(res, json({ ok: true }));
        if (path === "/__mock/calls" && req.method === "GET") {
            return send(res, json({ calls: recorded, deliveries: delivered }));
        }
        if (path === "/__mock/calls" && req.method === "DELETE") {
            reset();
            return send(res, json({ ok: true }));
        }
        if (path === "/__mock/qstash/flush" && req.method === "POST") {
            await flushQStash();
            return send(res, json({ ok: true, deliveries: delivered }));
        }
        if (path === "/__mock/lightfunnels/nodes" && req.method === "POST") {
            const input = parseJson(body);
            if (isRecord(input) && typeof input.id === "string" && isRecord(input.node)) {
                lightfunnelsNodes.set(input.id, input.node);
                return send(res, json({ ok: true }));
            }
            return send(res, json({ error: "expected { id: string, node: object }" }, 400));
        }
        return send(res, json({ error: "unknown control route" }, 404));
    }

    const server = createServer((req, res) => {
        void (async () => {
            const method = req.method ?? "GET";
            // QStash puts a full destination URL in the path, so split the
            // query off by hand instead of parsing the path as a URL.
            const rawUrl = req.url ?? "/";
            const path = stripQuery(rawUrl);
            const body = await readBody(req);

            if (path.startsWith("/__mock/")) return handleControl(req, res, path, body);

            const provider = classify(method, path);
            recorded.push({
                provider,
                method,
                path: redactPath(path),
                bodySha256: sha256Hex(body),
                at: new Date().toISOString(),
            });

            switch (provider) {
                case "interakt": return send(res, interaktResponse());
                case "qstash": return send(res, qstashResponse(req, rawUrl, body));
                case "lightfunnels": return send(res, lightfunnelsResponse(body, lightfunnelsNodes));
                case "telegram": return send(res, telegramResponse(path, body));
                case "waseet": return send(res, waseetResponse(path));
                case "gemini": return send(res, geminiResponse());
                case "anthropic": return send(res, anthropicResponse(body));
                case "meta": return send(res, json({ events_received: 1, messages: [], fbtrace_id: "mock-trace" }));
                case "tiktok": return send(res, json({ code: 0, message: "OK", request_id: randomUUID(), data: {} }));
                case "webpush": return send(res, { status: 201, body: Buffer.alloc(0) });
                case "unknown": return send(res, json({ error: `provider mock: no route for ${method} ${path}` }, 404));
            }
        })().catch((error: unknown) => {
            if (!res.headersSent) send(res, json({ error: error instanceof Error ? error.message : String(error) }, 500));
        });
    });

    await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(options.port ?? 0, host, () => resolve());
    });
    const { port } = server.address() as AddressInfo;
    // A wildcard bind is reached through loopback; 127.0.0.1 avoids the
    // localhost → ::1 lookup when the server listens on IPv4 only.
    const urlHost = host === "0.0.0.0" ? "127.0.0.1" : host;

    return {
        url: `http://${urlHost}:${port}`,
        calls: () => recorded.map((call) => ({ ...call })),
        deliveries: () => delivered.map((delivery) => ({ ...delivery })),
        reset,
        setLightfunnelsNode: (id, node) => {
            lightfunnelsNodes.set(id, node);
        },
        flushQStash,
        close: async () => {
            for (const item of pending.values()) clearTimeout(item.timer);
            pending.clear();
            await Promise.all([...inFlight]);
            await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
        },
    };
}
