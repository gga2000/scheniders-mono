/**
 * Paths whose POSTs carry a Vercel BotID token. The browser path is what
 * counts: v2 stores post to /api/checkout/orders, legacy checkout pages call
 * the submitCheckout server action on their own URL (custom domain or
 * /s/<tenant>/checkout).
 */
export const CHECKOUT_BOT_PROTECTED_PATHS = ["/api/checkout/orders", "/checkout", "/s/*/checkout"] as const;

/**
 * First path segment of BotID's same-origin challenge and proxy routes, which
 * `withBotId` (botid/next/config) adds as rewrites to api.vercel.com. They are
 * not store pages, so the proxy must leave them alone instead of rewriting
 * them under /s/<tenant>/ on a subdomain or custom domain.
 */
export const BOTID_ROUTE_PREFIX = "/149e9513-01fa-4fb0-aad4-566afd725d1b/";
