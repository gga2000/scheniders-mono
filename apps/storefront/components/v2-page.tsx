import type { ReactNode } from "react";
import { cookies, headers } from "next/headers";
import { RenderPage, toSectionTenant } from "@scheniders/sections";
import {
  assignAbArm,
  evaluateSegments,
  resolveVisitorLocale,
  LOCALE_COOKIE,
  listArticleSummaries,
} from "@scheniders/shared";
import { StorefrontGlobals } from "./storefront-globals";
import { ExperimentBeacon } from "./experiment-beacon";
import { CartSignal } from "./cart-signal";
import { FunnelBeacon } from "./funnel-beacon";
import { SectionReveal } from "./section-reveal";
import { isDraftViewRequest } from "@/lib/draft-view";
import type {
  StoreConfigV2,
  PageConfig,
  RuntimeContext,
  SegmentEvalContext,
} from "@scheniders/shared";
import type { SectionRenderContext } from "@scheniders/sections";

/** Renders a v2 page body wrapped by the global promo/header (top) and footer
 *  (bottom). Caller resolves the page via pickV2Page and builds runtime + renderCtx.
 *
 *  This is an async server component so it can read visitor cookies and compute:
 *  - per-visitor A/B arm assignments (assignAbArm)
 *  - audience segment membership (evaluateSegments)
 *
 *  Signals collected from cookies:
 *  - sb_first: first-visit timestamp (middleware-set); absence = new visitor
 *  - sb_ordered: set on first order — has_ordered_before signal
 *  - sb_src: first-touch traffic source
 *  - sb_cart: cart total + timestamp, written client-side by <CartSignal>
 *  - sb_gov: governorate from last placed order (set by checkout orders route)
 *  - breakpoint: from runtime context
 *
 *  `lead` renders between the header chrome and the page body, with the
 *  locale-resolved runtime — for route-owned content that is not a section
 *  (the catalogue page's h1, the 404 fallback copy). */
