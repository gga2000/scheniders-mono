// =====================================================================
// <RenderSection /> + <RenderPage />
// =====================================================================
// Bridges store-config-v2 instances and the section registry. The
// resolver in `@scheniders/shared` applies variants to produce a flat
// props object, then we validate that object against the section's Zod
// schema. Failures degrade silently in production (so a misconfigured
// instance never blows up the storefront) and log a warning in dev.
// =====================================================================

"use client";

import * as React from "react";
import { isSectionEnabled, resolveSection } from "@scheniders/shared";
import type {
  PageConfig,
  RuntimeContext,
  SectionInstance,
} from "@scheniders/shared";
import { getSection } from "./_registry";
import { EAGER_SECTION_COUNT, LazySection } from "./_lazy-section";
import type { SectionRenderContext } from "./_types";
// Side-effect imports: register every built-in section in this module's
// graph. Without this, when RenderSection is bundled as a client component,
// the registry it sees is empty even though the server-component barrel
// would have registered them in its own graph.
import "./hero_image";
import "./trust_strip";
import "./product_grid";
import "./faq_accordion";
import "./newsletter_inline";
import "./hero_split";
import "./hero_marquee";
import "./hero_video";
import "./about_block";
import "./brand_story";
import "./founder_note";
import "./press_quotes";
import "./testimonials_carousel";
import "./image_gallery";
import "./video_block";
import "./marquee_strip";
import "./announcement_bar";
import "./promo_banner";
import "./countdown_card";
import "./free_gift_strip";
import "./delivery_promise";
import "./cta_banner";
import "./pdp_gallery";
import "./pdp_buy_box";
import "./pdp_info_block";
import "./pdp_info_tabs";
import "./pdp_variants";
import "./pdp_add_to_cart";
import "./pdp_related_products";
import "./product_reviews";
import "./product_bundles";
import "./cart_line_items";
import "./cart_summary";
import "./checkout_form";
import "./checkout_order_summary";
import "./track_order_lookup";
import "./order_tracker";
import "./category_grid";
import "./feature_grid";
import "./numbers_stat_strip";
import "./instagram_grid";
import "./accordion_richtext";
import "./html_embed";
import "./logo_strip";
import "./search_results_grid";
import "./policy_content";
import "./exit_intent_offer";
import "./sticky_cta_bar";
import "./site_header";
import "./site_footer";
import "./hero_card_float";
import "./trust_badge_row";
import "./category_spotlight_pair";
import "./collection_trio";
import "./testimonial_cards";
import "./pillars_grid";
import "./about_spotlight";
import "./faq_contact_split";
import "./countdown_announcement";
import "./pdp_direct_order";

/**
 * Surface a silently-dropped section. In dev we warn to the console (as
 * before); in prod we report to Sentry IF the host app has put it on the
 * global — sections is a framework-neutral shared lib, so we avoid a hard
 * `@sentry/*` dependency. Behavior is otherwise unchanged: the caller still
 * degrades to `null`.
 */
function reportSectionDrop(
  reason: "unknown_type" | "schema_invalid" | "render_error",
  type: string,
  detail?: unknown,
): void {
  if (process.env.NODE_ENV !== "production") {
    // eslint-disable-next-line no-console
    console.warn(`[sections] dropped "${type}": ${reason}`, detail ?? "");
    return;
  }
  const sentry = (
    globalThis as {
      Sentry?: { captureMessage?: (m: string, c?: unknown) => void };
    }
  ).Sentry;
  sentry?.captureMessage?.(`section_dropped:${reason}`, {
    level: "warning",
    extra: { type, detail },
  });
}

/**
 * Per-section error boundary (EC10). A runtime throw inside ONE section
 * component (a null deref, a bad `new URL()`, a non-allowlisted next/image
 * host, a hook error) must NOT take down the whole page — without this it
 * propagates to the route-level error.tsx and white-screens header + footer +
 * every other valid section. On error we drop just this section (render null)
 * and report it via the same path as a schema-invalid degrade.
 */
class SectionErrorBoundary extends React.Component<
  { children: React.ReactNode; onError: () => void },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }
  componentDidCatch(): void {
    this.props.onError();
  }
  render(): React.ReactNode {
    return this.state.hasError ? null : this.props.children;
  }
}

interface RenderSectionProps {
  instance: SectionInstance;
  runtime: RuntimeContext;
  renderCtx: Omit<SectionRenderContext, "runtime">;
}

