import * as Sentry from "@sentry/nextjs";

/**
 * Sentry cron monitors for every scheduled job.
 *
 * Each run sends one check-in (ok or error, with its duration). Sentry knows
 * the schedule, so it also opens an issue when a run never happens: a Vercel
 * cron that stopped firing, a QStash schedule that was deleted, or a run that
 * Vercel killed at maxDuration before it could report.
 *
 * Sentry creates or updates the monitor from `monitorConfig` on the first
 * check-in, so the schedule lives here, in code, next to vercel.json.
 * `job-monitor.test.ts` fails when the two drift apart.
 */
export interface CronMonitor {
    slug: string;
    /** Crontab, UTC, exactly as in vercel.json (or the QStash schedule). */
    schedule: string;
    /** Minutes a run may start late before Sentry calls it missed. */
    checkinMargin: number;
    /** Minutes a run may take; matches the route's maxDuration, rounded up. */
    maxRuntime: number;
    /** Consecutive failed runs before an issue opens. Frequent jobs tolerate one blip. */
    failureIssueThreshold: number;
}

const daily = (slug: string, schedule: string, maxRuntime: number): CronMonitor => ({
    slug,
    schedule,
    checkinMargin: 30,
    maxRuntime,
    failureIssueThreshold: 1,
});

const frequent = (slug: string, schedule: string, maxRuntime: number): CronMonitor => ({
    slug,
    schedule,
    checkinMargin: 5,
    maxRuntime,
    failureIssueThreshold: 2,
});

export const CRON_MONITORS = {
    backup: daily("backup", "0 0 * * *", 5),
    waseetSync: daily("waseet-sync", "0 12 * * *", 1),
    trialSuspend: daily("trial-suspend", "0 6 * * *", 1),
    subscriptionRenew: daily("subscription-renew", "0 3 * * *", 1),
    cleanupDeletedOrders: daily("cleanup-deleted-orders", "0 1 * * *", 5),
    abandonedCartRecovery: frequent("abandoned-cart-recovery", "*/10 * * * *", 1),
    metaAdsSync: daily("meta-ads-sync", "30 3 * * *", 1),
    // Ali's QStash schedule (Upstash console), every 5 minutes. Not in vercel.json.
    metaAdsSyncQstash: frequent("meta-ads-sync-qstash", "*/5 * * * *", 1),
    primeSync: frequent("prime-sync", "*/5 * * * *", 1),
    waseetLocations: daily("waseet-locations", "0 3 * * 1", 5),
} as const satisfies Record<string, CronMonitor>;

/** Paths in vercel.json, for the drift test. QStash-only monitors map to null. */
export const VERCEL_CRON_PATHS: Record<keyof typeof CRON_MONITORS, string | null> = {
    backup: "/api/cron/backup",
    waseetSync: "/api/cron/waseet-sync",
    trialSuspend: "/api/cron/trial-suspend",
    subscriptionRenew: "/api/cron/subscription-renew",
    cleanupDeletedOrders: "/api/cron/cleanup-deleted-orders",
    abandonedCartRecovery: "/api/cron/abandoned-cart-recovery",
    metaAdsSync: "/api/cron/meta-ads-sync",
    metaAdsSyncQstash: null,
    primeSync: "/api/cron/prime-sync",
    waseetLocations: "/api/cron/waseet-locations",
};

/** A route handler: the request first, then Next's route context for dynamic segments. */
type Handler<A extends [Request, ...unknown[]]> = (...args: A) => Promise<Response>;

/** The `error` field our job routes put in a failed JSON response, if any. */
async function failureDetail(response: Response): Promise<string> {
    const text = await response.clone().text();
    try {
        const body: unknown = JSON.parse(text);
        if (body && typeof body === "object" && "error" in body) {
            const { error } = body as { error: unknown };
            return typeof error === "string" ? error : JSON.stringify(error);
        }
    } catch {
        // Not JSON: the raw text is the detail.
    }
    return text.slice(0, 500);
}

/**
 * Report a job run that ended in a 5xx or a throw as a Sentry issue, grouped
 * per job so one broken job is one issue, not one per run.
 * Returns whether the run counts as failed.
 */
async function reportRun(job: string, response: Response): Promise<boolean> {
    if (response.status < 500) return false;
    const detail = await failureDetail(response);
    Sentry.captureMessage(`Job ${job} failed (HTTP ${response.status}): ${detail}`, {
        level: "error",
        tags: { job },
        fingerprint: ["job-failed", job],
    });
    return true;
}

/**
 * Wrap a scheduled job's route handler: check in with Sentry after every
 * authorised run and raise an issue when it fails. A 401 is a caller that
 * failed authentication (a probe, not a run), so it sends no check-in.
 */
export function withCronMonitor<A extends [Request, ...unknown[]]>(monitor: CronMonitor, handler: Handler<A>): Handler<A> {
    const monitorConfig = {
        schedule: { type: "crontab" as const, value: monitor.schedule },
        checkinMargin: monitor.checkinMargin,
        maxRuntime: monitor.maxRuntime,
        timezone: "Etc/UTC",
        failureIssueThreshold: monitor.failureIssueThreshold,
        recoveryThreshold: 1,
    };
    return async (...args) => {
        const started = Date.now();
        const checkIn = (status: "ok" | "error") =>
            Sentry.captureCheckIn(
                { monitorSlug: monitor.slug, status, duration: (Date.now() - started) / 1000 },
                monitorConfig,
            );
        let response: Response;
        try {
            response = await handler(...args);
        } catch (err) {
            Sentry.captureException(err, { tags: { job: monitor.slug } });
            checkIn("error");
            await Sentry.flush(2000);
            throw err;
        }
        if (response.status === 401) return response;
        const failed = await reportRun(monitor.slug, response);
        checkIn(failed ? "error" : "ok");
        // Serverless: send before the function freezes, or the check-in is lost.
        await Sentry.flush(2000);
        return response;
    };
}

/**
 * For endpoints with no fixed schedule (webhooks from Prime and Interakt,
 * QStash messages sent per order): raise an issue on a 5xx or a throw,
 * without a cron monitor.
 */
export function withFailureReport<A extends [Request, ...unknown[]]>(job: string, handler: Handler<A>): Handler<A> {
    return async (...args) => {
        let response: Response;
        try {
            response = await handler(...args);
        } catch (err) {
            Sentry.captureException(err, { tags: { job } });
            await Sentry.flush(2000);
            throw err;
        }
        if (await reportRun(job, response)) await Sentry.flush(2000);
        return response;
    };
}
