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

/**
 * Surface a silently-dropped section. In dev we warn to the console (as
 * before); in prod we report to Sentry IF the host app has put it on the
 * global — sections is a framework-neutral shared lib, so we avoid a hard
 * `@sentry/*` dependency. Behavior is otherwise unchanged: the caller still
 * degrades to `null`.
 */
function reportSectionDrop(
  reason: "unknown_type" | "schema_invalid",
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

interface RenderSectionProps {
  instance: SectionInstance;
  runtime: RuntimeContext;
  renderCtx: Omit<SectionRenderContext, "runtime">;
}

export function RenderSection({
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
      style={wrapperStyle}
    >
      <Render props={parsed.data} ctx={{ ...renderCtx, runtime }} />
    </div>
  );
}

interface RenderPageProps {
  page: PageConfig;
  runtime: RuntimeContext;
  renderCtx: Omit<SectionRenderContext, "runtime">;
}

export function RenderPage({ page, runtime, renderCtx }: RenderPageProps) {
  // Honour both `enabled` flag and `visibility` rules — sections
  // hidden by either are skipped before render.
  const visible = page.sections.filter((s) => isSectionEnabled(s, runtime));
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
        if (idx < EAGER_SECTION_COUNT) {
          return <div key={s.id}>{node}</div>;
        }
        return (
          <LazySection key={s.id} sectionId={s.id}>
            {node}
          </LazySection>
        );
      })}
    </>
  );
}
