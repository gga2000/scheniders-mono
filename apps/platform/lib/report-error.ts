// apps/platform/lib/report-error.ts
//
// Error reporting for any module that can run in the browser.
//
// The Sentry browser SDK is about 160 KB (brotli). A static
// `import * as Sentry from "@sentry/nextjs"` in a client module puts it on
// every page's first load, and an eager dynamic import still downloads and
// runs it alongside the page's own scripts: on a slow link that held the
// dashboard's first data call back by about a second. So the SDK loads here,
// once, either when the page has gone idle (instrumentation-client.ts) or on
// the first report, whichever comes first. Server-only modules (app/api, MCP
// tools, crons) keep their static import; lib/client-sentry.guard.test.ts
// holds the line.

import type { SentryIdentity } from "@/lib/sentry-identity";

type SentrySdk = typeof import("@sentry/nextjs");
type CaptureContext = Parameters<SentrySdk["captureException"]>[1];

let sdk: Promise<SentrySdk> | undefined;
let loaded: SentrySdk | undefined;
let identity: SentryIdentity | undefined;

function applyIdentity(Sentry: SentrySdk, next: SentryIdentity): void {
    Sentry.setUser(next.user);
    Sentry.setTag("tenant_id", next.tags.tenant_id);
    Sentry.setTag("user_role", next.tags.user_role);
}

/** The SDK, downloaded and initialised once. The first call starts the download. */
export function loadSentry(): Promise<SentrySdk> {
    sdk ??= Promise.all([import("@sentry/nextjs"), import("@scheniders/shared/sentry-scrub")]).then(
        ([Sentry, { baseSentryOptions }]) => {
            Sentry.init(
                baseSentryOptions({
                    app: "platform",
                    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
                    vercelEnv: process.env.NEXT_PUBLIC_VERCEL_ENV,
                    tracesSampleRate: 0.1,
                }),
            );
            if (identity) applyIdentity(Sentry, identity);
            loaded = Sentry;
            return Sentry;
        },
        // The download failed (the line dropped). Forget it, so the next
        // report tries again instead of failing for the rest of the visit.
        (loadError: unknown) => {
            sdk = undefined;
            throw loadError;
        },
    );
    return sdk;
}

/**
 * Who is signed in, for every report this page sends. Kept until the SDK
 * loads; setting it never starts the download.
 */
export function setReportIdentity(next: SentryIdentity): void {
    identity = next;
    if (loaded) applyIdentity(loaded, next);
}

/** Send an exception to Sentry, with the same context argument as `Sentry.captureException`. */
export function reportError(error: unknown, context?: CaptureContext): void {
    loadSentry().then(
        (Sentry) => {
            Sentry.captureException(error, context);
        },
        // There is nowhere to send the report, so leave it in the console.
        (loadError: unknown) => console.error("[report-error] Sentry SDK did not load", loadError, error),
    );
}

/** The id of the last event this page sent, or undefined when it has sent none. */
export function lastReportedEventId(): string | undefined {
    return loaded?.lastEventId();
}
