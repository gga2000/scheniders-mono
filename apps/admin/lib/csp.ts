/**
 * The console's content security policy: a page runs only the scripts its own
 * server sent with this response's nonce, and the scripts those load. A script
 * an attacker slips into a page (a shop name, a note, a link) has no nonce, so
 * it does not run; this is the backstop behind React's escaping.
 *
 * - The middleware makes one nonce per request, hands it to Next.js in the
 *   request's copy of the policy (Next.js reads its nonce from there and puts
 *   it on its own scripts and chunks) and in x-nonce (the root layout's
 *   before-paint script, and the theme's), and sends the policy on the response.
 * - This is the console's only policy, framing rule included: next.config sets
 *   none. While next.config sent one too, Next.js on Vercel found no nonce in
 *   the request and left its own scripts without one.
 * - 'strict-dynamic' trusts what a trusted script loads: the page chunks,
 *   Sentry's chunk and Vercel Analytics are added by script, so none of their
 *   hosts needs listing. 'self' only matters to browsers older than that.
 * - worker-src names the support alerts service worker: without it the
 *   worker would fall back to script-src, where 'strict-dynamic' ignores 'self'.
 * - object-src and base-uri close the two other ways to run or redirect a
 *   script; form-action keeps forms on the console; frame-ancestors keeps
 *   every other site from showing the console in a frame (X-Frame-Options
 *   from next.config says the same to browsers older than frame-ancestors).
 * - Development needs eval for React's error overlay and fast refresh. Zod
 *   would test eval in the browser too; instrumentation-client turns that off.
 *
 * Only scripts, workers, plugins, the base URL, form targets and frames are
 * limited: images, styles and API calls are not.
 */

/**
 * Enforced: it ran report-only first (#1381-#1383) until a live run of every
 * menu page showed each script with the nonce and no breach.
 */
export const CSP_HEADER = "Content-Security-Policy";

/** A fresh nonce: 16 random bytes, base64 (the form Next.js reads). */
export function newNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes));
}

export function scriptPolicy(nonce: string, development = false): string {
  const scripts = ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", ...(development ? ["'unsafe-eval'"] : [])];
  return [
    `script-src ${scripts.join(" ")}`,
    "worker-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}
