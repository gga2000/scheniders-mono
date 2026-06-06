import { cookies } from "next/headers";
import { RenderPage } from "@scheniders/sections";
import { assignAbArm, evaluateSegments } from "@scheniders/shared";
import { StorefrontGlobals } from "./storefront-globals";
import { ExperimentBeacon } from "./experiment-beacon";
import { CartSignal } from "./cart-signal";
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
 *  - breakpoint: from runtime context */
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

  // cart signal (written client-side by <CartSignal>)
  let cartTotal = 0;
  let minutesSinceCart = Number.POSITIVE_INFINITY;
  const cartRaw = c.get("sb_cart")?.value;
  if (cartRaw) {
    try {
      const parsed = JSON.parse(decodeURIComponent(cartRaw)) as { total?: number; ts?: number };
      if (typeof parsed.total === "number") cartTotal = parsed.total;
      if (typeof parsed.ts === "number") minutesSinceCart = Math.max(0, Math.floor((Date.now() - parsed.ts) / 60000));
    } catch { /* malformed cookie — ignore, keep defaults */ }
  }
  const govRaw = c.get("sb_gov")?.value;

  const segmentCtx: SegmentEvalContext = {
    minutes_since_first_visit: minutesSinceFirst,
    is_returning: isReturning,
    has_ordered_before: Boolean(c.get("sb_ordered")?.value),
    cart_total_iqd: cartTotal,
    minutes_since_cart_activity: minutesSinceCart,
    traffic_source: trafficSource,
    ...(govRaw ? { governorate: govRaw as SegmentEvalContext["governorate"] } : {}),
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
      <CartSignal />
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
