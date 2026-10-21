// @vitest-environment node
//
// PKG-00 approach 6a: every outbound provider client takes its host from env
// (validated in lib/env.ts), so e2e, drills and load tests can point it at the
// provider mock. Node environment: env.ts reads server env only when there is
// no `window`, which jsdom would provide.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { startProviderMock, type ProviderMock } from "@scheniders/provider-mock";
import { PLATFORM_PROVIDER_DEFAULTS, parsePlatformProviderBaseUrls } from "./env";

// Waseet and LightFunnels write audit rows through the service client; keep
// those off the network.
vi.mock("@/lib/supabase-server", () => ({
    createSupabaseServiceClient: () => ({
        from: () => ({
            insert: async () => ({ error: null }),
            upsert: async () => ({ error: null }),
        }),
    }),
}));

const QSTASH_KEYS = { currentSigningKey: "sig_test_current", nextSigningKey: "sig_test_next" };

describe("platform provider base URLs (lib/env.ts)", () => {
    it("defaults every provider to its real host", () => {
        expect(parsePlatformProviderBaseUrls({})).toEqual({
            INTERAKT_API_BASE_URL: "https://api.interakt.ai",
            QSTASH_URL: "https://qstash-us-east-1.upstash.io",
            LIGHTFUNNELS_API_BASE_URL: "https://services.lightfunnels.com",
            TELEGRAM_API_BASE_URL: "https://api.telegram.org",
            WASEET_API_BASE_URL: "https://api.alwaseet-iq.net",
            GEMINI_API_BASE_URL: "https://generativelanguage.googleapis.com",
            ANTHROPIC_API_BASE_URL: "https://api.anthropic.com",
        });
    });

    it("takes an override, and http://localhost outside Production (NODE_ENV=production included)", () => {
        const all = Object.fromEntries(Object.keys(PLATFORM_PROVIDER_DEFAULTS).map((k) => [k, "http://localhost:4010"]));
        const urls = parsePlatformProviderBaseUrls({ ...all, NODE_ENV: "production", VERCEL_ENV: "preview" });
        expect(new Set(Object.values(urls))).toEqual(new Set(["http://localhost:4010"]));
        expect(parsePlatformProviderBaseUrls({ TELEGRAM_API_BASE_URL: "https://tg.example.test" }).TELEGRAM_API_BASE_URL)
            .toBe("https://tg.example.test");
    });

    it.each(Object.keys(PLATFORM_PROVIDER_DEFAULTS))("refuses a non-default %s when VERCEL_ENV=production", (name) => {
        expect(() => parsePlatformProviderBaseUrls({ VERCEL_ENV: "production", [name]: "http://localhost:4010" }))
            .toThrow(new RegExp(`${name}: must be the real provider host`));
    });
});

describe("platform provider clients reach the host from env (against the provider mock)", () => {
    let mock: ProviderMock;

    beforeAll(async () => {
        mock = await startProviderMock({ qstash: { ...QSTASH_KEYS, delayScale: 0 } });
    });

    afterAll(async () => {
        await mock.close();
    });

    beforeEach(() => {
        mock.reset();
        vi.resetModules();
        for (const name of Object.keys(PLATFORM_PROVIDER_DEFAULTS)) vi.stubEnv(name, mock.url);
        vi.stubEnv("INTERAKT_API_KEY", "test-interakt-key");
        vi.stubEnv("TELEGRAM_BOT_TOKEN", "test-bot-token");
        vi.stubEnv("GEMINI_API_KEY", "test-gemini-key");
        vi.stubEnv("QSTASH_TOKEN", "test-qstash-token");
    });

    afterEach(() => {
        vi.unstubAllEnvs();
    });

    const paths = () => mock.calls().map((c) => `${c.provider} ${c.method} ${c.path}`);

    it("Interakt (cart recovery sender)", async () => {
        const { sendCartRecoveryMessage } = await import("./abandoned-cart-sender");
        const result = await sendCartRecoveryMessage({ id: "cart-1", phone: "07701234567", items: [], subtotal_iqd: 0 });
        expect(result.success).toBe(true);
        expect(paths()).toEqual(["interakt POST /v1/public/message/"]);
    });

    it("Telegram", async () => {
        const telegram = await import("./telegram");
        await expect(telegram.sendMessage(42, "hello")).resolves.toMatchObject({ message_id: expect.any(Number) });
        const file = await telegram.downloadFile("file-1");
        expect(file.mimeType).toBe("image/png");
        expect(paths()).toEqual([
            "telegram POST /bot<redacted>/sendMessage",
            "telegram POST /bot<redacted>/getFile",
            "telegram GET /file/bot<redacted>/photos/mock.png",
        ]);
    });

    it("LightFunnels", async () => {
        const { testConnection } = await import("./lightfunnels-api");
        await expect(testConnection("lf-token")).resolves.toMatchObject({ success: true });
        expect(paths()).toEqual(["lightfunnels POST /api/v2"]);
    });

    it("Al-Waseet", async () => {
        const { fetchCities } = await import("./waseet-api");
        await expect(fetchCities()).resolves.toMatchObject({ success: true, data: [{ id: "1" }] });
        expect(paths()).toEqual(["waseet GET /v1/merchant/citys"]);
    });

    it("Gemini", async () => {
        const { extractOrderFromImage } = await import("./gemini-order-extractor");
        const order = await extractOrderFromImage(Buffer.from("img"), "image/png");
        expect(order.phone).toBe("07700000000");
        expect(paths()).toEqual(["gemini POST /v1beta/models/gemini-flash-latest:generateContent"]);
    });

    it("Anthropic", async () => {
        const { ANTHROPIC_MESSAGES_URL } = await import("./anthropic-api");
        expect(ANTHROPIC_MESSAGES_URL).toBe(`${mock.url}/v1/messages`);
    });

    it("QStash: publish goes to QSTASH_URL and the mock's signed callback passes Receiver.verify", async () => {
        const { createServer } = await import("node:http");
        const { Receiver } = await import("@upstash/qstash");
        const receiver = new Receiver(QSTASH_KEYS);
        const verified: boolean[] = [];
        const app = createServer((req, res) => {
            const chunks: Buffer[] = [];
            req.on("data", (c: Buffer) => chunks.push(c));
            req.on("end", () => {
                receiver
                    .verify({ signature: String(req.headers["upstash-signature"] ?? ""), body: Buffer.concat(chunks).toString() })
                    .then(() => true, () => false)
                    .then((ok) => {
                        verified.push(ok);
                        res.writeHead(ok ? 200 : 401).end();
                    });
            });
        });
        await new Promise<void>((resolve) => app.listen(0, "127.0.0.1", () => resolve()));
        const address = app.address();
        const appUrl = typeof address === "object" && address ? `http://127.0.0.1:${address.port}` : "";

        try {
            const { scheduleCheckoutProcessing } = await import("./qstash");
            await expect(scheduleCheckoutProcessing(30, appUrl)).resolves.toBe(true);
            expect(paths()).toEqual([`qstash POST /v2/publish/${appUrl}/api/cron/process-checkouts`]);

            await mock.flushQStash();
            expect(verified).toEqual([true]);
        } finally {
            await new Promise<void>((resolve) => app.close(() => resolve()));
        }
    });
});
