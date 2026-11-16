import { beforeEach, describe, expect, it, vi } from "vitest";

/** takeDailySendSlot: trial stores get the small limit, a broken counter refuses. */

const state = vi.hoisted(() => ({
    status: "active" as string | null,
    limit: { allowed: true, remaining: 1, resetAt: null, retryAfterSeconds: 0 } as {
        allowed: boolean; remaining: number; resetAt: Date | null; retryAfterSeconds: number; error?: string;
    },
    calls: [] as Array<[string, number, number]>,
}));

vi.mock("@/lib/supabase-server", () => ({
    createSupabaseServiceClient: () => ({
        from: () => ({
            select: () => ({
                eq: () => ({
                    maybeSingle: async () => ({ data: state.status === null ? null : { status: state.status }, error: null }),
                }),
            }),
        }),
    }),
}));
vi.mock("@/lib/rate-limit", () => ({
    consumeRateLimit: vi.fn(async (key: string, limit: number, window: number) => {
        state.calls.push([key, limit, window]);
        return state.limit;
    }),
}));

const { takeDailySendSlot, whatsappDailyCap, WHATSAPP_DAILY_CAP, WHATSAPP_DAILY_CAP_TRIAL } = await import("./whatsapp-wallet");

const T = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
    state.status = "active";
    state.limit = { allowed: true, remaining: 1, resetAt: null, retryAfterSeconds: 0 };
    state.calls = [];
});

describe("whatsappDailyCap", () => {
    it("trial stores get the small limit, every other store the full one", () => {
        expect(whatsappDailyCap("trial")).toBe(WHATSAPP_DAILY_CAP_TRIAL);
        expect(whatsappDailyCap("active")).toBe(WHATSAPP_DAILY_CAP);
        expect(WHATSAPP_DAILY_CAP_TRIAL).toBeLessThan(WHATSAPP_DAILY_CAP);
    });
});

describe("takeDailySendSlot", () => {
    it("counts one send per store per day against the store's limit", async () => {
        expect(await takeDailySendSlot(T)).toBe(true);
        expect(state.calls).toEqual([[`wa-day:${T}`, WHATSAPP_DAILY_CAP, 86400]]);
    });

    it("uses the trial limit for a trial store", async () => {
        state.status = "trial";
        await takeDailySendSlot(T);
        expect(state.calls[0][1]).toBe(WHATSAPP_DAILY_CAP_TRIAL);
    });

    it("refuses once the limit is used up", async () => {
        state.limit = { allowed: false, remaining: 0, resetAt: null, retryAfterSeconds: 60 };
        expect(await takeDailySendSlot(T)).toBe(false);
    });

    it("refuses when the counter cannot be read, instead of sending uncounted", async () => {
        state.limit = { allowed: true, remaining: 300, resetAt: null, retryAfterSeconds: 0, error: "db down" };
        expect(await takeDailySendSlot(T)).toBe(false);
    });

    it.each(["suspended", "cancelled", "limited"])("refuses a %s store without counting", async (status) => {
        state.status = status;
        expect(await takeDailySendSlot(T)).toBe(false);
        expect(state.calls).toEqual([]);
    });

    it("refuses an unknown store", async () => {
        state.status = null;
        expect(await takeDailySendSlot(T)).toBe(false);
        expect(state.calls).toEqual([]);
    });
});
