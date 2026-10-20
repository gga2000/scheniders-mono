import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    env: {} as Record<string, string | undefined>,
    sendMessage: vi.fn(),
    createOrderForTenant: vi.fn(),
}));

vi.mock("@/lib/env", () => ({ env: mocks.env }));
vi.mock("@/lib/supabase-server", () => ({ createSupabaseServiceClient: vi.fn() }));
vi.mock("@/lib/gemini-order-extractor", () => ({ extractOrderFromImage: vi.fn() }));
vi.mock("@/lib/telegram", () => ({
    sendMessage: mocks.sendMessage,
    editMessageText: vi.fn(),
    answerCallbackQuery: vi.fn(),
    downloadFile: vi.fn(),
}));
vi.mock("@/lib/order-service", () => ({ createOrderForTenant: mocks.createOrderForTenant }));

import { POST } from "./route";

const SECRET = "tg-secret";
const UPDATE = JSON.stringify({
    update_id: 1,
    message: { message_id: 1, chat: { id: 42 }, from: { id: 42 }, text: "/help" },
});

function post(headers: Record<string, string> = {}) {
    return POST(new NextRequest("https://app.example.com/api/telegram/webhook", {
        method: "POST",
        body: UPDATE,
        headers,
    }));
}

function setEnv(values: Record<string, string | undefined>) {
    for (const k of Object.keys(mocks.env)) delete mocks.env[k];
    Object.assign(mocks.env, values);
}

describe("POST /api/telegram/webhook — auth (NEW-P1-08)", () => {
    const original = process.env.TELEGRAM_WEBHOOK_SECRET;

    beforeEach(() => {
        delete process.env.TELEGRAM_WEBHOOK_SECRET;
        // `/help` needs no database and answers with one sendMessage, so a
        // sendMessage call means the update was processed.
        mocks.sendMessage.mockReset();
        mocks.sendMessage.mockResolvedValue(undefined);
        vi.spyOn(console, "error").mockImplementation(() => {});
    });
    afterEach(() => {
        if (original === undefined) delete process.env.TELEGRAM_WEBHOOK_SECRET;
        else process.env.TELEGRAM_WEBHOOK_SECRET = original;
        vi.restoreAllMocks();
    });

    it("refuses every update with 503 when TELEGRAM_WEBHOOK_SECRET is unset (fails closed)", async () => {
        setEnv({});
        const res = await post();
        expect(res.status).toBe(503);
        expect(mocks.sendMessage).not.toHaveBeenCalled();
    });

    it("refuses an update with no secret header", async () => {
        setEnv({ TELEGRAM_WEBHOOK_SECRET: SECRET });
        const res = await post();
        expect(res.status).toBe(403);
        expect(mocks.sendMessage).not.toHaveBeenCalled();
    });

    it("refuses an update with a wrong secret header", async () => {
        setEnv({ TELEGRAM_WEBHOOK_SECRET: SECRET });
        const res = await post({ "x-telegram-bot-api-secret-token": "wrong" });
        expect(res.status).toBe(403);
        expect(mocks.sendMessage).not.toHaveBeenCalled();
    });

    it("processes an update carrying the registered secret", async () => {
        setEnv({ TELEGRAM_WEBHOOK_SECRET: SECRET });
        const res = await post({ "x-telegram-bot-api-secret-token": SECRET });
        expect(res.status).toBe(200);
        expect(mocks.sendMessage).toHaveBeenCalledTimes(1);
    });
});
