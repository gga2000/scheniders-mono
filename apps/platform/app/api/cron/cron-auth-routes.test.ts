import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Every scheduled route authorizes through requireCronAuth: Vercel sends
 * `Authorization: Bearer $CRON_SECRET` to cron paths, so the Bearer header is the
 * only credential. Two hand-written variants had survived:
 *  - `Bearer ${process.env.CRON_SECRET}` (trial-suspend, subscription-renew), which
 *    becomes the literal "Bearer undefined" when the secret is unset;
 *  - an `x-vercel-cron: 1` fallback (waseet-sync, waseet-locations, auto-no-response)
 *    that any caller can set, and in waseet-sync an unset secret skipped the check.
 */
const state = vi.hoisted(() => ({ secret: undefined as string | undefined, touched: false }));

vi.mock("@/lib/env", () => ({
    env: {
        get CRON_SECRET() {
            return state.secret;
        },
    },
    // Only read at module load by provider clients the Waseet routes import.
    providerBaseUrls: new Proxy({}, { get: () => "https://provider.example.test" }),
}));
vi.mock("@/lib/supabase-server", () => ({
    createSupabaseServiceClient: () => {
        state.touched = true;
        throw new Error("service client must not be created for an unauthorized cron call");
    },
}));
vi.mock("@supabase/supabase-js", () => ({
    createClient: () => {
        state.touched = true;
        throw new Error("service client must not be created for an unauthorized cron call");
    },
}));

const ROUTES = [
    "trial-suspend",
    "subscription-renew",
    "waseet-sync",
    "waseet-locations",
    "auto-no-response",
] as const;

const call = async (route: (typeof ROUTES)[number], headers: Record<string, string>) => {
    const mod = (await import(`./${route}/route`)) as { GET: (r: Request) => Promise<Response> };
    return mod.GET(new Request(`https://example.test/api/cron/${route}`, { headers }));
};

/** The secret as both the validated env object and raw process.env see it. */
const setSecret = (value: string | undefined) => {
    state.secret = value;
    if (value === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = value;
};

beforeEach(() => {
    setSecret("test-cron-secret");
    state.touched = false;
    process.env.SUPABASE_SERVICE_ROLE_KEY = "x";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
});

describe.each(ROUTES)("/api/cron/%s authorization", (route) => {
    it("refuses to run when CRON_SECRET is not configured", async () => {
        setSecret(undefined);
        const res = await call(route, { authorization: "Bearer undefined", "x-vercel-cron": "1" });
        expect([500, 503]).toContain(res.status);
        expect(state.touched).toBe(false);
    });

    it("rejects a caller with the wrong Bearer token", async () => {
        const res = await call(route, { authorization: "Bearer nope" });
        expect(res.status).toBe(401);
        expect(state.touched).toBe(false);
    });

    it("does not accept the spoofable x-vercel-cron header in place of the Bearer token", async () => {
        const res = await call(route, { "x-vercel-cron": "1" });
        expect(res.status).toBe(401);
        expect(state.touched).toBe(false);
    });
});
