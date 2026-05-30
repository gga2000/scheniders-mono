/// <reference types="vitest/globals" />
// @vitest-environment jsdom

import { describe, it, expect } from "vitest";
import {
    applyLayerHover,
    clearAllLayerHovers,
    clearLayerHover,
    findLayers,
    humaniseFieldPath,
} from "./layer-walk";

function mount(html: string): HTMLElement {
    const div = document.createElement("div");
    div.innerHTML = html;
    document.body.appendChild(div);
    return div;
}

describe("layer-walk", () => {
    it("findLayers returns [] for null root", () => {
        expect(findLayers(null)).toEqual([]);
    });

    it("discovers text layers from [data-i18n-field] descendants", () => {
        const root = mount(`
            <section data-section-id="s1">
                <h1 data-i18n-field="title_i18n">Hi</h1>
                <p data-i18n-field="subtitle_i18n">World</p>
            </section>
        `);
        const layers = findLayers(root);
        expect(layers).toHaveLength(2);
        expect(layers[0]).toMatchObject({ kind: "text", field: "title_i18n", label: "Title" });
        expect(layers[1]).toMatchObject({
            kind: "text",
            field: "subtitle_i18n",
            label: "Subtitle",
        });
    });

    it("uses data-layer-label override when present and detects image/button kinds", () => {
        const root = mount(`
            <section data-section-id="s1">
                <div data-layer="image" data-layer-label="Background image" data-layer-kind="image"></div>
                <button data-layer="cta_group" data-layer-label="Buttons"></button>
            </section>
        `);
        const layers = findLayers(root);
        expect(layers).toHaveLength(2);
        expect(layers[0]).toMatchObject({
            kind: "image",
            layerId: "image",
            label: "Background image",
        });
        expect(layers[1]).toMatchObject({
            kind: "button",
            layerId: "cta_group",
            label: "Buttons",
        });
    });

    it("hover helpers toggle the data-layer-hover attribute and clearAll cleans up", () => {
        const root = mount(`
            <section>
                <span id="x" data-i18n-field="title_i18n">Hi</span>
                <span id="y" data-i18n-field="subtitle_i18n">World</span>
            </section>
        `);
        const x = root.querySelector<HTMLElement>("#x")!;
        const y = root.querySelector<HTMLElement>("#y")!;

        applyLayerHover(x);
        applyLayerHover(y);
        expect(x.getAttribute("data-layer-hover")).toBe("true");
        expect(y.getAttribute("data-layer-hover")).toBe("true");

        clearLayerHover(x);
        expect(x.hasAttribute("data-layer-hover")).toBe(false);
        expect(y.hasAttribute("data-layer-hover")).toBe(true);

        clearAllLayerHovers(document);
        expect(y.hasAttribute("data-layer-hover")).toBe(false);
    });

    it("humaniseFieldPath strips _i18n / underscores / array indexers", () => {
        expect(humaniseFieldPath("cta_label_i18n")).toBe("CTA Label");
        expect(humaniseFieldPath("items[0].q_i18n")).toBe("Items Q");
        expect(humaniseFieldPath("image_url")).toBe("Image URL");
    });
});
