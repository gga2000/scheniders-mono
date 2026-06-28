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
  // Inline-edit lifecycle — the contenteditable lives inside the iframe, so
  // the editor pauses its config-push between `begin` and `end` (otherwise a
  // re-render would reset the caret) and applies each `commit` to the config.
  | { source: "schn-preview"; type: "inline_edit_begin"; section_id: string }
  | {
      source: "schn-preview";
      type: "inline_edit_commit";
      section_id: string;
      field_path: string;
      value: string;
    }
  | { source: "schn-preview"; type: "inline_edit_end"; reverted: boolean }
  // All section rects in document order — the editor derives insert-`+` gap
  // positions and spacing-drag handles from these.
  | {
      source: "schn-preview";
      type: "all_rects";
      rects: { section_id: string; rect: DOMRectInit }[];
    }
  // Right-click on a section — the editor renders the context menu over the
  // iframe at these iframe-local coords.
  | {
      source: "schn-preview";
      type: "section_context_menu";
      section_id: string;
      x: number;
      y: number;
    }
  | { source: "schn-preview"; type: "pong" };

export type PreviewInboundMessage =
  | { source: "schn-editor"; type: "scroll_to_section"; section_id: string }
  | { source: "schn-editor"; type: "request_rect"; section_id: string }
  | { source: "schn-editor"; type: "ping" }
  // Selection sync — drives the inline-edit affordance (which i18n fields are
  // editable) and the `data-selected-section` attribute the affordance CSS
  // keys off. `null` clears the selection.
  | {
      source: "schn-editor";
      type: "set_selected_section";
      section_id: string | null;
    }
  // Ask for every section's rect (insert gaps + spacing handles).
  | { source: "schn-editor"; type: "request_all_rects" }
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

/** Nearest `[data-i18n-field]` ancestor (the editable text node). */
function findI18nField(
  el: EventTarget | null,
): { el: HTMLElement; field: string } | null {
  const node = (el as HTMLElement | null)?.closest("[data-i18n-field]") as
    | HTMLElement
    | null;
  const field = node?.getAttribute("data-i18n-field");
  if (!node || !field) return null;
  return { el: node, field };
}

/**
 * True when the event target sits inside an interactive control (link,
 * button, input…) that lives BELOW the i18n field — we still allow editing a
 * heading that wraps a link, so only block when the interactive node is a
 * strict descendant of the field.
 */
function isInteractiveDescendant(
  target: EventTarget | null,
  fieldEl: HTMLElement,
): boolean {
  const tgt = target as HTMLElement | null;
  const interactive = tgt?.closest(
    "a, button, input, textarea, select, label, [role='button']",
  ) as HTMLElement | null;
  if (!interactive) return false;
  return fieldEl.contains(interactive) && interactive !== fieldEl;
}

