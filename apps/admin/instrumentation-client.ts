// Sentry starts once the page has loaded, in its own chunk, so the first
// paint never waits for it. An error before then starts it at once and is
// still sent (lib/sentry-start.ts).
import { config as zodConfig } from "zod/v4/core";
import { keepEarlyErrors, reportPolicyBreaches, startSentry } from "./lib/sentry-start";

// Zod tests whether eval works the first time it checks an object, and the
// script policy forbids eval, so every page would report a breach. Without
// the test Zod checks the same way, a little slower, on forms this small.
zodConfig({ jitless: true });

keepEarlyErrors();
reportPolicyBreaches();

if (document.readyState === "complete") void startSentry();
else window.addEventListener("load", () => void startSentry(), { once: true });
