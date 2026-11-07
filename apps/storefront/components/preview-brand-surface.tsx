"use client";

// Editor preview ground: applies the brand kit (colours, fonts, shape,
// motion) to the page surface and keeps it in step with the editor. The
// server renders the saved draft's kit; a `brand_kit_update` message from
// the editor swaps in the merchant's current kit, so a colour or font change
// shows at once instead of only after the draft saves and the frame reloads.

import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { buildBrandKitFontsUrl, buildBrandKitVars } from "@scheniders/shared";
import type { BrandKit, LocaleCode } from "@scheniders/shared";
import { isAllowedParentOrigin } from "@/lib/preview-origin";

export interface PreviewBrandSurfaceProps {
  initialBrandKit: BrandKit;
  locale: LocaleCode;
  /** data-* attributes the editor and tests read off the surface. */
  dataAttrs: Record<`data-${string}`, string>;
  children: ReactNode;
}

function isBrandKit(value: unknown): value is BrandKit {
  if (!value || typeof value !== "object") return false;
  const kit = value as Partial<BrandKit>;
  return typeof kit.colors === "object" && kit.colors !== null;
}

export function PreviewBrandSurface({
  initialBrandKit,
  locale,
  dataAttrs,
  children,
}: PreviewBrandSurfaceProps): React.ReactElement {
  const [kit, setKit] = useState<BrandKit>(initialBrandKit);

  useEffect(() => {
    if (window.parent === window) return;
    function onMessage(e: MessageEvent): void {
      if (!isAllowedParentOrigin(e.origin)) return;
      const data = e.data as { source?: string; type?: string; payload?: unknown } | null;
      if (!data || data.source !== "schn-editor" || data.type !== "brand_kit_update") return;
      const next = data.payload;
      if (!isBrandKit(next)) return;
      // The editor re-sends on every reconnect; skip identical kits.
      setKit((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const style = useMemo<CSSProperties>(
    () => ({
      ...buildBrandKitVars(kit, { locale }),
      // The vars only declare custom properties; the page ground must read
      // them or a dark kit renders onto white gaps between sections.
      backgroundColor: "var(--bk-surface, #fff7ed)",
      color: "var(--bk-ink, #1a1a1a)",
      minHeight: "100vh",
    }),
    [kit, locale],
  );
  const fontsUrl = buildBrandKitFontsUrl(kit);

  return (
    <>
      {fontsUrl && <link rel="stylesheet" href={fontsUrl} />}
      <div
        data-preview="true"
        data-bk-motion={kit.motion?.enabled === false ? "reduce" : "auto"}
        {...dataAttrs}
        style={style}
      >
        {children}
      </div>
    </>
  );
}
