import { beforeEach, describe, expect, it, vi } from "vitest";

const captureMessage = vi.fn();
vi.mock("@sentry/nextjs", () => ({ captureMessage }));

const { reportDeferredStores, storeBudget } = await import("./cron-budget");

beforeEach(() => captureMessage.mockReset());

describe("storeBudget", () => {
    it("allows new stores for half of maxDuration, then stops", () => {
        let clock = 1_000_000;
        const spent = storeBudget(60, () => clock);
        expect(spent()).toBe(false);
        clock += 29_999;
        expect(spent()).toBe(false);
        clock += 1;
        expect(spent()).toBe(true);
    });
});

describe("reportDeferredStores", () => {
    it("says nothing when every store was reached", () => {
        reportDeferredStores("prime-sync", 0, 4);
        expect(captureMessage).not.toHaveBeenCalled();
    });

    it("raises one warning per job, whatever the count", () => {
        reportDeferredStores("prime-sync", 3, 10);
        reportDeferredStores("prime-sync", 5, 10);
        expect(captureMessage).toHaveBeenCalledTimes(2);
        expect(captureMessage.mock.calls[0]).toEqual([
            "Job prime-sync ran out of time: 3 of 10 stores wait for the next run",
            { level: "warning", tags: { job: "prime-sync" }, fingerprint: ["job-deferred", "prime-sync"] },
        ]);
        // Same fingerprint, so Sentry keeps both runs in one issue.
        expect(captureMessage.mock.calls[1][1].fingerprint).toEqual(["job-deferred", "prime-sync"]);
    });
});
