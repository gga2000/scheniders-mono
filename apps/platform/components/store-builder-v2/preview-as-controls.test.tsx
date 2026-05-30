/// <reference types="vitest/globals" />
// @vitest-environment jsdom

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import type { AudienceSegment, Experiment } from "@scheniders/shared";

import {
    PreviewAsControls,
    EMPTY_PREVIEW_AS,
    type PreviewAsState,
} from "./preview-as-controls";

afterEach(() => {
    cleanup();
});

const SEGMENTS: AudienceSegment[] = [
    { id: "seg_returning", name: "Returning visitors", rules: [], combine: "all" },
    { id: "seg_iraqi", name: "Iraqi visitors", rules: [], combine: "all" },
];

const EXPERIMENTS: Experiment[] = [
    {
        id: "exp_hero",
        name: "Hero copy",
        status: "running",
        primary_metric: "orders",
        arms: [
            { id: "a", label: "Control", traffic_pct: 50 },
            { id: "b", label: "Variant B", traffic_pct: 50 },
        ],
    },
];

function renderControls(initial: PreviewAsState = EMPTY_PREVIEW_AS) {
    const onChange = vi.fn();
    const utils = render(
        <PreviewAsControls
            value={initial}
            onChange={onChange}
            segments={SEGMENTS}
            experiments={EXPERIMENTS}
        />,
    );
    return { onChange, ...utils };
}

describe("PreviewAsControls", () => {
    it("renders collapsed with no active count when empty", () => {
        renderControls();
        expect(screen.getByTestId("preview-as-button")).toBeTruthy();
        expect(screen.queryByTestId("preview-as-count")).toBeNull();
        expect(screen.queryByTestId("preview-as-popover")).toBeNull();
    });

    it("opens popover on click and shows governorate + segments + experiments", () => {
        renderControls();
        fireEvent.click(screen.getByTestId("preview-as-button"));
        expect(screen.getByTestId("preview-as-popover")).toBeTruthy();
        expect(screen.getByTestId("preview-as-governorate")).toBeTruthy();
        expect(screen.getByTestId("preview-as-segment-seg_returning")).toBeTruthy();
        expect(screen.getByTestId("preview-as-arm-exp_hero")).toBeTruthy();
    });

    it("emits governorate change", () => {
        const { onChange } = renderControls();
        fireEvent.click(screen.getByTestId("preview-as-button"));
        const select = screen.getByTestId("preview-as-governorate") as HTMLSelectElement;
        fireEvent.change(select, { target: { value: "BG" } });
        expect(onChange).toHaveBeenCalledWith(
            expect.objectContaining({ governorate: "BG" }),
        );
    });

    it("toggles a segment on/off", () => {
        const { onChange } = renderControls();
        fireEvent.click(screen.getByTestId("preview-as-button"));
        fireEvent.click(screen.getByTestId("preview-as-segment-seg_returning"));
        expect(onChange).toHaveBeenCalledWith(
            expect.objectContaining({ segments: ["seg_returning"] }),
        );
    });

    it("sets and clears an AB arm", () => {
        const { onChange } = renderControls();
        fireEvent.click(screen.getByTestId("preview-as-button"));
        const sel = screen.getByTestId("preview-as-arm-exp_hero") as HTMLSelectElement;

        fireEvent.change(sel, { target: { value: "b" } });
        expect(onChange).toHaveBeenLastCalledWith(
            expect.objectContaining({ ab_arms: { exp_hero: "b" } }),
        );

        fireEvent.change(sel, { target: { value: "" } });
        expect(onChange).toHaveBeenLastCalledWith(
            expect.objectContaining({ ab_arms: {} }),
        );
    });

    it("shows active count and reset button when state is populated", () => {
        const populated: PreviewAsState = {
            governorate: "BG",
            segments: ["seg_returning", "seg_iraqi"],
            ab_arms: { exp_hero: "b" },
        };
        const { onChange } = renderControls(populated);
        expect(screen.getByTestId("preview-as-count").textContent).toBe("4");

        fireEvent.click(screen.getByTestId("preview-as-button"));
        fireEvent.click(screen.getByTestId("preview-as-reset"));
        expect(onChange).toHaveBeenCalledWith(EMPTY_PREVIEW_AS);
    });

    it("shows empty-state copy when there are no segments or experiments", () => {
        render(
            <PreviewAsControls
                value={EMPTY_PREVIEW_AS}
                onChange={() => {}}
                segments={[]}
                experiments={[]}
            />,
        );
        fireEvent.click(screen.getByTestId("preview-as-button"));
        expect(screen.getByText(/No segments defined/i)).toBeTruthy();
        expect(screen.getByText(/No experiments defined/i)).toBeTruthy();
    });
});
