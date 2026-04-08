import { NextRequest, NextResponse } from "next/server";

const ROOT_DOMAIN =
  process.env.NEXT_PUBLIC_ROOT_DOMAIN ||
  process.env.NEXT_PUBLIC_DEV_ROOT_DOMAIN ||
  "localhost:3001";

/**
 * Extracts the tenant slug from the host header.
 *
 * Examples:
 *   acme.scheniders.com   → "acme"
 *   acme.localhost:3001   → "acme"
 *   scheniders.com        → null (root domain)
 *   custom-domain.com     → "__custom__" (handled separately)
 */
function extractSlug(host: string): { slug: string | null; isCustom: boolean } {
  // Strip port for matching
  const hostNoPort = host.split(":")[0];
  const rootNoPort = ROOT_DOMAIN.split(":")[0];

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

export function proxy(request: NextRequest) {
  const host = request.headers.get("host") || "";
  const { slug, isCustom } = extractSlug(host);
  const url = request.nextUrl.clone();

  // Pass through Next internals and static files
  if (
    url.pathname.startsWith("/_next") ||
    url.pathname.startsWith("/api") ||
    url.pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  if (!slug && !isCustom) {
    // Root domain — path-based access (/s/[tenant]/...) or landing page
    // Set x-store-base so tenant layout knows to use path-based links
    if (url.pathname.startsWith("/s/")) {
      const tenantSlug = url.pathname.split("/")[2];
      if (tenantSlug) {
        const requestHeaders = new Headers(request.headers);
        requestHeaders.set("x-store-base", `/s/${tenantSlug}`);
        return NextResponse.next({ request: { headers: requestHeaders } });
      }
    }
    return NextResponse.next();
  }

  // Subdomain / custom domain → rewrite to /s/[tenant]/...
  // x-store-base = "" means links stay root-relative (proxy handles rewrites)
  const tenantKey = isCustom ? `__domain__${slug}` : slug;
  url.pathname = `/s/${tenantKey}${url.pathname}`;
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-store-base", "");
  return NextResponse.rewrite(url, { request: { headers: requestHeaders } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
