import { describe, expect, it } from "vitest";
import {
    buildCriticalPath,
    classifySegment,
    classifySupabaseRequest,
    coveredMs,
    rowsFromContentRange,
    summarizeRequests,
    type PerfRequest,
} from "@/lib/perf-critical-path";

const req = (label: string, start: number, end: number, rows: number | null = null): PerfRequest => ({
    label, method: "GET", url: `/rest/v1/${label}`, start, headersAt: end, end, status: 200, rows,
});

describe("coveredMs", () => {
    it("merges overlapping intervals and clips to the window", () => {
        expect(coveredMs([[0, 10], [5, 15], [20, 30]], 0, 100)).toBe(25);
        expect(coveredMs([[0, 10], [5, 15], [20, 30]], 8, 25)).toBe(12);
    });
    it("is zero for an empty or inverted window", () => {
        expect(coveredMs([[0, 10]], 10, 10)).toBe(0);
        expect(coveredMs([[0, 10]], 10, 5)).toBe(0);
    });
});

describe("classifySegment", () => {
    it("names what dominated the gap", () => {
        expect(classifySegment(100, 80, 0)).toBe("cpu");
        expect(classifySegment(100, 0, 90)).toBe("network");
        expect(classifySegment(100, 60, 60)).toBe("mixed");
        expect(classifySegment(100, 10, 10)).toBe("idle");
        expect(classifySegment(0, 0, 0)).toBe("skipped");
    });
});

describe("buildCriticalPath", () => {
    const checkpoints = [
        { name: "a", label: "A" },
        { name: "b", label: "B" },
        { name: "c", label: "C" },
        { name: "done", label: "Done" },
    ];

    it("attributes the chain's time to each checkpoint and sums to the total", () => {
        const r = buildCriticalPath({
            anchor: 1000,
            anchorLabel: "click",
            checkpoints,
            terminal: "done",
            milestones: [
                { name: "a", t: 1100 },
                { name: "b", t: 1600 },
                { name: "c", t: 1700 },
                { name: "done", t: 2000 },
            ],
            requests: [req("orders:page", 1150, 1590)],
            longFrames: [{ start: 1700, duration: 280, blocking: 230, scripts: [] }],
        });
        expect(r.totalMs).toBe(1000);
        expect(r.segments.map((s) => s.ms)).toEqual([100, 500, 100, 300]);
        expect(r.segments.reduce((n, s) => n + s.ms, 0)).toBe(r.totalMs);
        expect(r.segments[1]).toMatchObject({ kind: "network", netMs: 440, requests: ["orders:page"] });
        expect(r.segments[3]).toMatchObject({ kind: "cpu", cpuMs: 280 });
        expect(r.top[0].checkpoint).toBe("b");
    });

    it("costs a checkpoint already passed before the cursor nothing", () => {
        // Auth resolved long before a soft navigation: not on this load's path.
        const r = buildCriticalPath({
            anchor: 5000,
            anchorLabel: "click",
            checkpoints,
            terminal: "done",
            milestones: [
                { name: "a", t: 5200 },
                { name: "b", t: 5100 },
                { name: "c", t: 5300 },
                { name: "done", t: 5400 },
            ],
            requests: [],
            longFrames: [],
        });
        expect(r.segments.map((s) => s.ms)).toEqual([200, 0, 100, 100]);
        expect(r.segments[1].kind).toBe("skipped");
        expect(r.totalMs).toBe(400);
    });

    it("ignores marks from before the anchor and keeps the first after it", () => {
        const r = buildCriticalPath({
            anchor: 1000,
            anchorLabel: "click",
            checkpoints: [{ name: "fetch", label: "Fetch" }, { name: "done", label: "Done" }],
            terminal: "done",
            milestones: [
                { name: "fetch", t: 200 }, // the previous visit
                { name: "fetch", t: 1500 },
                { name: "fetch", t: 1900 }, // a refetch
                { name: "done", t: 2000 },
            ],
            requests: [],
            longFrames: [],
        });
        expect(r.segments[0]).toMatchObject({ ms: 500, at: 500 });
    });

    it("moves checkpoints reached after the terminal off the path", () => {
        // A sessionStorage snapshot painted rows before the network fetch finished.
        const r = buildCriticalPath({
            anchor: 0,
            anchorLabel: "navigation start",
            checkpoints,
            terminal: "c",
            milestones: [
                { name: "a", t: 100 },
                { name: "c", t: 300 },
                { name: "b", t: 900 },
            ],
            requests: [],
            longFrames: [],
        });
        expect(r.background).toEqual(["b"]);
        expect(r.totalMs).toBe(300);
        expect(r.segments.find((s) => s.checkpoint === "done")?.kind).toBe("skipped");
    });

    it("reports a null total when the terminal was never reached", () => {
        const r = buildCriticalPath({
            anchor: 0,
            anchorLabel: "navigation start",
            checkpoints,
            terminal: "done",
            milestones: [{ name: "a", t: 100 }],
            requests: [req("orders:page", 50, 20_000)],
            longFrames: [],
        });
        expect(r.totalMs).toBeNull();
        expect(r.segments[0].ms).toBe(100);
    });
});

