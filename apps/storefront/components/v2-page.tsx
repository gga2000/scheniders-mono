import { cookies } from "next/headers";
import { RenderPage } from "@scheniders/sections";
import { assignAbArm } from "@scheniders/shared";
import { StorefrontGlobals } from "./storefront-globals";
import type { StoreConfigV2, PageConfig, RuntimeContext } from "@scheniders/shared";
import type { SectionRenderContext } from "@scheniders/sections";

/** Renders a v2 page body wrapped by the global promo/header (top) and footer
 *  (bottom). Caller resolves the page via pickV2Page and builds runtime + renderCtx.
 *
 *  This is an async server component so it can read the visitor-key cookie and
 *  compute per-visitor A/B arm assignments at render time. Time-window / schedule
 *  variants already apply via `runtime.now` (set by the caller).
 *
 *  audience_segments is left empty for now — full segment evaluation requires
 *  visitor signals (device, location, past behaviour) that are not yet available
 *  server-side. That is a separate follow-up. */
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
  // Read the stable visitor key written by middleware. Falls back to "anon"
  // when the cookie is absent (e.g. bot traffic that bypassed the middleware
  // path, or a direct server render without cookies).
  const visitorKey = (await cookies()).get("sb_vid")?.value ?? "anon";

  // Compute arm assignments for every running experiment in one pass.
  const abArms: Record<string, string> = {};
  for (const exp of v2.experiments ?? []) {
    const arm = assignAbArm(exp, visitorKey);
    if (arm) abArms[exp.id] = arm;
  }

  const enrichedRuntime: RuntimeContext = { ...runtime, ab_test_arms: abArms };

  return (
    <>
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
