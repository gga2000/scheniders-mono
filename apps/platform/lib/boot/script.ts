import { BOOT_GLOBAL } from "@/lib/boot/schema";
import { FINANCE_PERIOD_STORAGE_KEY } from "@/lib/finance/period";

/** Pages with no signed-in user to read for (the same list the app layout treats as auth pages), and /offline. */
const SIGNED_OUT_PAGES = /^\/(login|forgot-password|reset-password|signup|join\/|landing|offline)/;

/**
 * The head script that starts the first-load read (lib/boot/schema.ts) as soon
 * as the page's HTML is parsed, while its code is still downloading. It sends
 * the page and the choices the page will open on: /dashboard's `?range=` and
 * /finances' period kept in this browser. The answer waits on
 * `window.__fermiBoot` for the auth provider to take (lib/boot/take.ts).
 *
 * It never fails the page: a failed or timed-out request resolves to status 0,
 * and the app then reads as it always did.
 */
export const BOOT_SCRIPT = `(function () {
  var path = location.pathname;
  if (${SIGNED_OUT_PAGES}.test(path)) return;
  var q = new URLSearchParams({ path: path });
  var range = new URLSearchParams(location.search).get("range");
  if (range) q.set("range", range);
  if (path === "/finances") {
    var period = null;
    try { period = localStorage.getItem(${JSON.stringify(FINANCE_PERIOD_STORAGE_KEY)}); } catch (e) { /* storage blocked: the page opens on its default too */ }
    if (period) q.set("financePeriod", period);
  }
  var signal = typeof AbortSignal !== "undefined" && AbortSignal.timeout ? AbortSignal.timeout(10000) : undefined;
  window[${JSON.stringify(BOOT_GLOBAL)}] = fetch("/api/boot?" + q.toString(), { credentials: "same-origin", signal: signal })
    .then(function (res) {
      if (!res.ok) return { status: res.status, body: null, at: Date.now() };
      return res.json().then(function (body) { return { status: res.status, body: body, at: Date.now() }; });
    })
    .catch(function () { return { status: 0, body: null, at: Date.now() }; });
})();`;
