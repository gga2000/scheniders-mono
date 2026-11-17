/**
 * The console's script policy: a page runs only the scripts its own server
 * sent with this response's nonce, and the scripts those load. A script an
 * attacker slips into a page (a shop name, a note, a link) has no nonce, so it
 * does not run; this is the backstop behind React's escaping.
 *
 * - The middleware makes one nonce per request, hands it to Next.js in the
 *   request's policy header (Next.js puts it on its own scripts and chunks)
 *   and in x-nonce (the root layout's before-paint script), and sends the same
 *   policy on the response.
 * - 'strict-dynamic' trusts what a trusted script loads: the page chunks,
 *   Sentry's chunk and Vercel Analytics are added by script, so none of their
 *   hosts needs listing. 'self' only matters to browsers older than that.
 * - worker-src names the support alerts service worker: without it the
 *   worker would fall back to script-src, where 'strict-dynamic' ignores 'self'.
 * - object-src and base-uri close the two other ways to run or redirect a
 *   script; form-action keeps forms on the console.
 * - Development needs eval for React's error overlay and fast refresh.
 *
 * Only scripts, workers, plugins, the base URL and form targets are limited:
 * images, styles and API calls are not.
 */

/** Report-only while live runs prove no page breaks it; then the enforcing header. */
export const CSP_HEADER = "Content-Security-Policy-Report-Only";

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
  ].join("; ");
}
