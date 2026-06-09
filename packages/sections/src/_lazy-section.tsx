// =====================================================================
// Lazy section boundary
// =====================================================================
// SSR-safe defer for below-fold sections. We keep the markup server-
// rendered (so SEO crawlers + initial paint still get full HTML) but
// add CSS `content-visibility: auto` + `contain-intrinsic-size` so the
// browser can skip layout/paint work for sections still well below the
// fold. That gets us the lazy-paint win without breaking hydration or
// re-mount semantics.
//
// The wrapper is annotated with `data-lazy="true"` so tests + the
// editor can identify deferred sections without sniffing styles.
// =====================================================================

import type { ReactNode } from "react";

interface LazySectionProps {
  children: ReactNode;
  /** Best-guess intrinsic size — keeps scroll position stable while
   *  the section is paint-skipped. Defaults to a tall block. */
  intrinsicSize?: string;
  /** Optional id so external tests can target this boundary. */
  sectionId?: string;
}

export function LazySection({
  children,
  // `auto <length>` lets the browser remember each section's real height
  // after first render; the length is only the pre-render estimate. 1200px
  // badly over-reserved (real sections are ~450px), inflating the scrollbar
  // with a phantom void — callers pass a per-type estimate; 600px fallback.
  intrinsicSize = "auto 600px",
  sectionId,
}: LazySectionProps) {
  return (
    <div
      data-lazy="true"
      data-lazy-for={sectionId}
      style={{
        contentVisibility: "auto",
        containIntrinsicSize: intrinsicSize,
      }}
    >
      {children}
    </div>
  );
}

/** Number of sections rendered eagerly at the top of every page. */
export const EAGER_SECTION_COUNT = 2;
