// =====================================================================
// <RenderSection /> + <RenderPage />
// =====================================================================
// Bridges store-config-v2 instances and the section registry. The
// resolver in `@scheniders/shared` applies variants to produce a flat
// props object, then we validate that object against the section's Zod
// schema. Failures degrade silently in production (so a misconfigured
// instance never blows up the storefront) and log a warning in dev.
//
// This module has NO "use client" directive on purpose: on the storefront
// it runs as a server component, so lookup + resolve + validate happen on
// the server and the 30-odd server-safe sections render there too — none
// of that code ships to the browser. The interactive sections keep their
// own "use client" component modules (`*.client.tsx`); a server component
// rendering a client component is the normal RSC boundary. The same module
// also works when imported from a client component (the editor's live
// preview): it uses nothing server-only (no `next/headers`, no
// `server-only`, no async components).
//
// Registry population is the barrel's job (`index.ts` imports every
// section definition). Import `RenderPage`/`RenderSection` from
// `@scheniders/sections`, not from this file, so the registry your
// module graph sees is populated.
// =====================================================================

import * as React from "react";
import { isSectionEnabled, resolveSection } from "@scheniders/shared";
import type {
  PageConfig,
  RuntimeContext,
  SectionInstance,
} from "@scheniders/shared";
import { getSection } from "./_registry";
import { EAGER_SECTION_COUNT, LazySection } from "./_lazy-section";
import { reportSectionDrop } from "./_report";
import { SectionErrorBoundary } from "./_section-error-boundary";
import type { SectionRenderContext } from "./_types";

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
  // Chrome that anchors to the viewport needs the sticky on the wrapper —
  // see SectionDefinition.stickyWrapper for why the inner element cannot
  // hold it. Everything else keeps the plain relative box.
  const stickyChrome = def.stickyWrapper?.(parsed.data) === true;
  const wrapperStyle: React.CSSProperties = stickyChrome
    ? { position: "sticky", top: 0, zIndex: 40 }
    : { position: "relative" };
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
      data-section-chrome={stickyChrome ? "true" : undefined}
      style={wrapperStyle}
    >
      <SectionErrorBoundary sectionType={instance.type}>
        <Render props={parsed.data} ctx={{ ...renderCtx, runtime }} />
      </SectionErrorBoundary>
    </div>
  );
}

/**
 * EC27: memoized for the client-side caller. A re-render of the editor's
 * live preview — one keystroke produces a new `pages` array — would
 * otherwise re-run `resolveSection` + the Zod `safeParse` for EVERY
 * section. With shallow prop memoization, only the section whose
 * `instance` ref actually changed re-runs; unchanged sections (stable
 * `instance`/`runtime`/`renderCtx` refs) skip. On the storefront this runs
 * as a server component, where `memo` is a no-op: each section renders
 * once per request anyway.
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
