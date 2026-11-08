// =====================================================================
// Which store does this request belong to? Decided from the request
// =====================================================================
// One reading of the Host header, shared by the proxy (which rewrites store
// pages onto /s/[tenant]) and by API routes. The proxy passes every /api/*
// request through untouched, so a route that writes on a store's behalf
// must work out the store itself, and never from its request body.
//
//   shop.<root>        → "shop"
//   shop.example.com   → "__domain__shop.example.com" (a store's own domain)
//   www.<root>         → "__domain__www.<root>" (the store that verified it)
//   <root>:              path-based access (/s/{slug}/…). The page that sent
//                        the request names the store in its same-origin
//                        Referer; anything else names none.
// =====================================================================

/**
 * The platform's root domain, lowercased and trimmed. A value pasted into the
 * Vercel dashboard can carry a trailing newline; untrimmed, it never equals a
 * Host header, so every store subdomain fell through to the custom-domain
 * lookup and showed "store not found".
 */
export function storefrontRootDomain(): string {
  return (
    process.env.NEXT_PUBLIC_ROOT_DOMAIN?.trim() ||
    process.env.NEXT_PUBLIC_DEV_ROOT_DOMAIN?.trim() ||
    "localhost:3001"
  ).toLowerCase();
}

/**
 * Extracts the tenant slug from the host header.
 *
 * Examples:
 *   acme.scheniders.com   → "acme"
 *   acme.localhost:3001   → "acme"
 *   scheniders.com        → null (root domain: path mode, /s/<slug>)
 *   www.scheniders.com    → "www.scheniders.com", isCustom
 *   custom-domain.com     → "custom-domain.com", isCustom
 *
 * `www.<root>` is not a platform page: it is the address of whichever store
 * verified it in tenant_domains (Scheniders' own perfume store today), and of
 * no store at all otherwise, so it resolves exactly like a custom domain.
 * "www" is a reserved slug, so no merchant can claim it as a subdomain.
 */
export function extractSlug(
  host: string,
  rootDomain: string,
): { slug: string | null; isCustom: boolean } {
  // Strip port for matching; hostnames are case-insensitive.
  const hostNoPort = host.split(":")[0].trim().toLowerCase();
  const rootNoPort = rootDomain.split(":")[0].trim().toLowerCase();

  if (hostNoPort === rootNoPort) {
    return { slug: null, isCustom: false };
  }

  if (hostNoPort !== `www.${rootNoPort}` && hostNoPort.endsWith(`.${rootNoPort}`)) {
    const slug = hostNoPort.slice(0, -1 - rootNoPort.length);
    return { slug, isCustom: false };
  }

  // Treat as a custom domain
  return { slug: hostNoPort, isCustom: true };
}

/** A store page on the root domain: /s/{slug} or /s/{slug}/… */
const PATH_STORE = /^\/s\/([^/]+)(?:\/|$)/;

/**
 * The `[tenant]` route key (a slug, or `__domain__<host>`) of the store this
 * request was made from, or null when the request names no store.
 */
export function storeKeyFromRequest(
  headers: Headers,
  rootDomain: string = storefrontRootDomain(),
): string | null {
  const host = headers.get("host") ?? "";
  const { slug, isCustom } = extractSlug(host, rootDomain);
  if (slug) return isCustom ? `__domain__${slug}` : slug;

  const referer = headers.get("referer");
  if (!referer || !host) return null;
  let page: URL;
  try {
    page = new URL(referer);
  } catch {
    // An unparseable referer names no page, so it names no store.
    return null;
  }
  if (page.host !== host) return null;
  return PATH_STORE.exec(page.pathname)?.[1] ?? null;
}
