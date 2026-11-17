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

/** A script, worker or frame the console's policy blocked (lib/csp.ts). */
class PolicyBreach extends Error {
  override name = "PolicyBreach";
}

const EXTENSION = /^(chrome|moz|safari|safari-web)-extension:/;

/**
 * Each breach of the script policy reaches Sentry once per page: after a
 * dependency update it is how a page the policy breaks shows up, and a
 * blocked attack is worth knowing about. A browser extension's breach is the
 * extension's, not the console's, and is left out.
 */
export function reportPolicyBreaches(): void {
  const sent = new Set<string>();
  document.addEventListener("securitypolicyviolation", (event) => {
    if (EXTENSION.test(event.blockedURI) || EXTENSION.test(event.sourceFile)) return;
    const breach = `${event.effectiveDirective} blocked ${event.blockedURI || "inline"} at ${event.sourceFile || location.pathname}:${event.lineNumber}`;
    if (sent.has(breach)) return;
    sent.add(breach);
    void startSentry().then((browser) => browser.captureException(new PolicyBreach(breach)));
  });
}
