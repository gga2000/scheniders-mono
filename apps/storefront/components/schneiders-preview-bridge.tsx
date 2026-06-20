// =====================================================================
// SchneidersPreviewBridge
// =====================================================================
// Click-to-edit bridge between the storefront `/_preview` iframe and the
// parent editor frame (apps/platform store-builder-v2). When rendered,
// the bridge:
//
//   - intercepts hover + click on any element with a `data-section-id`
//     ancestor, suppresses default link navigation, and forwards a
//     structured `postMessage` to `window.parent`.
//   - announces `ready` on mount and `scrolled` on window scroll.
//   - listens for inbound `schn-editor` messages (`scroll_to_section`,
//     `ping`) and reacts accordingly.
//
// SECURITY NOTE
// -------------
// Origin checks are intentionally permissive in dev (the bridge accepts
// inbound messages from any origin and posts outbound with `"*"`). For
// production, allow-list the parent origin via
// `process.env.NEXT_PUBLIC_PLATFORM_ORIGIN` (e.g.
// "https://platform.scheniders.com") and switch the outbound `"*"` to
// that origin so a hostile parent frame can't impersonate the editor.
//
// Agent J references this component name. Do not rename without
// updating the platform side.
// =====================================================================

"use client";

import { useEffect } from "react";
import {
  isAllowedParentOrigin,
  platformTargetOrigin,
  SAFE_PARENT_ORIGINS,
} from "@/lib/preview-origin";

// Re-exported for back-compat — the allow-list now lives in lib/preview-origin.
export { SAFE_PARENT_ORIGINS };

/* ─────────────────────────────────────────────────────────────────── */
/* Message types                                                       */
/* ─────────────────────────────────────────────────────────────────── */

export type PreviewOutboundMessage =
  | { source: "schn-preview"; type: "ready"; url: string }
  | { source: "schn-preview"; type: "scrolled"; y: number }
  | {
      source: "schn-preview";
      type: "section_hovered";
      section_id: string;
      rect: DOMRectInit;
    }
  | { source: "schn-preview"; type: "section_unhovered" }
  | {
      source: "schn-preview";
      type: "section_clicked";
      section_id: string;
      section_type: string;
      rect: DOMRectInit;
    }
  | {
      source: "schn-preview";
      type: "rect_update";
      section_id: string;
      rect: DOMRectInit | null;
    }
  | { source: "schn-preview"; type: "pong" };

export type PreviewInboundMessage =
  | { source: "schn-editor"; type: "scroll_to_section"; section_id: string }
  | { source: "schn-editor"; type: "request_rect"; section_id: string }
  | { source: "schn-editor"; type: "ping" }
  // Live-render messages — consumed by `SchneidersPreviewLiveRenderer`,
  // which installs its own `message` listener. Declared here for contract
  // completeness; the bridge itself falls through to `default` for these.
  | { source: "schn-editor"; type: "page_config_update"; payload: unknown }
  | { source: "schn-editor"; type: "runtime_update"; payload: unknown }
  | { source: "schn-editor"; type: "page_id_change"; next_url: string };

/**
 * Serialize a DOMRect to a plain object. `DOMRect.toJSON` exists in
 * browsers but is missing from jsdom, so we hand-roll a stable shape.
 */
function rectToJSON(r: DOMRect): DOMRectInit {
  return {
    x: r.x,
    y: r.y,
    width: r.width,
    height: r.height,
  };
}