describe("classifySupabaseRequest", () => {
    const base = "https://x.supabase.co/rest/v1";
    it("labels the list read's stages", () => {
        expect(classifySupabaseRequest("GET", `${base}/orders?select=updated_at&tenant_id=eq.t&order=updated_at.desc&limit=1`, null)).toBe("orders:watermark");
        expect(classifySupabaseRequest("HEAD", `${base}/orders?select=id&tenant_id=eq.t`, "count=exact")).toBe("orders:count");
        expect(classifySupabaseRequest("GET", `${base}/orders?select=id,tenant_id&tenant_id=eq.t&offset=1000&limit=1000`, null)).toBe("orders:page");
        expect(classifySupabaseRequest("GET", `${base}/orders?select=id,tenant_id&tenant_id=eq.t&updated_at=gte.2026`, null)).toBe("orders:delta");
        expect(classifySupabaseRequest("HEAD", `${base}/customer_trust?select=phone&tenant_id=eq.t`, "count=exact")).toBe("trust:count");
        expect(classifySupabaseRequest("GET", `${base}/customer_trust?select=phone&tenant_id=eq.t&offset=0&limit=1000`, null)).toBe("trust:page");
        expect(classifySupabaseRequest("GET", `${base}/customer_trust?select=phone&tenant_id=eq.t&phone=in.(1,2)`, null)).toBe("trust:in");
    });
    it("labels everything else by table, rpc or service", () => {
        expect(classifySupabaseRequest("POST", `${base}/rpc/get_orders_aggregates`, null)).toBe("rpc:get_orders_aggregates");
        expect(classifySupabaseRequest("GET", `${base}/user_profiles?select=*&id=eq.u`, null)).toBe("user_profiles");
        expect(classifySupabaseRequest("PATCH", `${base}/orders?id=eq.1`, null)).toBe("orders:patch");
        expect(classifySupabaseRequest("POST", "https://x.supabase.co/auth/v1/token?grant_type=refresh_token", null)).toBe("auth:token");
    });
});

describe("summarizeRequests", () => {
    it("groups by label with wall span, slowest request and rows", () => {
        const rows = summarizeRequests(
            [req("orders:count", 0, 200), req("orders:page", 200, 900, 1000), req("orders:page", 210, 1400, 176)],
            0,
            2000,
        );
        expect(rows).toEqual([
            { label: "orders:count", count: 1, firstStart: 0, lastEnd: 200, wallMs: 200, slowestMs: 200, rows: 0 },
            { label: "orders:page", count: 2, firstStart: 200, lastEnd: 1400, wallMs: 1200, slowestMs: 1190, rows: 1176 },
        ]);
    });
});

describe("rowsFromContentRange", () => {
    it("reads PostgREST ranges", () => {
        expect(rowsFromContentRange("0-999/5176")).toBe(1000);
        expect(rowsFromContentRange("5000-5175/*")).toBe(176);
        expect(rowsFromContentRange("*/0")).toBe(0);
        expect(rowsFromContentRange(null)).toBeNull();
    });
});
