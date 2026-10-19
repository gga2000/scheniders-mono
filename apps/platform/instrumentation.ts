import * as Sentry from "@sentry/nextjs";

// Next.js only loads the server and edge Sentry configs through this hook;
// without it neither runtime ever calls Sentry.init.
export async function register() {
    if (process.env.NEXT_RUNTIME === "nodejs") {
        await import("./sentry.server.config");
    }
    if (process.env.NEXT_RUNTIME === "edge") {
        await import("./sentry.edge.config");
    }
}

export const onRequestError = Sentry.captureRequestError;