/** Escape a string for use inside an attribute-value CSS selector. */
function cssEscape(s: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(s);
  }
  // jsdom (and old browsers) — escape backslash, quote, and control chars.
  return s.replace(/["\\]/g, "\\$&");
}

/**
 * Walks up the DOM until it finds an element with `data-section-id`.
 * Returns null if no section ancestor exists (e.g. click on header/footer).
 */
function findSection(el: EventTarget | null): HTMLElement | null {
  let cur = el as HTMLElement | null;
  while (cur && cur !== document.body) {
    if (cur.dataset?.sectionId) return cur;
    cur = cur.parentElement;
  }
  return null;
}

export function SchneidersPreviewBridge(): null {
  useEffect(() => {
    if (typeof window === "undefined") return;
    // Only bridge when actually loaded in an iframe.
    if (window.parent === window) return;

    const post = (msg: PreviewOutboundMessage): void => {
      try {
        // EC25: locked to the platform origin in prod so section data can't
        // leak to a hostile embedder ("*" only in dev).
        window.parent.postMessage(msg, platformTargetOrigin());
      } catch {
        /* cross-origin best-effort */
      }
    };

    /* ───── Outbound: clicks ───── */

    function onClickCapture(e: MouseEvent): void {
      const section = findSection(e.target);
      if (!section || !section.dataset.sectionId) return;
      // Suppress navigation only when ctrl/cmd not held — power users can
      // still cmd-click to open links in a new tab for genuine browsing.
      if (!e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        e.stopPropagation();
      }
      post({
        source: "schn-preview",
        type: "section_clicked",
        section_id: section.dataset.sectionId,
        section_type: section.dataset.sectionType ?? "",
        rect: rectToJSON(section.getBoundingClientRect()),
      });
    }

    /* ───── Outbound: hover ───── */

    function onMouseOver(e: MouseEvent): void {
      const section = findSection(e.target);
      if (!section || !section.dataset.sectionId) return;
      post({
        source: "schn-preview",
        type: "section_hovered",
        section_id: section.dataset.sectionId,
        rect: rectToJSON(section.getBoundingClientRect()),
      });
    }

    function onMouseLeave(): void {
      post({ source: "schn-preview", type: "section_unhovered" });
    }

    /* ───── Outbound: ready + scroll ───── */

    post({
      source: "schn-preview",
      type: "ready",
      url: window.location.href,
    });

    function onScroll(): void {
      post({
        source: "schn-preview",
        type: "scrolled",
        y: window.scrollY,
      });
    }

    /* ───── Inbound: editor → preview ───── */

    function onMessage(e: MessageEvent): void {
      // EC25: only the trusted editor origin may drive the bridge — otherwise a
      // hostile frame could scroll the preview or exfiltrate section rects.
      if (!isAllowedParentOrigin(e.origin)) return;
      const data = e.data as PreviewInboundMessage | null | undefined;
      if (!data || data.source !== "schn-editor") return;
      switch (data.type) {
        case "scroll_to_section": {
          const id = data.section_id;
          if (!id) return;
          const node = document.querySelector(
            `[data-section-id="${cssEscape(id)}"]`,
          );
          if (node instanceof HTMLElement) {
            node.scrollIntoView({ behavior: "smooth", block: "center" });
          }
          break;
        }
        case "request_rect": {
          const id = data.section_id;
          if (!id) return;
          const node = document.querySelector(
            `[data-section-id="${cssEscape(id)}"]`,
          );
          if (node instanceof HTMLElement) {
            post({
              source: "schn-preview",
              type: "rect_update",
              section_id: id,
              rect: rectToJSON(node.getBoundingClientRect()),
            });
          } else {
            post({
              source: "schn-preview",
              type: "rect_update",
              section_id: id,
              rect: null,
            });
          }
          break;
        }
        case "ping":
          post({ source: "schn-preview", type: "pong" });
          break;
        default: {
          /* unknown — ignore */
        }
      }
    }

    document.addEventListener("click", onClickCapture, true);
    document.addEventListener("mouseover", onMouseOver, true);
    document.addEventListener("mouseleave", onMouseLeave, true);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("message", onMessage);

    return () => {
      document.removeEventListener("click", onClickCapture, true);
      document.removeEventListener("mouseover", onMouseOver, true);
      document.removeEventListener("mouseleave", onMouseLeave, true);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("message", onMessage);
    };
  }, []);

  return null;
}
