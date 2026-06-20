// =====================================================================
// SchneidersPreviewLiveRenderer
// =====================================================================
// Client-side renderer for the `/_preview/[tenant]/[page_id]` route.
// Hydrates with the server-rendered config + runtime, then listens for
// `schn-editor` postMessage updates from the parent (the platform's
// store-builder-v2 editor) and re-renders in place — no iframe reload.
//
// Message contract (inbound from `schn-editor`):
//   { source: "schn-editor", type: "page_config_update", payload: PageConfig }
//   { source: "schn-editor", type: "runtime_update",     payload: RuntimeContext }
//   { source: "schn-editor", type: "page_id_change",     next_url: string }
//
// The bridge (`schneiders-preview-bridge.tsx`) also installs a `message`
// listener — both coexist on `window`. Each filters by `data.source` so
// they don't see each other's messages.
//
// Pairs with the editor side in:
//   apps/platform/components/store-builder-v2/editor-shell.tsx
//   apps/platform/hooks/use-iframe-bridge.ts
// =====================================================================

"use client";

import { useEffect, useState } from "react";
import type {
  PageConfig,
  RuntimeContext,
} from "@scheniders/shared";
import { RenderSection } from "@scheniders/sections";
import type { SectionRenderContext } from "@scheniders/sections";
import { isAllowedParentOrigin, isSafePreviewNavUrl } from "@/lib/preview-origin";

export interface SchneidersPreviewLiveRendererProps {
  /** Server-rendered initial config (used until the parent sends an update). */
  initialPageConfig: PageConfig;
  /** Runtime context derived server-side. */
  initialRuntime: RuntimeContext;
  /** Render context (tenant, products, categories — passed verbatim from server). */
  renderCtx: Omit<SectionRenderContext, "runtime">;
}

/**
 * `RuntimeContext.now` is typed as `Date`, but postMessage clones via
 * structured-clone which preserves Date — however when an editor posts a
 * plain object, `now` may arrive as an ISO string. Coerce defensively so
 * downstream code that treats it as a Date doesn't blow up.
 */
function coerceRuntime(input: unknown): RuntimeContext | null {
  if (!input || typeof input !== "object") return null;
  const r = input as Partial<RuntimeContext> & { now?: unknown };
  const now = r.now instanceof Date
    ? r.now
    : typeof r.now === "string" || typeof r.now === "number"
      ? new Date(r.now)
      : new Date();
  return {
    page_id: r.page_id ?? "home",
    breakpoint: r.breakpoint ?? "desktop",
    locale: r.locale ?? "en",
    audience_segments: Array.isArray(r.audience_segments) ? r.audience_segments : [],
    ab_test_arms: r.ab_test_arms ?? {},
    governorate: r.governorate,
    product_id: r.product_id,
    category_id: r.category_id,
    now,
  };
}

function coercePageConfig(input: unknown): PageConfig | null {
  if (!input || typeof input !== "object") return null;
  const p = input as Partial<PageConfig>;
  if (!p.page_id || !Array.isArray(p.sections)) return null;
  return p as PageConfig;
}

export function SchneidersPreviewLiveRenderer({
  initialPageConfig,
  initialRuntime,
  renderCtx,
}: SchneidersPreviewLiveRendererProps): React.ReactElement {
  const [pageConfig, setPageConfig] = useState<PageConfig>(initialPageConfig);
  const [runtime, setRuntime] = useState<RuntimeContext>(initialRuntime);

  useEffect(() => {
    if (typeof window === "undefined") return;
    // Only listen when actually loaded inside an iframe. When opened
    // directly for smoke testing the live path is irrelevant.
    if (window.parent === window) return;

    function onMessage(e: MessageEvent): void {
      // EC25: only the trusted editor origin may push config/runtime/navigation
      // into the preview — without this any frame could replace the page config
      // or navigate the iframe via page_id_change.
      if (!isAllowedParentOrigin(e.origin)) return;
      const data = e.data as
        | { source?: string; type?: string; payload?: unknown; next_url?: string }
        | null
        | undefined;
      if (!data || data.source !== "schn-editor") return;
      switch (data.type) {
        case "page_config_update": {
          const next = coercePageConfig(data.payload);
          if (next) setPageConfig(next);
          break;
        }
        case "runtime_update": {
          const next = coerceRuntime(data.payload);
          if (next) setRuntime(next);
          break;
        }
        case "page_id_change": {
          // Parent switched to a different page — the iframe needs to
          // re-fetch server data (products / category / etc.), so we do
          // a full navigation. After reload, the bridge re-establishes
          // and the live render takes over again.
          // EC25: only navigate to a same-origin /_preview/ URL — never an
          // arbitrary attacker-supplied target.
          const url = typeof data.next_url === "string" ? data.next_url : null;
          if (url && isSafePreviewNavUrl(url)) window.location.replace(url);
          break;
        }
        default: {
          /* unknown — ignore (the bridge handles its own message types) */
        }
      }
    }

    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("message", onMessage);
    };
  }, []);

  return (
    <>
      {pageConfig.sections
        .filter((s) => s.enabled)
        .map((instance) => (
          <RenderSection
            key={instance.id}
            instance={instance}
            runtime={runtime}
            renderCtx={renderCtx}
          />
        ))}
    </>
  );
}
