// apps/platform/lib/report-error.ts
//
// Error reporting for any module that can run in the browser.
//
// instrumentation-client.ts loads the Sentry browser SDK after the page starts,
// so the SDK stays off every page's first load. One static
// `import * as Sentry from "@sentry/nextjs"` in a client module undoes that:
// the language provider, the auth provider (through order-telemetry) and the
// dashboard hooks each had one, and the SDK rode in the first-load chunk with
// supabase-js (152 KB brotli) on every page. Report through here instead. The
// SDK is usually already loaded by the init; otherwise it loads on the first
// report. Server-only modules (app/api, MCP tools, crons) keep their static
// import; lib/client-sentry.guard.test.ts holds the line.

type SentrySdk = typeof import("@sentry/nextjs");
type CaptureContext = Parameters<SentrySdk["captureException"]>[1];

let sdk: Promise<SentrySdk> | undefined;
let loaded: SentrySdk | undefined;

/** The SDK module, loaded once. instrumentation-client.ts initialises it through this. */
export function loadSentry(): Promise<SentrySdk> {
    sdk ??= import("@sentry/nextjs").then((mod) => (loaded = mod));
    return sdk;
}

/** Send an exception to Sentry, with the same context argument as `Sentry.captureException`. */
export function reportError(error: unknown, context?: CaptureContext): void {
    loadSentry().then(
        (Sentry) => {
            Sentry.captureException(error, context);
        },
        // The SDK chunk itself failed to download (the line dropped). There is
        // nowhere to send the report, so leave it in the console.
        (loadError: unknown) => console.error("[report-error] Sentry SDK did not load", loadError, error),
    );
}

/** The id of the last event this page sent, or undefined when it has sent none. */
export function lastReportedEventId(): string | undefined {
    return loaded?.lastEventId();
}
