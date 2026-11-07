import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { PreviewFrame } from "./preview-frame";

type RoCallback = (entries: Array<{ contentRect: { width: number } }>) => void;
let fire: RoCallback | null = null;

class FakeResizeObserver {
    constructor(cb: RoCallback) {
        fire = cb;
    }
    observe(): void {}
    disconnect(): void {}
}

afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    fire = null;
});

describe("PreviewFrame", () => {
    it("renders desktop at a real desktop width, scaled to fit a narrow canvas", () => {
        vi.stubGlobal("ResizeObserver", FakeResizeObserver);
        render(<PreviewFrame url="about:blank" breakpoint="desktop" />);
        act(() => fire?.([{ contentRect: { width: 640 } }]));
        const viewport = screen.getByTestId("preview-frame-viewport") as HTMLDivElement;
        const iframe = screen.getByTestId("preview-frame-iframe") as HTMLIFrameElement;
        expect(viewport.style.width).toBe("640px");
        expect(iframe.style.width).toBe("1280px");
        expect(iframe.style.transform).toBe("scale(0.5)");
    });

    it("does not scale when the canvas is wide enough", () => {
        vi.stubGlobal("ResizeObserver", FakeResizeObserver);
        render(<PreviewFrame url="about:blank" breakpoint="mobile" />);
        act(() => fire?.([{ contentRect: { width: 900 } }]));
        const viewport = screen.getByTestId("preview-frame-viewport") as HTMLDivElement;
        const iframe = screen.getByTestId("preview-frame-iframe") as HTMLIFrameElement;
        expect(viewport.style.width).toBe("390px");
        expect(iframe.style.transform).toBe("");
    });
});
