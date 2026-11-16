import * as Sentry from "@sentry/nextjs";

/**
 * Time budget for a scheduled job that works through stores one by one
 * (handoff B8).
 *
 * Vercel ends a function at its route's maxDuration, mid-store, and every
 * store after it then waits for a run that may be cut the same way. So a job
 * reads its stores least recently handled first and starts no new store once
 * half of maxDuration has gone; the stores it did not reach are first in line
 * next run. Half, not most: one store can take a while on its own, since each
 * provider call may wait up to 15 seconds.
 *
 * Returns a check: true once no new store should be started.
 */
export function storeBudget(maxDurationSeconds: number, now: () => number = Date.now): () => boolean {
    const deadline = now() + (maxDurationSeconds * 1000) / 2;
    return () => now() >= deadline;
}

/**
 * Raise stores a run had no time for. One warning issue per job (not per
 * run), so a job that keeps falling behind is seen once and stays visible.
 */
export function reportDeferredStores(job: string, deferred: number, total: number): void {
    if (deferred === 0) return;
    Sentry.captureMessage(`Job ${job} ran out of time: ${deferred} of ${total} stores wait for the next run`, {
        level: "warning",
        tags: { job },
        fingerprint: ["job-deferred", job],
    });
}
