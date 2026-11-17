/**
 * Sends an error a screen caught to Sentry, tagged with the boundary that
 * caught it. A caught error is drawn as a friendly card, so without this
 * nobody but the person looking at the card learns of it. Loading the
 * module starts Sentry if the page has not done so yet
 * (instrumentation-client.ts), so an error before the load event is kept.
 */
export function reportError(error: unknown, boundary: string, extra?: Record<string, unknown>): void {
  void import("./sentry-browser").then(({ captureException }) =>
    captureException(error, { tags: { boundary }, extra }),
  );
}
