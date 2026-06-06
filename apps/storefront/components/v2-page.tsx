import { cookies } from "next/headers";
import { RenderPage } from "@scheniders/sections";
import { assignAbArm, evaluateSegments } from "@scheniders/shared";
import { StorefrontGlobals } from "./storefront-globals";
import { ExperimentBeacon } from "./experiment-beacon";
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
 *  Signals collected from cookies: first_visit / returning_visitor,
 *  has_ordered_before, traffic_source (first-touch UTM), and breakpoint.
 *
 *  NOTE — not yet collected (documented follow-up):
 *  - cart_total_iqd / abandoned_cart: cart is client-side state; not available
 *    at SSR. Those rule kinds will never match until a client-driven signal is
 *    relayed (e.g. via a cookie written by the cart hook).
 *  - governorate: geo-IP lookup not yet wired. Those rules never match either. */
export async function V2Page({
  v2,
  page,
  runtime,
  renderCtx,
}: {
  v2: StoreConfigV2;
  page: PageConfig;
  runtime: RuntimeContext;
  renderCtx: Omit<SectionRenderContext, "runtime">;
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

  const segmentCtx: SegmentEvalContext = {
    minutes_since_first_visit: minutesSinceFirst,
    is_returning: isReturning,
    has_ordered_before: Boolean(c.get("sb_ordered")?.value),
    // cart_total_iqd / minutes_since_cart_activity: cart is client-side state
    // and not known at SSR time. cart_total and abandoned_cart rule kinds will
    // never match until a client-written cookie is added (follow-up).
    cart_total_iqd: 0,
    minutes_since_cart_activity: Number.POSITIVE_INFINITY,
    traffic_source: trafficSource,
    // governorate: geo-IP not yet wired; governorate rules never match (follow-up).
    breakpoint: runtime.breakpoint,
  };

  const audienceSegments = evaluateSegments(v2.segments ?? [], segmentCtx);

  const enrichedRuntime: RuntimeContext = {
    ...runtime,
    ab_test_arms: abArms,
    audience_segments: audienceSegments,
  };

  return (
    <>
      {Object.keys(abArms).length > 0 && (
        <ExperimentBeacon tenantId={renderCtx.tenant.id} arms={abArms} />
      )}
      <StorefrontGlobals
        globals={v2.globals}
        runtime={enrichedRuntime}
        renderCtx={renderCtx}
        slots={["promo_bar", "header"]}
      />
      <RenderPage page={page} runtime={enrichedRuntime} renderCtx={renderCtx} />
      <StorefrontGlobals
        globals={v2.globals}
        runtime={enrichedRuntime}
        renderCtx={renderCtx}
        slots={["footer"]}
      />
    </>
  );
}
