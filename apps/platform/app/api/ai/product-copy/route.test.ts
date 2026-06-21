import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase-server", () => ({
    verifyAccessToken: vi.fn(),
}));

import { POST } from "./route";
import { verifyAccessToken } from "@/lib/supabase-server";

function req(body: unknown, auth = "Bearer tok"): Request {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (auth) headers.Authorization = auth;
    return new Request("http://x/api/ai/product-copy", {
        method: "POST",
        headers,
        body: JSON.stringify(body),
    });
}

const COPY = {
    en: { title: "Soy Candle", description: "Clean burn." },
    ar: { title: "شمعة", description: "وصف." },
    ku: { title: "مۆم", description: "پێناسە." },
};

beforeEach(() => {
    vi.clearAllMocks();
    process.env.ANTHROPIC_API_KEY = "test-key";
});

describe("POST /api/ai/product-copy", () => {
    it("401s without a token", async () => {
        const res = await POST(req({ name: "X" }, "") as never);
        expect(res.status).toBe(401);
    });

    it("401s on an invalid token", async () => {
        (verifyAccessToken as ReturnType<typeof vi.fn>).mockResolvedValue({
            user: null,
            error: "bad",
        });
        const res = await POST(req({ name: "X" }) as never);
        expect(res.status).toBe(401);
    });

    it("400s on invalid input", async () => {
        (verifyAccessToken as ReturnType<typeof vi.fn>).mockResolvedValue({
            user: { id: "u1" },
            error: null,
        });
        const res = await POST(req({ name: "" }) as never);
        expect(res.status).toBe(400);
    });

    it("returns trilingual copy on success", async () => {
        (verifyAccessToken as ReturnType<typeof vi.fn>).mockResolvedValue({
            user: { id: "u1" },
            error: null,
        });
        const fetchMock = vi.fn(async () => ({
            ok: true,
            json: async () => ({ content: [{ type: "text", text: JSON.stringify(COPY) }] }),
        }));
        vi.stubGlobal("fetch", fetchMock);

        const res = await POST(req({ name: "Soy Candle", tone: "luxury" }) as never);
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.copy.ar.title).toBe("شمعة");
        expect(json.copy.ku.description).toBe("پێناسە.");
        // model + structured output wired
        const [, init] = fetchMock.mock.calls[0] as unknown as [string, { body: string }];
        const sentBody = JSON.parse(init.body);
        expect(sentBody.model).toBe("claude-opus-4-8");
        expect(sentBody.output_config.format.type).toBe("json_schema");
    });

    it("502s when the model returns malformed copy", async () => {
        (verifyAccessToken as ReturnType<typeof vi.fn>).mockResolvedValue({
            user: { id: "u1" },
            error: null,
        });
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => ({
                ok: true,
                json: async () => ({ content: [{ type: "text", text: "{not valid}" }] }),
            })),
        );
        const res = await POST(req({ name: "X" }) as never);
        expect(res.status).toBe(502);
    });
});
