import { NextRequest, NextResponse } from "next/server";
import {
  AD_ATTRIBUTION_COOKIE,
  parseAdUrlParams,
  serializeAdAttribution,
} from "@scheniders/shared/ad-attribution";
import { extractSlug, legacyStoreSlug, storefrontLegacyRootDomains, storefrontRootDomain } from "@/lib/store-host";
import { QUIET_VIEW_HEADER, QUIET_VIEW_PARAM } from "@/lib/quiet-view";
import { BOTID_ROUTE_PREFIX } from "@/lib/checkout-bot-paths";
import {
  FBC_COOKIE,
  FBP_COOKIE,
  META_COOKIE_MAX_AGE,
  metaCookieUpdates,
  randomFbpId,
} from "@/lib/meta-cookies";

const VISITOR_COOKIE = "sb_vid";
/** 1 year in seconds */
const VISITOR_MAX_AGE = 60 * 60 * 24 * 365;
/** 30 days in seconds — first-touch traffic source window */
const TRAFFIC_SOURCE_MAX_AGE = 60 * 60 * 24 * 30;
/** 30 days in seconds — last-touch ad window */
const AD_ATTRIBUTION_MAX_AGE = 60 * 60 * 24 * 30;

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

/**
 * Last-touch ad click: the latest landing URL that carries ad parameters
 * (utm_*, fbclid) replaces the stored one, so the order is credited to the ad
 * the buyer last clicked. Organic visits leave the cookie alone.
 */
function recordAdAttributionCookie(
  request: NextRequest,
  response: NextResponse,
): void {
  const attribution = parseAdUrlParams(request.nextUrl.searchParams);
  if (!attribution) return;
  response.cookies.set(AD_ATTRIBUTION_COOKIE, serializeAdAttribution(attribution), {
    maxAge: AD_ATTRIBUTION_MAX_AGE,
    path: "/",
    sameSite: "lax",
    httpOnly: true,
  });
}

/**
 * Meta's `_fbc` / `_fbp` as first-party server cookies (see lib/meta-cookies).
 * Written onto the request too, so this same render and a checkout in it
 * already see them.
 */
