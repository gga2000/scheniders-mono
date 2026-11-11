import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const sentry = vi.hoisted(() => ({
    captureCheckIn: vi.fn(),
    captureException: vi.fn(),
    captureMessage: vi.fn(),
    flush: vi.fn(async () => true),
}));
vi.mock("@sentry/nextjs", () => sentry);

import { CRON_MONITORS, VERCEL_CRON_PATHS, withCronMonitor, withFailureReport } from "./job-monitor";

const appDir = join(__dirname, "..");
const vercel = JSON.parse(readFileSync(join(appDir, "vercel.json"), "utf8")) as {
    crons: Array<{ path: string; schedule: string }>;
};

describe("cron monitors match vercel.json", () => {
    it("every Vercel cron has a monitor with the same schedule", () => {
        for (const cron of vercel.crons) {
            const key = (Object.keys(VERCEL_CRON_PATHS) as Array<keyof typeof CRON_MONITORS>).find(
                (k) => VERCEL_CRON_PATHS[k] === cron.path,
            );
            expect(key, `no monitor for ${cron.path}`).toBeDefined();
            if (key) expect(CRON_MONITORS[key].schedule, cron.path).toBe(cron.schedule);
        }
    });

    it("every monitor mapped to a Vercel path is still scheduled there", () => {
        const paths = new Set(vercel.crons.map((c) => c.path));
        for (const path of Object.values(VERCEL_CRON_PATHS)) {
            if (path) expect(paths.has(path), path).toBe(true);
        }
    });

    it("every monitor allows the route's full maxDuration", () => {
        for (const [key, path] of Object.entries(VERCEL_CRON_PATHS)) {
            if (!path) continue;
            const source = readFileSync(join(appDir, "app", path, "route.ts"), "utf8");
            const seconds = Number(/export const maxDuration = (\d+)/.exec(source)?.[1] ?? 300);
            const monitor = CRON_MONITORS[key as keyof typeof CRON_MONITORS];
            expect(monitor.maxRuntime * 60, path).toBeGreaterThanOrEqual(seconds);
        }
    });

    it("monitor slugs are unique", () => {
        const slugs = Object.values(CRON_MONITORS).map((m) => m.slug);
        expect(new Set(slugs).size).toBe(slugs.length);
    });
});

const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("withCronMonitor", () => {
    beforeEach(() => vi.clearAllMocks());
    const request = new Request("https://schenidersapp.xyz/api/cron/trial-suspend");

    it("checks in ok on success and raises nothing", async () => {
        const handler = withCronMonitor(CRON_MONITORS.trialSuspend, async () => json(200, { success: true }));
        const res = await handler(request);
        expect(res.status).toBe(200);
        expect(sentry.captureCheckIn).toHaveBeenCalledWith(
            expect.objectContaining({ monitorSlug: "trial-suspend", status: "ok" }),
            expect.objectContaining({ schedule: { type: "crontab", value: "0 6 * * *" }, timezone: "Etc/UTC" }),
        );
        expect(sentry.captureMessage).not.toHaveBeenCalled();
        expect(sentry.flush).toHaveBeenCalled();
    });

    it("checks in error and raises one grouped issue on a handled 500", async () => {
        const handler = withCronMonitor(CRON_MONITORS.trialSuspend, async () => json(500, { error: "db down" }));
        await handler(request);
        expect(sentry.captureCheckIn).toHaveBeenCalledWith(
            expect.objectContaining({ monitorSlug: "trial-suspend", status: "error" }),
            expect.anything(),
        );
        expect(sentry.captureMessage).toHaveBeenCalledWith(
            "Job trial-suspend failed (HTTP 500): db down",
            expect.objectContaining({ fingerprint: ["job-failed", "trial-suspend"], tags: { job: "trial-suspend" } }),
        );
    });

    it("checks in error, reports and rethrows on a throw", async () => {
        const boom = new Error("boom");
        const handler = withCronMonitor(CRON_MONITORS.primeSync, async () => {
            throw boom;
        });
        await expect(handler(request)).rejects.toBe(boom);
        expect(sentry.captureException).toHaveBeenCalledWith(boom, { tags: { job: "prime-sync" } });
        expect(sentry.captureCheckIn).toHaveBeenCalledWith(
            expect.objectContaining({ status: "error" }),
            expect.anything(),
        );
    });

    it("sends no check-in for an unauthenticated call", async () => {
        const handler = withCronMonitor(CRON_MONITORS.trialSuspend, async () => json(401, { error: "Unauthorized" }));
        await handler(request);
        expect(sentry.captureCheckIn).not.toHaveBeenCalled();
        expect(sentry.captureMessage).not.toHaveBeenCalled();
    });

    it("treats a missing CRON_SECRET (503) as a failed run", async () => {
        const handler = withCronMonitor(CRON_MONITORS.backup, async () => json(503, { error: "Endpoint is not configured." }));
        await handler(request);
        expect(sentry.captureCheckIn).toHaveBeenCalledWith(expect.objectContaining({ status: "error" }), expect.anything());
    });
});

describe("withFailureReport", () => {
    beforeEach(() => vi.clearAllMocks());
    const request = new Request("https://schenidersapp.xyz/api/cron/auto-follow-up", { method: "POST" });

    it("raises an issue on a 5xx without a check-in", async () => {
        const handler = withFailureReport("auto-follow-up", async () => new Response("upstream down", { status: 502 }));
        await handler(request);
        expect(sentry.captureMessage).toHaveBeenCalledWith(
            "Job auto-follow-up failed (HTTP 502): upstream down",
            expect.anything(),
        );
        expect(sentry.captureCheckIn).not.toHaveBeenCalled();
    });

    it("stays quiet on success", async () => {
        const handler = withFailureReport("auto-follow-up", async () => json(200, { success: true }));
        await handler(request);
        expect(sentry.captureMessage).not.toHaveBeenCalled();
        expect(sentry.flush).not.toHaveBeenCalled();
    });
});
