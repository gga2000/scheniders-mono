import { loadSentry, reportError } from "@/lib/report-error";

// The browser SDK loads once the page is up and idle, so its download and
// start-up stay out of the way of the page's own scripts and first data
// calls (lib/report-error.ts). Until then, uncaught errors are forwarded by
// hand: that sends them and starts the SDK early. Server and edge errors are
// unaffected (instrumentation.ts). Session Replay is left out for the same
// reason.

const onError = (event: ErrorEvent) => {
    // Without an Error object this is a cross-origin "Script error." with
    // nothing to debug; the SDK drops those too.
    if (event.error) reportError(event.error);
};
const onRejection = (event: PromiseRejectionEvent) => reportError(event.reason);

window.addEventListener("error", onError);
window.addEventListener("unhandledrejection", onRejection);

function start() {
    loadSentry().then(
        () => {
            // The SDK now catches these itself.
            window.removeEventListener("error", onError);
            window.removeEventListener("unhandledrejection", onRejection);
        },
        // Offline at start: the forwarders stay, and the next error retries.
        () => undefined,
    );
}

function whenIdle() {
    if ("requestIdleCallback" in window) window.requestIdleCallback(start, { timeout: 4000 });
    else setTimeout(start, 1000);
}

if (document.readyState === "complete") whenIdle();
else window.addEventListener("load", whenIdle, { once: true });