function ensureMetaCookies(request: NextRequest, response: NextResponse): void {
  const updates = metaCookieUpdates({
    fbclid: request.nextUrl.searchParams.get("fbclid"),
    fbc: request.cookies.get(FBC_COOKIE)?.value,
    fbp: request.cookies.get(FBP_COOKIE)?.value,
    nowMs: Date.now(),
    random: randomFbpId(),
  });
  for (const { name, value } of updates) {
    response.cookies.set(name, value, {
      maxAge: META_COOKIE_MAX_AGE,
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
    request.cookies.set(name, value);
  }
}

const ROOT_DOMAIN = storefrontRootDomain();
/** No subdomains on a local root (localhost:3001), so stores use /s/<slug>. */
const ROOT_IS_LOCAL = ROOT_DOMAIN.startsWith("localhost");
/** Roots stores used to live under (`<slug>.scheniders.com`). */
const LEGACY_ROOTS = storefrontLegacyRootDomains(ROOT_DOMAIN);
/** A slug that is a valid single DNS label. */
const SUBDOMAIN_SLUG = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;

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

/**
 * Fermi's own landing page (C2), a static document in public/landing. The
 * root domain's home serves it; its images, fonts and icons live under a
 * versioned folders (/landing/v4/, /landing/v5/) so they can be cached for good.
 */
const LANDING_PAGE = "/landing/index.html";

/**
 * Fermi's full features page, a static document in public/features served
 * at the root domain's /features. Its images and link preview live under a
 * versioned folder (/features/v1/) so they can be cached for good.
 */
const FEATURES_PAGE = "/features/index.html";

/** "1" when the hub's live preview asked for a page view that tracks nothing. */
function quietFlag(request: NextRequest): string {
  return request.nextUrl.searchParams.get(QUIET_VIEW_PARAM) === "1" ? "1" : "0";
}

/** The editor's preview route: `/_preview` and everything under it. */
function isPreviewPath(pathname: string): boolean {
  return pathname === "/_preview" || pathname.startsWith("/_preview/");
}

export function proxy(request: NextRequest) {
  const host = request.headers.get("host") || "";
  const { slug, isCustom } = extractSlug(host, ROOT_DOMAIN, LEGACY_ROOTS);
  const url = request.nextUrl.clone();
  const storePath = `${request.nextUrl.pathname}${request.nextUrl.search}`;

  // Pass through Next internals and static files
  //
  // The dot test is how a static asset is recognised, but two real tenant
  // routes also carry an extension. Passing those through sent them to the
  // platform root, which has no such route — so a store on its own domain
  // got a 404 for its own manifest and its own sitemap, verified live. They
  // have to be rewritten onto /s/[tenant]/ like every other store page.
  //
  // The editor preview route already names its tenant in the path
  // (/_preview/<slug>/<page>) and checks a tenant-scoped token. The editor
  // loads it on the store's own origin, so on a custom domain or subdomain it
  // must not be pushed under /s/<tenant>/ — that path does not exist, and the
  // merchant saw their store's 404 page instead of the page they were editing.
  if (
    url.pathname.startsWith("/_next") ||
    url.pathname.startsWith("/api") ||
    url.pathname.startsWith(BOTID_ROUTE_PREFIX) ||
    isPreviewPath(url.pathname) ||
    (url.pathname.includes(".") && !TENANT_ROOT_FILES.has(url.pathname))
  ) {
    return NextResponse.next();
  }

  // A store page on its old address (`<slug>.scheniders.com`) moves to the
  // same path on `<slug>.<root>`, so shared links and ads keep landing. Only
  // page loads: a form or API call from a page opened before the move is
  // still served here (cross-origin, a redirected POST would fail).
  if (!ROOT_IS_LOCAL && (request.method === "GET" || request.method === "HEAD")) {
    const legacy = legacyStoreSlug(host, LEGACY_ROOTS);
    if (legacy && SUBDOMAIN_SLUG.test(legacy)) {
      return NextResponse.redirect(`https://${legacy}.${ROOT_DOMAIN}${storePath}`, 308);
    }
  }

  // www.<root> is not a store: it is the landing page's second address, so it
  // moves to the bare root with the same path and query.
  if (!ROOT_IS_LOCAL && (request.method === "GET" || request.method === "HEAD")) {
    if (host.split(":")[0].trim().toLowerCase() === `www.${ROOT_DOMAIN}`) {
      return NextResponse.redirect(`https://${ROOT_DOMAIN}${storePath}`, 308);
    }
  }

  if (!slug && !isCustom) {
    // Root domain — path-based access (/s/[tenant]/...) or landing page
    // Set x-store-base so tenant layout knows to use path-based links
    if (url.pathname.startsWith("/s/")) {
      const tenantSlug = url.pathname.split("/")[2];
      // On the real root domain every store has its own subdomain. Serving
      // /s/<slug> here put every store on ONE origin, so one merchant's
      // tracking script could read another store's shoppers' carts and
      // drafts. Send the visitor to the store's own origin instead; path mode
      // stays only where there are no subdomains (local development).
      if (tenantSlug && !ROOT_IS_LOCAL) {
        if (!SUBDOMAIN_SLUG.test(tenantSlug)) return new NextResponse(null, { status: 404 });
        const rest = url.pathname.slice(`/s/${tenantSlug}`.length) || "/";
        return NextResponse.redirect(`https://${tenantSlug.toLowerCase()}.${ROOT_DOMAIN}${rest}${url.search}`, 308);
      }
      if (tenantSlug) {
        const requestHeaders = new Headers(request.headers);
        requestHeaders.set("x-store-base", `/s/${tenantSlug}`);
        requestHeaders.set(STORE_PATH_HEADER, storePath);
        requestHeaders.set(QUIET_VIEW_HEADER, quietFlag(request));
        const response = NextResponse.next({ request: { headers: requestHeaders } });
        ensureVisitorCookie(request, response);
        ensureFirstSeenCookie(request, response);
        ensureTrafficSourceCookie(request, response);
        recordAdAttributionCookie(request, response);
        ensureMetaCookies(request, response);
        return response;
      }
    }
    // The root domain's home is Fermi's landing page, /features its full
    // features page, and /pricing the landing page's pricing section.
    if (url.pathname === "/") {
      url.pathname = LANDING_PAGE;
      return NextResponse.rewrite(url);
    }
    if (url.pathname === "/features") {
      url.pathname = FEATURES_PAGE;
      return NextResponse.rewrite(url);
    }
    if (url.pathname === "/pricing") {
      url.pathname = "/";
      url.hash = "pricing";
      return NextResponse.redirect(url, 307);
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
  requestHeaders.set(QUIET_VIEW_HEADER, quietFlag(request));
  const response = NextResponse.rewrite(url, { request: { headers: requestHeaders } });
  ensureVisitorCookie(request, response);
  ensureFirstSeenCookie(request, response);
  ensureTrafficSourceCookie(request, response);
  recordAdAttributionCookie(request, response);
  ensureMetaCookies(request, response);
  return response;
}

export const config = {
  // `_vercel` = Web Analytics / Speed Insights endpoints; the tenant rewrite
  // below would send them to /s/[tenant]/_vercel/... and lose every page view.
  matcher: ["/((?!_next/static|_next/image|_vercel|favicon.ico).*)"],
};
