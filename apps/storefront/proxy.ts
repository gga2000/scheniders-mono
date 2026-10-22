import { NextRequest, NextResponse } from "next/server";
import { extractSlug, storefrontRootDomain } from "@/lib/store-host";

const VISITOR_COOKIE = "sb_vid";
/** 1 year in seconds */
const VISITOR_MAX_AGE = 60 * 60 * 24 * 365;
/** 30 days in seconds — first-touch traffic source window */
const TRAFFIC_SOURCE_MAX_AGE = 60 * 60 * 24 * 30;

/**
 * Ensure every storefront request carries a stable first-party visitor key.
 * The cookie is set httpOnly + secure-in-production so only the server reads it.
 * It is also written onto `request.cookies` so server components in this same
 * request can read it via `(await cookies()).get("sb_vid")` without a round-trip.
 */
function ensureVisitorCookie(
  request: NextRequest,
  response: NextResponse,
): void {
  if (!request.cookies.has(VISITOR_COOKIE)) {
    const visitorId = crypto.randomUUID();
    response.cookies.set(VISITOR_COOKIE, visitorId, {
      maxAge: VISITOR_MAX_AGE,
      path: "/",
      sameSite: "lax",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
    });
    // Propagate into request so the current request's server components can
    // immediately read the new value without needing a second request.
    request.cookies.set(VISITOR_COOKIE, visitorId);
  }
}

/**
 * Set on the RESPONSE only (not propagated into request.cookies) so the very
 * first page render correctly sees "no first-seen cookie" = new visitor.
 * Subsequent requests will carry the cookie = returning visitor.
 */
function ensureFirstSeenCookie(
  request: NextRequest,
  response: NextResponse,
): void {
  if (!request.cookies.has("sb_first")) {
    response.cookies.set("sb_first", Date.now().toString(), {
      maxAge: VISITOR_MAX_AGE,
      path: "/",
      sameSite: "lax",
      httpOnly: true,
    });
  }
}

/**
 * Buckets the UTM source / referrer into one of the known traffic-source
 * categories. Returns "direct" when no signal is present.
 */
function bucketsTrafficSource(
  url: URL,
  referer: string | null,
): "meta" | "tiktok" | "google" | "whatsapp" | "direct" {
  const raw = (url.searchParams.get("utm_source") ?? referer ?? "").toLowerCase();
  if (/facebook|fb|instagram|ig|meta/.test(raw)) return "meta";
  if (/tiktok|tt/.test(raw)) return "tiktok";
  if (/google|adwords|gads/.test(raw)) return "google";
  if (/whatsapp|wa/.test(raw)) return "whatsapp";
  return "direct";
}

/**
 * First-touch traffic source: only recorded once (if absent) on the response.
 * Not propagated into request.cookies — first-page render stays clean.
 */
function ensureTrafficSourceCookie(
  request: NextRequest,
  response: NextResponse,
): void {
  if (!request.cookies.has("sb_src")) {
    const source = bucketsTrafficSource(
      request.nextUrl,
      request.headers.get("referer"),
    );
    response.cookies.set("sb_src", source, {
      maxAge: TRAFFIC_SOURCE_MAX_AGE,
      path: "/",
      sameSite: "lax",
      httpOnly: true,
    });
  }
}

const ROOT_DOMAIN = storefrontRootDomain();

/**
 * Per-tenant documents served from a store's own root, which happen to carry
 * a file extension. Everything else with a dot in it is a static asset.
 */
const TENANT_ROOT_FILES: ReadonlySet<string> = new Set([
  "/manifest.webmanifest",
  "/sitemap.xml",
]);

/**
 * The visitor's path and query as received, before any rewrite. A renamed
 * store's old link 308s to its new slug from inside the route
 * (route-guards requireStoreTenant), which only sees the `[tenant]` param;
 * this header lets it keep the rest of the URL, so a shared product link
 * lands on the same product. Always set by the proxy, so a client-sent
 * value never survives.
 */
const STORE_PATH_HEADER = "x-store-path";

export function proxy(request: NextRequest) {
  const host = request.headers.get("host") || "";
  const { slug, isCustom } = extractSlug(host, ROOT_DOMAIN);
  const url = request.nextUrl.clone();
  const storePath = `${request.nextUrl.pathname}${request.nextUrl.search}`;

  // Pass through Next internals and static files
  //
  // The dot test is how a static asset is recognised, but two real tenant
  // routes also carry an extension. Passing those through sent them to the
  // platform root, which has no such route — so a store on its own domain
  // got a 404 for its own manifest and its own sitemap, verified live. They
  // have to be rewritten onto /s/[tenant]/ like every other store page.
  if (
    url.pathname.startsWith("/_next") ||
    url.pathname.startsWith("/api") ||
    (url.pathname.includes(".") && !TENANT_ROOT_FILES.has(url.pathname))
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
        requestHeaders.set(STORE_PATH_HEADER, storePath);
        const response = NextResponse.next({ request: { headers: requestHeaders } });
        ensureVisitorCookie(request, response);
        ensureFirstSeenCookie(request, response);
        ensureTrafficSourceCookie(request, response);
        return response;
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
  requestHeaders.set(STORE_PATH_HEADER, storePath);
  const response = NextResponse.rewrite(url, { request: { headers: requestHeaders } });
  ensureVisitorCookie(request, response);
  ensureFirstSeenCookie(request, response);
  ensureTrafficSourceCookie(request, response);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
