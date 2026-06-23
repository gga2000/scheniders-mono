"use client";

// =====================================================================
// useIframeBridge — platform side of the Schneiders preview bridge
// =====================================================================
// Pairs with `apps/storefront/components/schneiders-preview-bridge.tsx`
// (the storefront iframe). Handles inbound `schn-preview` postMessage
// events (ready / scroll / hover / click / pong / rect_update) and
// exposes a typed API for the editor to send `schn-editor` messages
// back into the iframe (scroll_to_section, request_rect, ping).
//
// SECURITY NOTE
// -------------
// Both directions are pinned to the storefront origin (`STOREFRONT_ORIGIN`):
// outbound `postMessage` targets it, and inbound messages from any other
// origin are dropped. This stops a page hosted at the iframe URL from
// impersonating the storefront. Deployed environments MUST set
// `NEXT_PUBLIC_STOREFRONT_ORIGIN`; the dev fallback is the local storefront.
// =====================================================================

import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import type { PageConfig, RuntimeContext } from "@scheniders/shared";

/* ─────────────────────────────────────────────────────────────────── */
/* Trusted storefront origin                                            */
/* ─────────────────────────────────────────────────────────────────── */

// The preview iframe is served by the storefront app (port 3001 in dev).
// In prod this MUST be set to the canonical storefront origin; the dev
// fallback keeps the local preview working.
const STOREFRONT_ORIGIN =
    process.env.NEXT_PUBLIC_STOREFRONT_ORIGIN ?? "http://localhost:3001";

/* ─────────────────────────────────────────────────────────────────── */
/* Types                                                                */
/* ─────────────────────────────────────────────────────────────────── */

export interface PreviewRect {
    top: number;
    left: number;
    width: number;
    height: number;
}

export interface BridgeClickEvent {
    section_id: string;
    section_type: string;
    rect: PreviewRect;
}

/** A committed inline text edit coming from the iframe contenteditable. */
export interface BridgeInlineEditEvent {
    section_id: string;
    field_path: string;
    value: string;
}

export interface BridgeState {
    ready: boolean;
    scroll_y: number;
    hovered_section_id: string | null;
    hovered_rect: PreviewRect | null;
    /** Latest rect for the selected section, refreshed via `request_rect`. */
    rect_updates: Record<string, PreviewRect | null>;
    /**
     * True between `inline_edit_begin` and `inline_edit_end`. The editor
     * pauses config-push while this is set so a re-render doesn't reset the
     * caret in the iframe's contenteditable.
     */
    inline_editing: boolean;
}

/**
 * Outbound (`schn-editor` → iframe) message contract. The bridge fires
 * these as fire-and-forget — there is no pong / acknowledgement for the
 * live-render messages, only for `ping`.
 */
export type EditorOutboundMessage =
    | { source: "schn-editor"; type: "scroll_to_section"; section_id: string }
    | { source: "schn-editor"; type: "request_rect"; section_id: string }
    | { source: "schn-editor"; type: "ping" }
    | { source: "schn-editor"; type: "page_config_update"; payload: PageConfig }
    | { source: "schn-editor"; type: "runtime_update"; payload: RuntimeContext }
    | { source: "schn-editor"; type: "page_id_change"; next_url: string }
    | {
          source: "schn-editor";
          type: "set_selected_section";
          section_id: string | null;
      };

export interface UseIframeBridgeReturn {
    state: BridgeState;
    /** Send a `scroll_to_section` message to the preview. */
    scrollToSection: (section_id: string) => void;
    /** Ask the preview for the current bounding rect of a section. */
    requestRect: (section_id: string) => void;
    /** Sends `ping`. Resolves when pong returns (or rejects after 2s). */
    ping: () => Promise<void>;
    /** Subscribe to clicks coming from the preview. Returns an unsubscribe fn. */
    onSectionClicked: (cb: (e: BridgeClickEvent) => void) => () => void;
    /** Tell the preview which section is selected (drives inline-edit). */
    setSelectedSection: (section_id: string | null) => void;
    /** Subscribe to committed inline text edits. Returns an unsubscribe fn. */
    onInlineEditCommit: (
        cb: (e: BridgeInlineEditEvent) => void,
    ) => () => void;
    /**
     * Fire-and-forget post of a full page config to the iframe. The
     * iframe-side `SchneidersPreviewLiveRenderer` swaps its state in
     * response, causing an in-place re-render with no reload.
     */
    postPageConfigUpdate: (page: PageConfig) => void;
    /** Fire-and-forget runtime (locale / breakpoint / page_id) update. */
    postRuntimeUpdate: (runtime: RuntimeContext) => void;
    /**
     * Fire-and-forget page-navigation request. The iframe reloads at the
     * new URL so server data (products, category, etc.) refreshes.
     */
    postPageIdChange: (next_url: string) => void;
}

