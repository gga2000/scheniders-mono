import { initBotId } from "botid/client/core";
import { CHECKOUT_BOT_PROTECTED_PATHS } from "@/lib/checkout-bot-paths";

// Invisible bot check on order submission (no puzzle for the shopper).
// The server side is lib/checkout-bot-check.ts.
initBotId({
  protect: CHECKOUT_BOT_PROTECTED_PATHS.map((path) => ({ path, method: "POST" as const })),
});

// Sentry loads only once the page is idle, in its own chunk, so it never
// competes with the first paint on a mid-range phone over Iraqi mobile data
// and stays out of the shared-runtime bundle budget. Errors thrown before it
// loads are not reported; server errors are unaffected (instrumentation.ts).
function loadSentry() {
  void Promise.all([import("@sentry/nextjs"), import("@scheniders/shared/sentry-scrub")]).then(
    ([Sentry, { baseSentryOptions }]) => {
      Sentry.init({
        ...baseSentryOptions({
          dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
          vercelEnv: process.env.NEXT_PUBLIC_VERCEL_ENV,
          // Enough page loads for real-phone Web Vitals (LCP, INP) per store.
          tracesSampleRate: 0.05,
        }),
      });
      (globalThis as { Sentry?: Pick<typeof Sentry, "captureMessage"> }).Sentry = {
        captureMessage: Sentry.captureMessage,
      };
    },
  );
}

if (typeof window !== "undefined") {
  if ("requestIdleCallback" in window) window.requestIdleCallback(loadSentry, { timeout: 5000 });
  else setTimeout(loadSentry, 3000);
}
