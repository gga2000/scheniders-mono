// The browser SDK is imported after this module runs instead of statically:
// a static import puts ~76 KB (gzip) on every route's first load, and
// merchants are on mid-range Android over mobile data. Errors thrown before
// the SDK finishes loading are not reported; server and edge errors are
// unaffected (instrumentation.ts). Session Replay is left out for the same
// reason.
void import("@sentry/nextjs").then((Sentry) => {
    Sentry.init({
        dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

        // Define how likely traces are sampled. Adjust this value in production, or use tracesSampler for greater control.
        tracesSampleRate: 0.1,

        // Setting this option to true will print useful information to the console while you're setting up Sentry.
        debug: false,
    });
});
