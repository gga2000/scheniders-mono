/// <reference types="vitest/globals" />
// @vitest-environment jsdom

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

import { PreviewOverlay } from "./preview-overlay";
import type {
    BridgeState,
    UseIframeBridgeReturn,
} from "@/hooks/use-iframe-bridge";

/* ─────────────────────────────────────────────────────────────────── */
/* Helpers                                                              */
/* ─────────────────────────────────────────────────────────────────── */

function makeBridge(state: Partial<BridgeState> = {}): UseIframeBridgeReturn {
    const full: BridgeState = {
        ready: true,
        scroll_y: 0,
        hovered_section_id: null,
        hovered_rect: null,
        rect_updates: {},
        ...state,
    };
    return {
        state: full,
        scrollToSection: vi.fn(),
        requestRect: vi.fn(),
        ping: vi.fn().mockResolvedValue(undefined),
        onSectionClicked: vi.fn().mockReturnValue(() => {}),
        postPageConfigUpdate: vi.fn(),
        postRuntimeUpdate: vi.fn(),
        postPageIdChange: vi.fn(),
    };
}

const BOUNDS = new DOMRect(0, 0, 800, 600);

afterEach(() => {
    cleanup();
});

/* ─────────────────────────────────────────────────────────────────── */
/* Tests                                                                */
/* ─────────────────────────────────────────────────────────────────── */