function RenderSectionImpl({
  instance,
  runtime,
  renderCtx,
}: RenderSectionProps) {
  const def = getSection(instance.type);
  if (!def) {
    reportSectionDrop("unknown_type", instance.type);
    return null;
  }

  const resolved = resolveSection<Record<string, unknown>>(instance, runtime);
  const parsed = def.schema.safeParse(resolved);
  if (!parsed.success) {
    reportSectionDrop("schema_invalid", instance.type, parsed.error.format());
    return null;
  }

  const Render = def.render as React.ComponentType<{
    props: unknown;
    ctx: SectionRenderContext;
  }>;
  const wrapperStyle: React.CSSProperties = { position: "relative" };
  if (instance.spacing) {
    if (typeof instance.spacing.top_px === "number") {
      wrapperStyle.marginTop = `${instance.spacing.top_px}px`;
    }
    if (typeof instance.spacing.bottom_px === "number") {
      wrapperStyle.marginBottom = `${instance.spacing.bottom_px}px`;
    }
  }
  return (
    <div
      className="schn-section"
      data-section-id={instance.id}
      data-section-type={instance.type}
      data-section-enabled={instance.enabled ? "true" : "false"}
      data-section-overlay={def.overlay ? "true" : undefined}
      style={wrapperStyle}
    >
      <SectionErrorBoundary
        onError={() => reportSectionDrop("render_error", instance.type)}
      >
        <Render props={parsed.data} ctx={{ ...renderCtx, runtime }} />
      </SectionErrorBoundary>
    </div>
  );
}

/**
 * EC27: memoized. A re-render of RenderPage — e.g. one keystroke in the editor
 * LivePreview, which produces a new `pages` array — would otherwise re-run
 * `resolveSection` + the Zod `safeParse` for EVERY section. With shallow prop
 * memoization, only the section whose `instance` ref actually changed re-runs;
 * unchanged sections (stable `instance`/`runtime`/`renderCtx` refs) skip. Harm-
 * less on the storefront, which renders each section once per request anyway.
 */
export const RenderSection = React.memo(RenderSectionImpl);

/**
 * Pre-render height estimates (px) for `content-visibility` reservation,
 * keyed by section type. Only the FIRST paint uses these — `contain-intrinsic-
 * size: auto` then remembers each section's real height. Rough is fine; the
 * goal is a believable initial scrollbar (no phantom void, no big jump).
 */
const SECTION_INTRINSIC_PX: Record<string, number> = {
  product_grid: 1100,
  search_results_grid: 1100,
  pdp_related_products: 700,
  image_gallery: 620,
  instagram_grid: 620,
  category_grid: 520,
  delivery_promise: 520,
  faq_accordion: 520,
  feature_grid: 480,
  brand_story: 460,
  testimonials_carousel: 440,
  about_block: 440,
  newsletter_inline: 340,
  cta_banner: 320,
  site_footer: 360,
  trust_strip: 120,
  marquee_strip: 90,
};

function estimateSectionHeight(type: string): number {
  return SECTION_INTRINSIC_PX[type] ?? 600;
}

interface RenderPageProps {
  page: PageConfig;
  runtime: RuntimeContext;
  renderCtx: Omit<SectionRenderContext, "runtime">;
}

export function RenderPage({ page, runtime, renderCtx }: RenderPageProps) {
  // Honour both `enabled` flag and `visibility` rules — sections
  // hidden by either are skipped before render. EC7: tolerate a malformed
  // `sections` (non-array) rather than throwing the whole page.
  const sections = Array.isArray(page?.sections) ? page.sections : [];
  const visible = sections.filter((s) => isSectionEnabled(s, runtime));
  return (
    <>
      {visible.map((s, idx) => {
        const node = (
          <RenderSection
            instance={s}
            runtime={runtime}
            renderCtx={renderCtx}
          />
        );
        // Above-fold sections (first EAGER_SECTION_COUNT) render eagerly
        // so initial paint hits LCP fast. Below-fold sections wrap in a
        // `content-visibility: auto` boundary so the browser can skip
        // their layout/paint cost until they near the viewport. SSR
        // emits the full HTML either way — this is purely a paint-side
        // optimization and keeps SEO crawlers happy.
        // Overlay sections (fixed bars, modals) are never lazy-wrapped:
        // `content-visibility: auto` implies containment, which would turn
        // the wrapper into the containing block for `position: fixed` and
        // pin the overlay inside the section box instead of the viewport.
        if (idx < EAGER_SECTION_COUNT || getSection(s.type)?.overlay) {
          return <div key={s.id}>{node}</div>;
        }
        return (
          <LazySection
            key={s.id}
            sectionId={s.id}
            intrinsicSize={`auto ${estimateSectionHeight(s.type)}px`}
          >
            {node}
          </LazySection>
        );
      })}
    </>
  );
}
