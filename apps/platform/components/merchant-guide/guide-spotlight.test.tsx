// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { GuideSpotlight } from "./guide-spotlight";
import type { TargetBox } from "./use-target-rect";

afterEach(cleanup);

const box = (of: string, top: number): TargetBox => ({ top, left: 40, width: 120, height: 32, of });
const spot = (): HTMLElement => screen.getByTestId("merchant-guide-spot");

describe("GuideSpotlight: glide between elements, follow one element", () => {
    it("follows a field that scrolls without gliding behind it (Ali, 28 Nov: jittery dim on a tablet)", () => {
        const view = render(<GuideSpotlight box={box('[data-guide="a"]', 400)} />);
        expect(spot().dataset.glide).toBeUndefined();
        view.rerender(<GuideSpotlight box={box('[data-guide="a"]', 100)} />);
        expect(spot().dataset.glide).toBeUndefined();
        expect(spot().style.transform).toBe("translate(34px, 94px)");
    });

    it("glides when the light moves to another element", () => {
        const view = render(<GuideSpotlight box={box('[data-guide="a"]', 400)} />);
        view.rerender(<GuideSpotlight box={box('[data-guide="b"]', 100)} />);
        expect(spot().dataset.glide).toBe("true");
    });
});