describe("PreviewOverlay", () => {
    it("renders nothing visual when no section is selected or hovered", () => {
        render(
            <PreviewOverlay
                bridge={makeBridge()}
                selected_section_id={null}
                onEditRequest={() => {}}
                onDeleteRequest={() => {}}
                onAction={() => {}}
                iframeBounds={BOUNDS}
            />,
        );
        // Root overlay always renders, but no rings inside.
        expect(screen.getByTestId("preview-overlay")).toBeTruthy();
        expect(screen.queryByTestId("preview-overlay-hover-ring")).toBeNull();
        expect(screen.queryByTestId("preview-overlay-selected-ring")).toBeNull();
        expect(screen.queryByTestId("preview-overlay-toolbar")).toBeNull();
    });

    it("returns null when iframeBounds is not yet known", () => {
        const { container } = render(
            <PreviewOverlay
                bridge={makeBridge()}
                selected_section_id={null}
                onEditRequest={() => {}}
                onDeleteRequest={() => {}}
                onAction={() => {}}
                iframeBounds={null}
            />,
        );
        expect(container.querySelector("[data-testid='preview-overlay']")).toBeNull();
    });

    it("renders the hover ring when a section is hovered", () => {
        render(
            <PreviewOverlay
                bridge={makeBridge({
                    hovered_section_id: "sec-A",
                    hovered_rect: { top: 50, left: 60, width: 200, height: 80 },
                })}
                selected_section_id={null}
                onEditRequest={() => {}}
                onDeleteRequest={() => {}}
                onAction={() => {}}
                iframeBounds={BOUNDS}
            />,
        );
        const ring = screen.getByTestId("preview-overlay-hover-ring") as HTMLDivElement;
        expect(ring).toBeTruthy();
        // top should be (50 - 6) = 44
        expect(ring.style.top).toBe("44px");
        expect(ring.style.left).toBe("54px");
    });

    it("renders the selected ring + toolbar at the right coords", () => {
        render(
            <PreviewOverlay
                bridge={makeBridge({
                    rect_updates: {
                        "sec-S": { top: 200, left: 30, width: 300, height: 100 },
                    },
                })}
                selected_section_id="sec-S"
                selected_section_label="Hero"
                onEditRequest={() => {}}
                onDeleteRequest={() => {}}
                onAction={() => {}}
                iframeBounds={BOUNDS}
            />,
        );
        const ring = screen.getByTestId("preview-overlay-selected-ring") as HTMLDivElement;
        expect(ring).toBeTruthy();
        expect(ring.style.top).toBe("194px"); // 200 - 6

        const toolbar = screen.getByTestId("preview-overlay-toolbar") as HTMLDivElement;
        expect(toolbar).toBeTruthy();
        // top should be above section: 200 - 32 - 8 = 160
        expect(toolbar.style.top).toBe("160px");
        expect(toolbar.dataset.flipBelow).toBe("false");
        expect(screen.getByTestId("preview-overlay-toolbar-label").textContent).toBe(
            "Hero",
        );
    });

    it("flips the toolbar BELOW when the section is too close to the top", () => {
        render(
            <PreviewOverlay
                bridge={makeBridge({
                    rect_updates: {
                        "sec-T": { top: 20, left: 0, width: 200, height: 80 },
                    },
                })}
                selected_section_id="sec-T"
                selected_section_label="Top Section"
                onEditRequest={() => {}}
                onDeleteRequest={() => {}}
                onAction={() => {}}
                iframeBounds={BOUNDS}
            />,
        );
        const toolbar = screen.getByTestId("preview-overlay-toolbar") as HTMLDivElement;
        expect(toolbar.dataset.flipBelow).toBe("true");
        // top should be below section: 20 + 80 + 8 = 108
        expect(toolbar.style.top).toBe("108px");
    });

    it("clicking Edit on the toolbar calls onEditRequest with the selected id", () => {
        const onEditRequest = vi.fn();
        render(
            <PreviewOverlay
                bridge={makeBridge({
                    rect_updates: {
                        "sec-E": { top: 200, left: 0, width: 100, height: 50 },
                    },
                })}
                selected_section_id="sec-E"
                onEditRequest={onEditRequest}
                onDeleteRequest={() => {}}
                onAction={() => {}}
                iframeBounds={BOUNDS}
            />,
        );
        fireEvent.click(screen.getByTestId("preview-overlay-toolbar-edit"));
        expect(onEditRequest).toHaveBeenCalledWith("sec-E");
    });

    it("clicking Delete on the toolbar calls onDeleteRequest", () => {
        const onDeleteRequest = vi.fn();
        render(
            <PreviewOverlay
                bridge={makeBridge({
                    rect_updates: {
                        "sec-D": { top: 200, left: 0, width: 100, height: 50 },
                    },
                })}
                selected_section_id="sec-D"
                onEditRequest={() => {}}
                onDeleteRequest={onDeleteRequest}
                onAction={() => {}}
                iframeBounds={BOUNDS}
            />,
        );
        fireEvent.click(screen.getByTestId("preview-overlay-toolbar-delete"));
        expect(onDeleteRequest).toHaveBeenCalledWith("sec-D");
    });

    it("clicking Duplicate / Up / Down emits onAction with the right kind", () => {
        const onAction = vi.fn();
        render(
            <PreviewOverlay
                bridge={makeBridge({
                    rect_updates: {
                        "sec-X": { top: 200, left: 0, width: 100, height: 50 },
                    },
                })}
                selected_section_id="sec-X"
                onEditRequest={() => {}}
                onDeleteRequest={() => {}}
                onAction={onAction}
                iframeBounds={BOUNDS}
            />,
        );
        fireEvent.click(screen.getByTestId("preview-overlay-toolbar-duplicate"));
        fireEvent.click(screen.getByTestId("preview-overlay-toolbar-up"));
        fireEvent.click(screen.getByTestId("preview-overlay-toolbar-down"));
        expect(onAction).toHaveBeenNthCalledWith(1, {
            kind: "duplicate",
            section_id: "sec-X",
        });
        expect(onAction).toHaveBeenNthCalledWith(2, {
            kind: "up",
            section_id: "sec-X",
        });
        expect(onAction).toHaveBeenNthCalledWith(3, {
            kind: "down",
            section_id: "sec-X",
        });
    });

    it("hides the hover ring while the iframe is scrolling", () => {
        // Provide a non-zero scroll_y so the scrolling effect kicks in.
        // We assert immediate behavior: scroll_y change triggers `scrolling=true`.
        const { rerender } = render(
            <PreviewOverlay
                bridge={makeBridge({
                    hovered_section_id: "sec-H",
                    hovered_rect: { top: 100, left: 0, width: 50, height: 50 },
                })}
                selected_section_id={null}
                onEditRequest={() => {}}
                onDeleteRequest={() => {}}
                onAction={() => {}}
                iframeBounds={BOUNDS}
            />,
        );
        // Hover ring visible at scroll_y=0 (initial state, effect hasn't seen a change yet).
        expect(screen.getByTestId("preview-overlay-hover-ring")).toBeTruthy();

        // Bump scroll_y → next render triggers the scrolling effect, which sets `scrolling=true`.
        rerender(
            <PreviewOverlay
                bridge={makeBridge({
                    scroll_y: 80,
                    hovered_section_id: "sec-H",
                    hovered_rect: { top: 100, left: 0, width: 50, height: 50 },
                })}
                selected_section_id={null}
                onEditRequest={() => {}}
                onDeleteRequest={() => {}}
                onAction={() => {}}
                iframeBounds={BOUNDS}
            />,
        );
        expect(screen.queryByTestId("preview-overlay-hover-ring")).toBeNull();
    });
});
