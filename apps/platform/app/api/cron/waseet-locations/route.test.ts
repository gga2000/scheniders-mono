import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import { queriesOn, recorded, recordingSupabase, resetRecording, respond } from "@/lib/__fixtures__/recording-supabase";

/*
 * Handoff B8: the weekly Al-Waseet area sync. An HTML page instead of JSON
 * (Al-Waseet's Cloudflare answered Vercel that way from 26 Oct) must keep the
 * saved cities and areas and raise one alert; the rebuild after a good fetch
 * is one database call, so the API's 8-second limit no longer stops it
 * halfway (16 Nov) and the manual overrides always run last.
 */

const captureMessage = vi.fn();
vi.mock("@sentry/nextjs", () => ({
    captureMessage,
    captureException: vi.fn(),
    captureCheckIn: vi.fn(),
    flush: vi.fn(async () => true),
}));
vi.mock("@/lib/supabase-server", () => ({ createSupabaseServiceClient: () => recordingSupabase }));
vi.mock("@/lib/env", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/env")>();
    return {
        ...actual,
        env: { ...actual.env, CRON_SECRET: "test-cron-secret" },
        providerBaseUrls: { ...actual.providerBaseUrls, WASEET_API_BASE_URL: "https://waseet.test" },
    };
});

const { GET } = await import("./route");

const CLOUDFLARE_PAGE = "<!DOCTYPE html><html><head><title>Attention Required! | Cloudflare</title></head></html>";
const REBUILT = [{ districts: 3, split_names: 1, duplicates: 2, municipalities: 4, postal_codes: 5, overrides: 1, review_pairs: 0 }];

type Reply = { json: unknown } | { html: string };
let replies: (url: string) => Reply;

const json = (data: unknown): Reply => ({ json: { status: true, errNum: "S000", msg: "ok", data } });
const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const reply = replies(String(input));
    return "html" in reply
        ? new Response(reply.html, { status: 403, headers: { "content-type": "text/html; charset=UTF-8" } })
        : new Response(JSON.stringify(reply.json), { headers: { "content-type": "application/json" } });
});

const cronRequest = () =>
    new Request("http://platform.test/api/cron/waseet-locations", {
        headers: { authorization: "Bearer test-cron-secret" },
    }) as unknown as NextRequest;

/** Runs the job to the end, letting its retry waits pass at once. */
async function runJob(): Promise<Response> {
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    try {
        const pending = GET(cronRequest());
        await vi.runAllTimersAsync();
        return await pending;
    } finally {
        vi.useRealTimers();
    }
}

const writes = () => recorded.filter((q) => q.target === "waseet_cities" || q.target === "waseet_regions");

beforeEach(() => {
    resetRecording();
    captureMessage.mockReset();
    fetchMock.mockClear();
    vi.stubGlobal("fetch", fetchMock);
    respond((q) => (q.target === "waseet_refresh_all" ? { data: REBUILT, error: null } : { data: null, error: null }));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe("waseet-locations cron", () => {
    it("an HTML page instead of the city list keeps every saved city and area and raises one alert", async () => {
        replies = () => ({ html: CLOUDFLARE_PAGE });

        const res = await runJob();

        expect(res.status).toBe(502);
        const body = await res.json();
        expect(body.success).toBe(false);
        expect(body.error).toContain("non-JSON reply (HTTP 403, text/html");
        expect(writes()).toEqual([]);
        expect(queriesOn("waseet_refresh_all")).toEqual([]);
        expect(captureMessage).toHaveBeenCalledTimes(1);
        expect(captureMessage.mock.calls[0][1]).toMatchObject({
            level: "error",
            tags: { job: "waseet-locations" },
            fingerprint: ["job-failed", "waseet-locations", "502", expect.stringContaining("non-JSON reply")],
        });
        // The one alert is the job's: no console.error opens a second issue.
        expect(console.error).not.toHaveBeenCalled();
    });

    it("an empty or malformed city list writes nothing", async () => {
        for (const cities of [[], { error: "maintenance" }, [{ id: "x", city_name: "بغداد" }]]) {
            resetRecording();
            respond(() => ({ data: REBUILT, error: null }));
            replies = () => json(cities);

            const res = await runJob();

            expect(res.status).toBe(502);
            expect(writes()).toEqual([]);
            expect(queriesOn("waseet_refresh_all")).toEqual([]);
        }
    });

    it("a full sync saves both lists and rebuilds everything in one database call", async () => {
        replies = (url) =>
            url.includes("/citys")
                ? json([{ id: "1", city_name: "بغداد" }, { id: 2, city_name: "البصرة" }])
                : json([{ id: url.includes("city_id=1") ? "10" : "20", region_name: "حي" }]);

        const res = await runJob();

        expect(res.status).toBe(200);
        expect(await res.json()).toMatchObject({
            success: true,
            data: { cities: 2, regions: 2, failedCities: [], districts: 3, splitNames: 1, duplicates: 2, municipalities: 4, postalCodes: 5, overrides: 1, reviewPairs: 0 },
        });
        expect(queriesOn("waseet_cities")).toHaveLength(1);
        expect(queriesOn("waseet_regions")).toHaveLength(2);
        // One rebuild, ending with the manual overrides, instead of six calls that skipped them.
        expect(recorded.filter((q) => q.kind === "rpc").map((q) => q.target)).toEqual(["waseet_refresh_all"]);
        expect(captureMessage).not.toHaveBeenCalled();
    });

    it("a city whose areas fail keeps its last good list; the rest are saved and rebuilt, and the run fails once", async () => {
        replies = (url) => {
            if (url.includes("/citys")) return json([{ id: "1", city_name: "بغداد" }, { id: "2", city_name: "البصرة" }]);
            return url.includes("city_id=1") ? json([{ id: "10", region_name: "المنصور" }]) : { html: CLOUDFLARE_PAGE };
        };

        const res = await runJob();

        expect(res.status).toBe(502);
        const body = await res.json();
        expect(body.error).toBe("Al-Waseet areas failed for 1 of 2 cities; they keep their last good list");
        expect(body.data).toMatchObject({ cities: 2, regions: 1, failedCities: [2] });
        const regionWrites = queriesOn("waseet_regions");
        expect(regionWrites).toHaveLength(1);
        expect(regionWrites[0].ops.find((o) => o.op === "upsert")?.args[0]).toEqual([
            expect.objectContaining({ id: 10, city_id: 1, name_ar: "المنصور" }),
        ]);
        expect(queriesOn("waseet_refresh_all")).toHaveLength(1);
        expect(captureMessage).toHaveBeenCalledTimes(1);
    });

    it("a rebuild the database refuses is a failed run", async () => {
        replies = (url) => (url.includes("/citys") ? json([{ id: "1", city_name: "بغداد" }]) : json([]));
        respond((q) =>
            q.target === "waseet_refresh_all"
                ? { data: null, error: { message: "canceling statement due to statement timeout" } }
                : { data: null, error: null },
        );

        const res = await runJob();

        expect(res.status).toBe(502);
        expect((await res.json()).error).toBe("Failed to rebuild districts and areas: canceling statement due to statement timeout");
        expect(captureMessage).toHaveBeenCalledTimes(1);
    });
});
