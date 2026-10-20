import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Every Vercel-scheduled cron route must authorise through `requireCronAuth`:
 * only `Authorization: Bearer $CRON_SECRET`, failing closed when the secret is
 * unset. NEW-P1-14: waseet-sync (and its siblings waseet-locations and
 * auto-no-response) also accepted `x-vercel-cron: 1`, which anyone can send;
 * trial-suspend and subscription-renew compared against the literal
 * "Bearer undefined" when the secret was unset.
 */

const mocks = vi.hoisted(() => ({
    env: {} as Record<string, string | undefined>,
    reached: vi.fn(),
}));

vi.mock("@/lib/env", () => ({ env: mocks.env }));
vi.mock("@/lib/supabase-server", () => ({
    createSupabaseServiceClient: () => {
        mocks.reached();
        throw new Error("handler reached the database");
    },
}));
vi.mock("@supabase/supabase-js", () => ({
    createClient: () => {
        mocks.reached();
        throw new Error("handler reached the database");
    },
}));
vi.mock("@/lib/waseet-api", () => ({
    fetchOrdersByIdsBulk: vi.fn(),
    syncLocationCatalog: async () => {
        mocks.reached();
        return { success: true, data: { cities: 0, districts: 0, regions: 0, duplicates: 0, splitNames: 0, reviewPairs: 0, failedCities: [] } };
    },
}));

const SECRET = "cron-secret";

type Handler = (request: NextRequest) => Promise<Response>;

const routes: Array<[string, () => Promise<{ GET: Handler }>]> = [
    ["waseet-sync", () => import("./waseet-sync/route")],
    ["waseet-locations", () => import("./waseet-locations/route")],
    ["auto-no-response", () => import("./auto-no-response/route")],
    ["trial-suspend", () => import("./trial-suspend/route")],
    ["subscription-renew", () => import("./subscription-renew/route")],
];

function get(path: string, headers: Record<string, string> = {}) {
    return new NextRequest(`https://app.example.com/api/cron/${path}`, { method: "GET", headers });
}

function setSecret(value: string | undefined) {
    // Some routes read process.env directly in the old code; set both so the
    // tests describe the behaviour, not the lookup.
    if (value === undefined) {
        delete mocks.env.CRON_SECRET;
        delete process.env.CRON_SECRET;
    } else {
        mocks.env.CRON_SECRET = value;
        process.env.CRON_SECRET = value;
    }
}

describe.each(routes)("GET /api/cron/%s — auth", (name, load) => {
    const original = process.env.CRON_SECRET;

    beforeEach(() => {
        mocks.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
        mocks.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
        mocks.reached.mockReset();
        vi.spyOn(console, "error").mockImplementation(() => {});
        vi.spyOn(console, "log").mockImplementation(() => {});
    });
    afterEach(() => {
        if (original === undefined) delete process.env.CRON_SECRET;
        else process.env.CRON_SECRET = original;
        vi.restoreAllMocks();
    });

    it("refuses `x-vercel-cron: 1` without the bearer secret", async () => {
        setSecret(SECRET);
        const { GET } = await load();
        const res = await GET(get(name, { "x-vercel-cron": "1" }));
        expect(res.status).toBe(401);
        expect(mocks.reached).not.toHaveBeenCalled();
    });

    it("refuses a wrong bearer", async () => {
        setSecret(SECRET);
        const { GET } = await load();
        const res = await GET(get(name, { authorization: "Bearer wrong" }));
        expect(res.status).toBe(401);
        expect(mocks.reached).not.toHaveBeenCalled();
    });

    it("fails closed with 503 when CRON_SECRET is unset, even for `Bearer undefined`", async () => {
        setSecret(undefined);
        const { GET } = await load();
        const res = await GET(get(name, { authorization: "Bearer undefined", "x-vercel-cron": "1" }));
        expect(res.status).toBe(503);
        expect(mocks.reached).not.toHaveBeenCalled();
    });

    it("lets the correct bearer through", async () => {
        setSecret(SECRET);
        const { GET } = await load();
        // The stubbed database throws once reached; some routes let that
        // propagate. Reaching it is what this test asserts.
        await GET(get(name, { authorization: `Bearer ${SECRET}` })).catch((err: unknown) => {
            expect(String(err)).toContain("handler reached the database");
        });
        expect(mocks.reached).toHaveBeenCalled();
    });
});
