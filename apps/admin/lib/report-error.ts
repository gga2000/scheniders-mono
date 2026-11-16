/**
 * Sends an error a screen caught to Sentry, tagged with the boundary that
 * caught it. A caught error is drawn as a friendly card, so without this
 * nobody but the person looking at the card learns of it. The SDK loads on
 * demand, like in instrumentation-client.ts.
 */
export function reportError(error: unknown, boundary: string, extra?: Record<string, unknown>): void {
  void import("@sentry/nextjs").then((Sentry) => Sentry.captureException(error, { tags: { boundary }, extra }));
}
