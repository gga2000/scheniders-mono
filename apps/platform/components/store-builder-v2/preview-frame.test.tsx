import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { PreviewFrame } from "./preview-frame";

afterEach(cleanup);

describe("PreviewFrame", () => {
    it("renders desktop at a real desktop width, scaled to the given zoom", () => {
        render(<PreviewFrame url="about:blank" breakpoint="desktop" zoom={0.5} />);
        const viewport = screen.getByTestId("preview-frame-viewport") as HTMLDivElement;
        const iframe = screen.getByTestId("preview-frame-iframe") as HTMLIFrameElement;
        expect(viewport.style.width).toBe("640px");
        expect(iframe.style.width).toBe("1280px");
        expect(iframe.style.transform).toBe("scale(0.5)");
    });

    it("does not transform at 100%", () => {
        render(<PreviewFrame url="about:blank" breakpoint="mobile" zoom={1} />);
        const viewport = screen.getByTestId("preview-frame-viewport") as HTMLDivElement;
        const iframe = screen.getByTestId("preview-frame-iframe") as HTMLIFrameElement;
        expect(viewport.style.width).toBe("390px");
        expect(iframe.style.transform).toBe("");
    });
});
