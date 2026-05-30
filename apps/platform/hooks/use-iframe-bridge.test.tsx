/// <reference types="vitest/globals" />
// @vitest-environment jsdom

// =====================================================================
// useIframeBridge — postMessage contract tests
// =====================================================================
// Mounts the hook inside jsdom, fakes the iframe's contentWindow with a
// spy on postMessage, and exercises every inbound + outbound path of
// the schn-preview / schn-editor contract.
// =====================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import React, { createRef, useRef, useImperativeHandle, forwardRef } from "react";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import {
    useIframeBridge,
    type UseIframeBridgeReturn,
} from "./use-iframe-bridge";

/* ─────────────────────────────────────────────────────────────────── */
/* Test harness                                                         */
/* ─────────────────────────────────────────────────────────────────── */

interface HarnessHandle {
    api: UseIframeBridgeReturn;
}

interface HarnessProps {
    contentWindow: { postMessage: ReturnType<typeof vi.fn> };
}

const Harness = forwardRef<HarnessHandle, HarnessProps>(function Harness(
    { contentWindow },
    ref,
) {
    const iframeRef = useRef<HTMLIFrameElement | null>(null);
    // Stand in for the real iframe — only `contentWindow` matters.
    if (!iframeRef.current) {
        iframeRef.current = {
            contentWindow: contentWindow as unknown as Window,
        } as unknown as HTMLIFrameElement;
    }
    const api = useIframeBridge(iframeRef);
    useImperativeHandle(ref, () => ({ api }), [api]);
    return null;
});

let container: HTMLDivElement;
let root: Root;
let postMessage: ReturnType<typeof vi.fn>;
let harnessRef: React.RefObject<HarnessHandle | null>;

function mount(): void {
    act(() => {
        root.render(
            <Harness
                ref={harnessRef as React.RefObject<HarnessHandle>}
                contentWindow={{ postMessage }}
            />,
        );
    });
}

function unmount(): void {
    act(() => {
        root.unmount();
    });
}

function sendFromPreview(data: Record<string, unknown>): void {
    act(() => {
        window.dispatchEvent(
            new MessageEvent("message", {
                data: { source: "schn-preview", ...data },
            }),
        );
    });
}

beforeEach(() => {
    postMessage = vi.fn();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    harnessRef = createRef<HarnessHandle | null>();
});

afterEach(() => {
    try {
        unmount();
    } catch {
        /* not mounted */
    }
    document.body.innerHTML = "";
    vi.restoreAllMocks();
});

/* ─────────────────────────────────────────────────────────────────── */
/* Tests                                                                */
/* ─────────────────────────────────────────────────────────────────── */

describe("useIframeBridge", () => {
    it("initializes with default state (not ready, no hover/selection)", () => {
        mount();
        const s = harnessRef.current!.api.state;
        expect(s.ready).toBe(false);
        expect(s.scroll_y).toBe(0);
        expect(s.hovered_section_id).toBeNull();
        expect(s.hovered_rect).toBeNull();
        expect(s.rect_updates).toEqual({});
    });

    it("flips ready=true on inbound `ready` message", () => {
        mount();
        sendFromPreview({ type: "ready", url: "http://localhost/_preview/x" });
        expect(harnessRef.current!.api.state.ready).toBe(true);
    });

    it("tracks hovered section + rect on `section_hovered`", () => {
        mount();
        sendFromPreview({
            type: "section_hovered",
            section_id: "sec-A",
            rect: { x: 10, y: 20, width: 100, height: 200 },
        });
        const s = harnessRef.current!.api.state;
        expect(s.hovered_section_id).toBe("sec-A");
        expect(s.hovered_rect).toEqual({
            top: 20,
            left: 10,
            width: 100,
            height: 200,
        });
    });

    it("clears hover state on `section_unhovered`", () => {
        mount();
        sendFromPreview({
            type: "section_hovered",
            section_id: "sec-A",
            rect: { x: 0, y: 0, width: 1, height: 1 },
        });
        sendFromPreview({ type: "section_unhovered" });
        const s = harnessRef.current!.api.state;
        expect(s.hovered_section_id).toBeNull();
        expect(s.hovered_rect).toBeNull();
    });

    it("notifies click subscribers + seeds rect_updates on `section_clicked`", () => {
        mount();
        const cb = vi.fn();
        let unsubscribe!: () => void;
        act(() => {
            unsubscribe = harnessRef.current!.api.onSectionClicked(cb);
        });
        sendFromPreview({
            type: "section_clicked",
            section_id: "sec-B",
            section_type: "hero_image",
            rect: { x: 5, y: 6, width: 7, height: 8 },
        });
        expect(cb).toHaveBeenCalledTimes(1);
        expect(cb.mock.calls[0][0]).toEqual({
            section_id: "sec-B",
            section_type: "hero_image",
            rect: { top: 6, left: 5, width: 7, height: 8 },
        });
        expect(harnessRef.current!.api.state.rect_updates["sec-B"]).toEqual({
            top: 6,
            left: 5,
            width: 7,
            height: 8,
        });
        unsubscribe();
        sendFromPreview({
            type: "section_clicked",
            section_id: "sec-B",
            section_type: "hero_image",
            rect: { x: 0, y: 0, width: 1, height: 1 },
        });
        expect(cb).toHaveBeenCalledTimes(1);
    });

    it("updates scroll_y on `scrolled`", () => {
        mount();
        sendFromPreview({ type: "scrolled", y: 142 });
        expect(harnessRef.current!.api.state.scroll_y).toBe(142);
    });

    it("merges rect_updates from `rect_update`", () => {
        mount();
        sendFromPreview({
            type: "rect_update",
            section_id: "sec-C",
            rect: { x: 1, y: 2, width: 3, height: 4 },
        });
        expect(harnessRef.current!.api.state.rect_updates["sec-C"]).toEqual({
            top: 2,
            left: 1,
            width: 3,
            height: 4,
        });
    });

    it("scrollToSection posts the correct payload to the iframe", () => {
        mount();
        act(() => {
            harnessRef.current!.api.scrollToSection("sec-D");
        });
        expect(postMessage).toHaveBeenCalledWith(
            { source: "schn-editor", type: "scroll_to_section", section_id: "sec-D" },
            "*",
        );
    });

    it("requestRect posts `request_rect`", () => {
        mount();
        act(() => {
            harnessRef.current!.api.requestRect("sec-E");
        });
        expect(postMessage).toHaveBeenCalledWith(
            { source: "schn-editor", type: "request_rect", section_id: "sec-E" },
            "*",
        );
    });

    it("ping() resolves when pong returns", async () => {
        mount();
        let promise!: Promise<void>;
        act(() => {
            promise = harnessRef.current!.api.ping();
        });
        // Should have sent ping
        expect(postMessage).toHaveBeenCalledWith(
            { source: "schn-editor", type: "ping" },
            "*",
        );
        sendFromPreview({ type: "pong" });
        await expect(promise).resolves.toBeUndefined();
    });

    it("ignores messages whose source is not `schn-preview`", () => {
        mount();
        act(() => {
            window.dispatchEvent(
                new MessageEvent("message", {
                    data: { source: "other", type: "ready", url: "x" },
                }),
            );
        });
        expect(harnessRef.current!.api.state.ready).toBe(false);
    });
});
