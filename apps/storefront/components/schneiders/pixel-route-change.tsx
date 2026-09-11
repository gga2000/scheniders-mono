"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { trackPageView } from "@scheniders/sections/helpers/pixels";

/**
 * Re-fires the marketing pixels' PageView on client-side navigation (P2-29).
 *
 * The inline pixel scripts (`analytics-pixels.tsx`) send the first PageView
 * / `ttq.page()` on document load, which is fine for a full navigation but
 * misses every App Router transition after it (PDP → cart → checkout all
 * looked like one page to Meta / TikTok). This component watches the
 * pathname and fires once per change — never for the initial render, so
 * the load is not double-counted. Search params are ignored on purpose:
 * `?page=2` on a category is the same page to the ad platforms, and
 * `useSearchParams` would force a Suspense boundary on the whole layout.
 *
 * Only mounted when at least one direct pixel is configured; the helper
 * itself is a no-op for any pixel whose global was not initialised.
 */
export function PixelRouteChange() {
  const pathname = usePathname();
  const lastPathname = useRef<string | null>(null);

  useEffect(() => {
    if (lastPathname.current === null) {
      // Initial mount — the inline script already fired this PageView.
      lastPathname.current = pathname;
      return;
    }
    if (lastPathname.current === pathname) return;
    lastPathname.current = pathname;
    trackPageView();
  }, [pathname]);

  return null;
}
