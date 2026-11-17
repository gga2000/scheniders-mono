// Sentry starts once the page has loaded, in its own chunk, so the first
// paint never waits for it. An error before then starts it at once and is
// still sent (lib/sentry-start.ts).
import { keepEarlyErrors, startSentry } from "./lib/sentry-start";

keepEarlyErrors();

if (document.readyState === "complete") void startSentry();
else window.addEventListener("load", () => void startSentry(), { once: true });