export async function V2Page({
  v2,
  page,
  runtime,
  renderCtx,
  lead,
}: {
  v2: StoreConfigV2;
  page: PageConfig;
  runtime: RuntimeContext;
  renderCtx: Omit<SectionRenderContext, "runtime">;
  lead?: (runtime: RuntimeContext) => ReactNode;
}) {
  const c = await cookies();

  // Read the stable visitor key written by middleware. Falls back to "anon"
  // when the cookie is absent (e.g. bot traffic that bypassed the middleware
  // path, or a direct server render without cookies).
  const visitorKey = c.get("sb_vid")?.value ?? "anon";

  // Compute arm assignments for every running experiment in one pass.
  const abArms: Record<string, string> = {};
  for (const exp of v2.experiments ?? []) {
    const arm = assignAbArm(exp, visitorKey);
    if (arm) abArms[exp.id] = arm;
  }
  // A draft-view session still renders its assigned arm (the merchant sees
  // what a shopper would) but never records an exposure, so previewing does
  // not skew the experiment's results. `renderCtx.tenant` is typed as the
  // sections' tenant, which has no `is_draft_view`, so re-check the same
  // gate `withDraftView` used rather than widening that shared type.
  const draftView = await isDraftViewRequest(renderCtx.tenant.id);

  // Build the segment evaluation context from cookies set by middleware.
  // sb_first is set only on second+ visits (response-only on first visit),
  // so its absence → new visitor (is_returning = false).
  const firstRaw = c.get("sb_first")?.value;
  const isReturning = Boolean(firstRaw);
  const minutesSinceFirst = firstRaw
    ? Math.max(0, Math.floor((Date.now() - Number(firstRaw)) / 60000))
    : 0;
  const trafficSource = c.get("sb_src")?.value as
    | SegmentEvalContext["traffic_source"]
    | undefined;

  // cart signal (written client-side by <CartSignal>)
  let cartTotal = 0;
  let minutesSinceCart = Number.POSITIVE_INFINITY;
  const cartRaw = c.get("sb_cart")?.value;
  if (cartRaw) {
    try {
      const parsed = JSON.parse(decodeURIComponent(cartRaw)) as {
        total?: number;
        ts?: number;
      };
      if (typeof parsed.total === "number") cartTotal = parsed.total;
      if (typeof parsed.ts === "number")
        minutesSinceCart = Math.max(
          0,
          Math.floor((Date.now() - parsed.ts) / 60000),
        );
    } catch {
      /* malformed cookie — ignore, keep defaults */
    }
  }
  const govRaw = c.get("sb_gov")?.value;

  const segmentCtx: SegmentEvalContext = {
    minutes_since_first_visit: minutesSinceFirst,
    is_returning: isReturning,
    has_ordered_before: Boolean(c.get("sb_ordered")?.value),
    cart_total_iqd: cartTotal,
    minutes_since_cart_activity: minutesSinceCart,
    traffic_source: trafficSource,
    ...(govRaw
      ? { governorate: govRaw as SegmentEvalContext["governorate"] }
      : {}),
    breakpoint: runtime.breakpoint,
  };

  const audienceSegments = evaluateSegments(v2.segments ?? [], segmentCtx);

  // Sections only ever see the pruned tenant. `renderCtx.tenant` arrives as
  // the full storefront row (store_config, store_config_v2, draft…); every
  // client section's `ctx` is serialised into the RSC payload, so handing it
  // the whole row would ship the entire page tree to the browser on every
  // request. `toSectionTenant` keeps exactly the fields sections read.
  const sectionCtx: Omit<SectionRenderContext, "runtime"> = {
    ...renderCtx,
    tenant: toSectionTenant(renderCtx.tenant),
    // Published guides, resolved once here rather than at each of the ~19
    // routes. Summaries only, for the same reason the tenant is pruned: a
    // guides list must not serialise the section tree of every guide it
    // links to into the payload of the page doing the listing.
    articles: listArticleSummaries(v2.custom_pages, { now: new Date() }),
  };

  // EC13: resolve the locale to actually render for THIS visitor — explicit
  // switcher cookie, else Accept-Language, else the store default — constrained
  // to the store's enabled_locales. The page passed `runtime.locale` (the store
  // default) as the floor. Without this, enabled en/ku content is unreachable.
  const resolvedLocale = resolveVisitorLocale({
    enabledLocales: v2.enabled_locales,
    defaultLocale: v2.default_locale ?? runtime.locale,
    cookieLocale: c.get(LOCALE_COOKIE)?.value,
    acceptLanguage: (await headers()).get("accept-language"),
  });

  const enrichedRuntime: RuntimeContext = {
    ...runtime,
    locale: resolvedLocale,
    ab_test_arms: abArms,
    audience_segments: audienceSegments,
    // The remembered governorate (sb_gov cookie, set at checkout) is the only
    // prefill the COD forms use — the select otherwise starts empty so a
    // shopper outside Baghdad can't submit with the wrong fee by default.
    ...(govRaw ? { governorate: govRaw as RuntimeContext["governorate"] } : {}),
  };

  return (
    <>
      <CartSignal />
      <FunnelBeacon
        tenantId={renderCtx.tenant.id}
        pageId={String(runtime.page_id)}
        productId={runtime.product_id}
      />
      <SectionReveal />
      {Object.keys(abArms).length > 0 && !draftView && (
        <ExperimentBeacon tenantId={renderCtx.tenant.id} arms={abArms} />
      )}
      <StorefrontGlobals
        globals={v2.globals}
        runtime={enrichedRuntime}
        renderCtx={sectionCtx}
        slots={["promo_bar", "header"]}
      />
      {lead ? lead(enrichedRuntime) : null}
      <RenderPage page={page} runtime={enrichedRuntime} renderCtx={sectionCtx} />
      <StorefrontGlobals
        globals={v2.globals}
        runtime={enrichedRuntime}
        renderCtx={sectionCtx}
        slots={["footer"]}
      />
      {/* Sticky bottom bar — fixed-position, so DOM order after the footer is
          fine. Renders only when a tenant configures the slot; page-specific
          sticky CTAs (PDP add-to-cart, category ORDER NOW) live in their own
          sections. */}
      <StorefrontGlobals
        globals={v2.globals}
        runtime={enrichedRuntime}
        renderCtx={sectionCtx}
        slots={["sticky_bottom_bar"]}
      />
    </>
  );
}
