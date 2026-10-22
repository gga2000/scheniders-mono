import { createServer, type IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";
import { Receiver } from "@upstash/qstash";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
    parseUpstashDelay,
    sampleFromJsonSchema,
    sha256Hex,
    signQStashRequest,
    startProviderMock,
    type ProviderMock,
} from "./server";

const KEYS = { currentSigningKey: "sig_test_current", nextSigningKey: "sig_test_next" };

let mock: ProviderMock;

beforeEach(async () => {
    mock = await startProviderMock({ qstash: { ...KEYS, delayScale: 0 } });
});

afterEach(async () => {
    await mock.close();
});

async function post(path: string, body: unknown, headers: Record<string, string> = {}) {
    const res = await fetch(`${mock.url}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify(body),
    });
    return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

describe("provider mock: provider answers", () => {
    it("answers Interakt with the live shape (top-level result and id)", async () => {
        const res = await post("/v1/public/message/", { phoneNumber: "7700000000" });
        expect(res.status).toBe(201);
        expect(res.json.result).toBe(true);
        expect(typeof res.json.id).toBe("string");
    });

    it("answers Telegram bot methods with ok/result", async () => {
        const res = await post("/bottest-token/sendMessage", { chat_id: 42, text: "hi" });
        expect(res.json.ok).toBe(true);
        expect(res.json.result).toMatchObject({ chat: { id: 42 } });
        const file = await post("/bottest-token/getFile", { file_id: "x" });
        expect(file.json.result).toMatchObject({ file_path: "photos/mock.png" });
        const bytes = await fetch(`${mock.url}/file/bottest-token/photos/mock.png`);
        expect(bytes.status).toBe(200);
        expect((await bytes.arrayBuffer()).byteLength).toBeGreaterThan(0);
    });

    it("answers LightFunnels GraphQL with empty pages and seeded nodes", async () => {
        const orders = await post("/api/v2", { query: "query q { orders(first: 1) { edges { node { id } } } }", variables: {} });
        expect(orders.json.data).toEqual({ orders: { edges: [], pageInfo: { hasNextPage: false, endCursor: null } } });

        mock.setLightfunnelsNode("chk_1", { id: "chk_1", phone: "07700000000" });
        const node = await post("/api/v2", { query: "query GetCheckout($id: ID!) { node(id: $id) { id } }", variables: { id: "chk_1" } });
        expect(node.json.data).toEqual({ node: { id: "chk_1", phone: "07700000000" } });
    });

    it("answers Al-Waseet with { status, errNum, msg, data }", async () => {
        const login = await post("/v1/merchant/login", {});
        expect(login.json).toMatchObject({ status: true, data: { token: "mock-waseet-token" } });
        const order = await post("/v1/merchant/create-order", {});
        expect(order.json).toMatchObject({ status: true, data: { qr_id: expect.any(String) } });
    });

    it("answers Gemini generateContent with a JSON text candidate", async () => {
        const res = await post("/v1beta/models/gemini-flash-latest:generateContent", { contents: [] });
        const candidates = res.json.candidates as Array<{ content: { parts: Array<{ text: string }> } }>;
        expect(JSON.parse(candidates[0].content.parts[0].text)).toMatchObject({ phone: "07700000000" });
    });

    it("answers Anthropic with text that satisfies the requested JSON schema", async () => {
        const schema = {
            type: "object",
            properties: { en: { type: "object", properties: { title: { type: "string" } } }, tone: { enum: ["friendly"] } },
        };
        const res = await post("/v1/messages", { model: "m", output_config: { format: { type: "json_schema", schema } } });
        const content = res.json.content as Array<{ type: string; text: string }>;
        expect(content[0].type).toBe("text");
        expect(JSON.parse(content[0].text)).toEqual({ en: { title: "mock text" }, tone: "friendly" });
    });

    it("answers Meta and TikTok CAPI", async () => {
        expect((await post("/v19.0/123/events", { data: [] })).json.events_received).toBe(1);
        expect((await post("/open_api/v1.3/event/track/", { data: [] })).json.code).toBe(0);
    });

    it("refuses unknown routes with 404 and still records them", async () => {
        const res = await post("/nope", {});
        expect(res.status).toBe(404);
        expect(mock.calls().map((c) => c.provider)).toEqual(["unknown"]);
    });
});

describe("provider mock: call log", () => {
    it("records provider, method, path (no query) and the body hash", async () => {
        const body = { data: [{ event_name: "Purchase" }] };
        await post("/v19.0/123/events?access_token=secret", body);
        const [call] = mock.calls();
        expect(call).toMatchObject({
            provider: "meta",
            method: "POST",
            path: "/v19.0/123/events",
            bodySha256: sha256Hex(JSON.stringify(body)),
        });
        expect(JSON.stringify(mock.calls())).not.toContain("secret");
    });

    it("redacts the Telegram bot token from recorded paths and the HTTP log", async () => {
        await post("/bot123456:SECRET-bot-token/sendMessage", { chat_id: 1, text: "x" });
        await fetch(`${mock.url}/file/bot123456:SECRET-bot-token/photos/mock.png`);
        expect(mock.calls().map((c) => c.path)).toEqual([
            "/bot<redacted>/sendMessage",
            "/file/bot<redacted>/photos/mock.png",
        ]);
        const served = await (await fetch(`${mock.url}/__mock/calls`)).text();
        expect(served).not.toContain("SECRET-bot-token");
    });

    it("exposes the log over HTTP and resets it", async () => {
        await post("/v1/public/message/", {});
        const listed = (await (await fetch(`${mock.url}/__mock/calls`)).json()) as { calls: unknown[] };
        expect(listed.calls).toHaveLength(1);
        await fetch(`${mock.url}/__mock/calls`, { method: "DELETE" });
        expect(mock.calls()).toHaveLength(0);
    });
});

describe("provider mock: QStash callbacks", () => {
    async function startReceiver() {
        const received: Array<{ verified: boolean; body: string }> = [];
        const urls: string[] = [];
        const receiver = new Receiver(KEYS);
        const server = createServer((req: IncomingMessage, res) => {
            const chunks: Buffer[] = [];
            req.on("data", (c: Buffer) => chunks.push(c));
            req.on("end", () => {
                const body = Buffer.concat(chunks).toString("utf8");
                const signature = String(req.headers["upstash-signature"] ?? "");
                receiver
                    .verify({ signature, body })
                    .then(
                        () => true,
                        () => false,
                    )
                    .then((verified) => {
                        received.push({ verified, body });
                        urls.push(req.url ?? "");
                        res.writeHead(verified ? 200 : 401).end();
                    });
            });
        });
        await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
        const { port } = server.address() as AddressInfo;
        return {
            url: `http://127.0.0.1:${port}/api/cron/process-checkouts`,
            received,
            urls,
            close: () => new Promise<void>((resolve) => server.close(() => resolve())),
        };
    }

    it("delivers a publish back to its destination, signed so Receiver.verify passes", async () => {
        const dest = await startReceiver();
        try {
            const res = await post(`/v2/publish/${dest.url}`, { source: "qstash-delayed-checkout" }, { "upstash-delay": "30s" });
            expect(res.status).toBe(201);
            expect(typeof res.json.messageId).toBe("string");

            await mock.flushQStash();
            expect(dest.received).toEqual([{ verified: true, body: JSON.stringify({ source: "qstash-delayed-checkout" }) }]);
            expect(mock.deliveries()).toMatchObject([{ destination: dest.url, status: 200 }]);
        } finally {
            await dest.close();
        }
    });

    it("delivers to the destination with its query, but records it without", async () => {
        const dest = await startReceiver();
        try {
            await post(`/v2/publish/${dest.url}?token=dest-secret`, {});
            await mock.flushQStash();
            expect(dest.received).toHaveLength(1);
            expect(dest.urls).toEqual(["/api/cron/process-checkouts?token=dest-secret"]);
            expect(mock.deliveries()).toMatchObject([{ destination: dest.url, status: 200 }]);
            const served = await (await fetch(`${mock.url}/__mock/calls`)).text();
            expect(served).not.toContain("dest-secret");
        } finally {
            await dest.close();
        }
    });

    it("a callback signed with another key is refused by Receiver.verify", async () => {
        const receiver = new Receiver(KEYS);
        const body = "{}";
        const forged = signQStashRequest("not-the-test-key", "http://127.0.0.1/x", body);
        await expect(receiver.verify({ signature: forged, body })).rejects.toThrow();
        const genuine = signQStashRequest(KEYS.currentSigningKey, "http://127.0.0.1/x", body);
        await expect(receiver.verify({ signature: genuine, body, url: "http://127.0.0.1/x" })).resolves.toBe(true);
    });

    it("parses Upstash-Delay units", () => {
        expect(parseUpstashDelay("30s")).toBe(30_000);
        expect(parseUpstashDelay("10m")).toBe(600_000);
        expect(parseUpstashDelay("2h")).toBe(7_200_000);
        expect(parseUpstashDelay("15")).toBe(15_000);
        expect(parseUpstashDelay(undefined)).toBe(0);
    });
});

describe("sampleFromJsonSchema", () => {
    it("fills arrays to minItems and strings to minLength", () => {
        expect(sampleFromJsonSchema({ type: "array", minItems: 2, items: { type: "string", minLength: 12 } })).toEqual([
            "mock textxxx",
            "mock textxxx",
        ]);
    });
});