/* ─────────────────────────────────────────────────────────────────── */
/* Helpers                                                              */
/* ─────────────────────────────────────────────────────────────────── */

interface RectLike {
    x?: number;
    y?: number;
    top?: number;
    left?: number;
    width?: number;
    height?: number;
}

function toPreviewRect(r: RectLike | null | undefined): PreviewRect | null {
    if (!r) return null;
    const top = typeof r.top === "number" ? r.top : (r.y ?? 0);
    const left = typeof r.left === "number" ? r.left : (r.x ?? 0);
    const width = r.width ?? 0;
    const height = r.height ?? 0;
    return { top, left, width, height };
}

const PING_TIMEOUT_MS = 2_000;

/* ─────────────────────────────────────────────────────────────────── */
/* Hook                                                                 */
/* ─────────────────────────────────────────────────────────────────── */

export function useIframeBridge(
    iframeRef: RefObject<HTMLIFrameElement | null>,
): UseIframeBridgeReturn {
    const [state, setState] = useState<BridgeState>(() => ({
        ready: false,
        scroll_y: 0,
        hovered_section_id: null,
        hovered_rect: null,
        rect_updates: {},
        inline_editing: false,
    }));

    // Click subscribers — stored in a ref so subscribe/unsubscribe doesn't
    // tear down the message listener.
    const click_subs_ref = useRef<Set<(e: BridgeClickEvent) => void>>(new Set());
    // Inline-edit commit subscribers.
    const inline_edit_subs_ref = useRef<
        Set<(e: BridgeInlineEditEvent) => void>
    >(new Set());
    // Pending ping resolvers — resolved on the next `pong` from the iframe.
    const pong_subs_ref = useRef<Set<() => void>>(new Set());

    /* ── postMessage helpers ─────────────────────────────────────── */

    const post = useCallback(
        (msg: unknown): void => {
            const win = iframeRef.current?.contentWindow;
            if (!win) return;
            try {
                win.postMessage(msg, STOREFRONT_ORIGIN);
            } catch {
                /* cross-origin send is best-effort */
            }
        },
        [iframeRef],
    );

    const scrollToSection = useCallback(
        (section_id: string): void => {
            post({
                source: "schn-editor",
                type: "scroll_to_section",
                section_id,
            });
        },
        [post],
    );

    const requestRect = useCallback(
        (section_id: string): void => {
            post({
                source: "schn-editor",
                type: "request_rect",
                section_id,
            });
        },
        [post],
    );

    const ping = useCallback((): Promise<void> => {
        return new Promise<void>((resolve, reject) => {
            const subs = pong_subs_ref.current;
            let settled = false;
            const onPong = (): void => {
                if (settled) return;
                settled = true;
                subs.delete(onPong);
                clearTimeout(t);
                resolve();
            };
            subs.add(onPong);
            const t = setTimeout(() => {
                if (settled) return;
                settled = true;
                subs.delete(onPong);
                reject(new Error("preview bridge ping timed out"));
            }, PING_TIMEOUT_MS);
            post({ source: "schn-editor", type: "ping" });
        });
    }, [post]);

    const onSectionClicked = useCallback(
        (cb: (e: BridgeClickEvent) => void): (() => void) => {
            click_subs_ref.current.add(cb);
            return () => {
                click_subs_ref.current.delete(cb);
            };
        },
        [],
    );

    const setSelectedSection = useCallback(
        (section_id: string | null): void => {
            post({
                source: "schn-editor",
                type: "set_selected_section",
                section_id,
            });
        },
        [post],
    );

    const onInlineEditCommit = useCallback(
        (cb: (e: BridgeInlineEditEvent) => void): (() => void) => {
            inline_edit_subs_ref.current.add(cb);
            return () => {
                inline_edit_subs_ref.current.delete(cb);
            };
        },
        [],
    );

    const postPageConfigUpdate = useCallback(
        (page: PageConfig): void => {
            post({
                source: "schn-editor",
                type: "page_config_update",
                payload: page,
            });
        },
        [post],
    );

    const postRuntimeUpdate = useCallback(
        (runtime: RuntimeContext): void => {
            post({
                source: "schn-editor",
                type: "runtime_update",
                payload: runtime,
            });
        },
        [post],
    );

    const postPageIdChange = useCallback(
        (next_url: string): void => {
            post({
                source: "schn-editor",
                type: "page_id_change",
                next_url,
            });
        },
        [post],
    );

    /* ── Inbound listener ────────────────────────────────────────── */

    useEffect(() => {
        if (typeof window === "undefined") return;

        function onMessage(e: MessageEvent): void {
            // Only trust messages from the storefront preview origin.
            if (e.origin !== STOREFRONT_ORIGIN) return;
            const data = e.data as { source?: string; type?: string } | null;
            if (!data || data.source !== "schn-preview") return;
            switch (data.type) {
                case "ready": {
                    setState((s) => ({ ...s, ready: true }));
                    break;
                }
                case "scrolled": {
                    const y = (data as { y?: number }).y ?? 0;
                    setState((s) => ({ ...s, scroll_y: y }));
                    break;
                }
                case "section_hovered": {
                    const d = data as {
                        section_id: string;
                        rect: RectLike;
                    };
                    setState((s) => ({
                        ...s,
                        hovered_section_id: d.section_id,
                        hovered_rect: toPreviewRect(d.rect),
                    }));
                    break;
                }
                case "section_unhovered": {
                    setState((s) => ({
                        ...s,
                        hovered_section_id: null,
                        hovered_rect: null,
                    }));
                    break;
                }
                case "section_clicked": {
                    const d = data as {
                        section_id: string;
                        section_type: string;
                        rect: RectLike;
                    };
                    const evt: BridgeClickEvent = {
                        section_id: d.section_id,
                        section_type: d.section_type,
                        rect: toPreviewRect(d.rect) ?? {
                            top: 0,
                            left: 0,
                            width: 0,
                            height: 0,
                        },
                    };
                    for (const cb of click_subs_ref.current) cb(evt);
                    // Mirror the clicked rect into rect_updates so the
                    // overlay can render immediately without a roundtrip.
                    setState((s) => ({
                        ...s,
                        rect_updates: {
                            ...s.rect_updates,
                            [d.section_id]: evt.rect,
                        },
                    }));
                    break;
                }
                case "rect_update": {
                    const d = data as {
                        section_id: string;
                        rect: RectLike | null;
                    };
                    setState((s) => ({
                        ...s,
                        rect_updates: {
                            ...s.rect_updates,
                            [d.section_id]: toPreviewRect(d.rect),
                        },
                    }));
                    break;
                }
                case "inline_edit_begin": {
                    setState((s) => ({ ...s, inline_editing: true }));
                    break;
                }
                case "inline_edit_commit": {
                    const d = data as {
                        section_id: string;
                        field_path: string;
                        value: string;
                    };
                    const evt: BridgeInlineEditEvent = {
                        section_id: d.section_id,
                        field_path: d.field_path,
                        value: d.value,
                    };
                    for (const cb of inline_edit_subs_ref.current) cb(evt);
                    break;
                }
                case "inline_edit_end": {
                    setState((s) => ({ ...s, inline_editing: false }));
                    break;
                }
                case "pong": {
                    for (const cb of pong_subs_ref.current) cb();
                    break;
                }
                default: {
                    /* unknown — ignore */
                }
            }
        }

        window.addEventListener("message", onMessage);
        return () => {
            window.removeEventListener("message", onMessage);
        };
    }, []);

    return {
        state,
        scrollToSection,
        requestRect,
        ping,
        onSectionClicked,
        setSelectedSection,
        onInlineEditCommit,
        postPageConfigUpdate,
        postRuntimeUpdate,
        postPageIdChange,
    };
}
