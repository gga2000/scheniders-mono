/// <reference types="vitest/globals" />
// @vitest-environment jsdom

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

import { BlockLayersPanel } from "./block-layers-panel";

function setupRoot(html: string): HTMLElement {
    const div = document.createElement("div");
    div.setAttribute("data-section-id", "sec-test");
    div.innerHTML = html;
    document.body.appendChild(div);
    return div;
}

afterEach(() => {
    cleanup();
    document.body.innerHTML = "";
});

describe("BlockLayersPanel", () => {
    it("shows the empty state when the section has no editable layers", () => {
        const root = setupRoot("<p>plain</p>");
        render(<BlockLayersPanel sectionId="sec-test" rootEl={root} />);
        expect(screen.getByTestId("block-layers-panel-empty")).toBeTruthy();
    });

    it("lists [data-i18n-field] and [data-layer] descendants with the right kinds", () => {
        const root = setupRoot(`
            <h1 data-i18n-field="title_i18n">Welcome</h1>
            <div data-layer="image" data-layer-kind="image" data-layer-label="Background"></div>
            <button data-layer="cta_group" data-layer-label="Buttons"></button>
        `);
        render(<BlockLayersPanel sectionId="sec-test" rootEl={root} />);
        expect(screen.getByTestId("block-layers-panel")).toBeTruthy();
        expect(screen.getByTestId("block-layers-panel-count").textContent).toBe("3");
        expect(screen.getByText("Title")).toBeTruthy();
        expect(screen.getByText("Background")).toBeTruthy();
        expect(screen.getByText("Buttons")).toBeTruthy();
    });

    it("hovering a row applies data-layer-hover to the matching DOM element", () => {
        const root = setupRoot(`
            <h1 data-i18n-field="title_i18n">Welcome</h1>
        `);
        render(<BlockLayersPanel sectionId="sec-test" rootEl={root} />);
        const row = screen.getByTestId(/^block-layers-panel-row-title_i18n/);
        fireEvent.pointerEnter(row);
        const target = root.querySelector("[data-i18n-field='title_i18n']") as HTMLElement;
        expect(target.getAttribute("data-layer-hover")).toBe("true");
        fireEvent.pointerLeave(row);
        expect(target.hasAttribute("data-layer-hover")).toBe(false);
    });

    it("clicking a text layer fires onEditLayer with the field path", () => {
        const root = setupRoot(`
            <h1 data-i18n-field="title_i18n">Welcome</h1>
        `);
        const onEditLayer = vi.fn();
        render(
            <BlockLayersPanel
                sectionId="sec-test"
                rootEl={root}
                onEditLayer={onEditLayer}
            />,
        );
        const row = screen.getByTestId(/^block-layers-panel-row-title_i18n/);
        fireEvent.click(row);
        expect(onEditLayer).toHaveBeenCalledTimes(1);
        expect(onEditLayer.mock.calls[0][0]).toMatchObject({ field: "title_i18n" });
    });
});