// Click-to-edit affordance: dashed outline on editable text inside the
// selected section. Injected into the iframe document (the live-render route
// doesn't ship it — it was LivePreview-only). `data-selected-section` is set
// by the bridge on the selected section in response to `set_selected_section`.
const INLINE_EDIT_AFFORDANCE_CSS = `
[data-selected-section="true"] [data-i18n-field] {
  cursor: text;
  outline: 1px dashed transparent;
  outline-offset: 2px;
  border-radius: 2px;
  transition: outline-color 120ms ease-out;
}
[data-selected-section="true"] [data-i18n-field]:hover {
  outline-color: var(--bk-primary, #ec4899);
}
[data-selected-section="true"] [data-i18n-field][data-inline-editing="true"] {
  outline: none;
}
`;

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

    /* ───── Selection + inline-edit state ─────
       Kept in closures (not React state) so the listener set is installed
       once and never tears down. Inbound messages mutate these. */
    let selectedSectionId: string | null = null;
    let inlineEdit:
      | { el: HTMLElement; sectionId: string; field: string; original: string }
      | null = null;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let inlineCleanup: (() => void) | null = null;

    // Inject the click-to-edit affordance CSS once (the live-render route
    // doesn't ship it).
    const styleEl = document.createElement("style");
    styleEl.setAttribute("data-schn-inline-edit", "");
    styleEl.textContent = INLINE_EDIT_AFFORDANCE_CSS;
    document.head.appendChild(styleEl);

    const applySelected = (id: string | null): void => {
      document
        .querySelectorAll('[data-selected-section="true"]')
        .forEach((el) => el.removeAttribute("data-selected-section"));
      selectedSectionId = id;
      if (!id) return;
      const node = document.querySelector(
        `[data-section-id="${cssEscape(id)}"]`,
      );
      if (node instanceof HTMLElement) {
        node.setAttribute("data-selected-section", "true");
      }
    };

    const commitInline = (value: string): void => {
      if (!inlineEdit) return;
      post({
        source: "schn-preview",
        type: "inline_edit_commit",
        section_id: inlineEdit.sectionId,
        field_path: inlineEdit.field,
        value,
      });
    };

    const exitInline = (revert: boolean): void => {
      if (!inlineEdit) return;
      if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }
      const { el, original } = inlineEdit;
      if (revert) {
        el.textContent = original;
      } else {
        // Final commit in case the last debounce hadn't fired.
        commitInline(el.textContent ?? "");
      }
      el.removeAttribute("contenteditable");
      el.removeAttribute("data-inline-editing");
      inlineCleanup?.();
      inlineCleanup = null;
      inlineEdit = null;
      post({
        source: "schn-preview",
        type: "inline_edit_end",
        reverted: revert,
      });
    };

    const enterInline = (
      sectionId: string,
      hit: { el: HTMLElement; field: string },
    ): void => {
      if (inlineEdit && inlineEdit.el === hit.el) return;
      if (inlineEdit) exitInline(false);
      const original = hit.el.textContent ?? "";
      hit.el.setAttribute("contenteditable", "true");
      hit.el.setAttribute("data-inline-editing", "true");
      hit.el.focus();
      try {
        const sel = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(hit.el);
        range.collapse(false);
        sel?.removeAllRanges();
        sel?.addRange(range);
      } catch {
        /* selection best-effort */
      }
      inlineEdit = { el: hit.el, sectionId, field: hit.field, original };
      post({
        source: "schn-preview",
        type: "inline_edit_begin",
        section_id: sectionId,
      });

      const onInput = (): void => {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          commitInline(hit.el.textContent ?? "");
        }, 300);
      };
      const onKeyDown = (ev: KeyboardEvent): void => {
        if (ev.key === "Enter" && !ev.shiftKey) {
          ev.preventDefault();
          exitInline(false);
        } else if (ev.key === "Escape") {
          ev.preventDefault();
          exitInline(true);
        }
      };
      const onBlur = (): void => exitInline(false);
      hit.el.addEventListener("input", onInput);
      hit.el.addEventListener("keydown", onKeyDown);
      hit.el.addEventListener("blur", onBlur);
      inlineCleanup = (): void => {
        hit.el.removeEventListener("input", onInput);
        hit.el.removeEventListener("keydown", onKeyDown);
        hit.el.removeEventListener("blur", onBlur);
      };
    };

    /* ───── Outbound: clicks ───── */

    function onClickCapture(e: MouseEvent): void {
      // Clicks inside the active contenteditable manage their own caret.
      if (
        inlineEdit &&
        e.target instanceof Node &&
        inlineEdit.el.contains(e.target)
      ) {
        return;
      }
      const section = findSection(e.target);
      if (!section || !section.dataset.sectionId) return;
      const sectionId = section.dataset.sectionId;
      // Single-click editable text inside the SELECTED section → inline edit.
      if (sectionId === selectedSectionId && !e.metaKey && !e.ctrlKey) {
        const hit = findI18nField(e.target);
        if (hit && !isInteractiveDescendant(e.target, hit.el)) {
          e.preventDefault();
          e.stopPropagation();
          enterInline(sectionId, hit);
          return;
        }
      }
      // Suppress navigation only when ctrl/cmd not held — power users can
      // still cmd-click to open links in a new tab for genuine browsing.
      if (!e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        e.stopPropagation();
      }
      post({
        source: "schn-preview",
        type: "section_clicked",
        section_id: sectionId,
        section_type: section.dataset.sectionType ?? "",
        rect: rectToJSON(section.getBoundingClientRect()),
      });
    }

    /* ───── Outbound: double-click (inline-edit fallback) ───── */

    function onDblClick(e: MouseEvent): void {
      const section = findSection(e.target);
      const sectionId = section?.dataset.sectionId;
      if (!sectionId || sectionId !== selectedSectionId) return;
      const hit = findI18nField(e.target);
      if (!hit || isInteractiveDescendant(e.target, hit.el)) return;
      e.preventDefault();
      e.stopPropagation();
      enterInline(sectionId, hit);
    }

    /* ───── Outbound: right-click → context menu ───── */

    function onContextMenu(e: MouseEvent): void {
      const section = findSection(e.target);
      const sectionId = section?.dataset.sectionId;
      if (!sectionId) return;
      e.preventDefault();
      // iframe-local viewport coords; the editor offsets by the iframe bounds.
      post({
        source: "schn-preview",
        type: "section_context_menu",
        section_id: sectionId,
        x: e.clientX,
        y: e.clientY,
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
        case "set_selected_section": {
          const next = data.section_id ?? null;
          // Switching selection away from an active edit commits it first.
          if (inlineEdit && inlineEdit.sectionId !== next) exitInline(false);
          applySelected(next);
          break;
        }
        case "request_all_rects": {
          const nodes = Array.from(
            document.querySelectorAll("[data-section-id]"),
          ) as HTMLElement[];
          const rects = nodes
            .map((n) => {
              const id = n.dataset.sectionId;
              return id
                ? {
                    section_id: id,
                    rect: rectToJSON(n.getBoundingClientRect()),
                  }
                : null;
            })
            .filter(
              (r): r is { section_id: string; rect: DOMRectInit } =>
                r !== null,
            );
          post({ source: "schn-preview", type: "all_rects", rects });
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
    document.addEventListener("dblclick", onDblClick, true);
    document.addEventListener("contextmenu", onContextMenu, true);
    document.addEventListener("mouseover", onMouseOver, true);
    document.addEventListener("mouseleave", onMouseLeave, true);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("message", onMessage);

    return () => {
      if (inlineEdit) {
        // Leave the DOM clean if we unmount mid-edit.
        inlineEdit.el.removeAttribute("contenteditable");
        inlineEdit.el.removeAttribute("data-inline-editing");
      }
      inlineCleanup?.();
      if (debounceTimer) clearTimeout(debounceTimer);
      styleEl.remove();
      document.removeEventListener("click", onClickCapture, true);
      document.removeEventListener("dblclick", onDblClick, true);
      document.removeEventListener("contextmenu", onContextMenu, true);
      document.removeEventListener("mouseover", onMouseOver, true);
      document.removeEventListener("mouseleave", onMouseLeave, true);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("message", onMessage);
    };
  }, []);

  return null;
}
