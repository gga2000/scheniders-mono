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
//   <root> / www.<root>: path-based access (/s/{slug}/…). The page that sent
//                        the request names the store in its same-origin
//                        Referer; anything else names none.
// =====================================================================

/** The platform's root domain, read the way the proxy always has. */
export function storefrontRootDomain(): string {
  return (
    process.env.NEXT_PUBLIC_ROOT_DOMAIN ||
    process.env.NEXT_PUBLIC_DEV_ROOT_DOMAIN ||
    "localhost:3001"
  );
}

/**
 * Extracts the tenant slug from the host header.
 *
 * Examples:
 *   acme.scheniders.com   → "acme"
 *   acme.localhost:3001   → "acme"
 *   scheniders.com        → null (root domain)
 *   custom-domain.com     → "custom-domain.com", isCustom
 */
export function extractSlug(
  host: string,
  rootDomain: string,
): { slug: string | null; isCustom: boolean } {
  // Strip port for matching
  const hostNoPort = host.split(":")[0];
  const rootNoPort = rootDomain.split(":")[0];

  if (hostNoPort === rootNoPort || hostNoPort === `www.${rootNoPort}`) {
    return { slug: null, isCustom: false };
  }

  if (hostNoPort.endsWith(`.${rootNoPort}`)) {
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
