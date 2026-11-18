// Starts Sentry in the browser once, whoever asks first: the page's load
// event (instrumentation-client.ts), a screen that caught an error
// (report-error.ts), or an error nothing caught before then. Sentry's own
// listeners only start with it, so until then such errors are kept here and
// sent once it has started.
type SentryBrowser = typeof import("./sentry-browser");

const early: unknown[] = [];
let sentry: Promise<SentryBrowser> | null = null;

function keepEarly(event: ErrorEvent | PromiseRejectionEvent) {
  early.push("reason" in event ? event.reason : (event.error ?? event.message));
  void startSentry();
}

export function keepEarlyErrors(): void {
  window.addEventListener("error", keepEarly);
  window.addEventListener("unhandledrejection", keepEarly);
}

export function startSentry(): Promise<SentryBrowser> {
  sentry ??= import("./sentry-browser").then((browser) => {
    window.removeEventListener("error", keepEarly);
    window.removeEventListener("unhandledrejection", keepEarly);
    for (const error of early.splice(0)) browser.captureException(error);
    return browser;
  });
  return sentry;
}
