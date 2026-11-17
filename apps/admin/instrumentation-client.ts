// Sentry starts once the page has loaded, in its own chunk, so the first
// paint never waits for it. A screen that catches an error before then
// loads it at once (lib/report-error.ts).
export function startSentry() {
  void import("./lib/sentry-browser");
}

if (document.readyState === "complete") startSentry();
else window.addEventListener("load", startSentry, { once: true });
