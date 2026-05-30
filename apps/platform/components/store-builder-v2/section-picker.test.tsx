/// <reference types="vitest/globals" />
// @vitest-environment jsdom

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import type { SectionInstance } from "@scheniders/shared";
import { SectionPicker } from "./section-picker";
import { SECTIONS_MANIFEST } from "@/lib/sections-manifest";

afterEach(() => {
    cleanup();
});

/* ─────────────────────────────────────────────────────────────────── */
/* Tests                                                                */
/* ─────────────────────────────────────────────────────────────────── */

describe("SectionPicker", () => {
    it("renders nothing when closed", () => {
        render(
            <SectionPicker
                open={false}
                onClose={() => {}}
                pageId="home"
                onAdd={() => {}}
            />,
        );
        expect(screen.queryByTestId("section-picker")).toBeNull();
    });

    it("renders all manifest entries when open", () => {
        render(
            <SectionPicker
                open
                onClose={() => {}}
                pageId="home"
                onAdd={() => {}}
            />,
        );
        for (const entry of SECTIONS_MANIFEST) {
            expect(
                screen.getByTestId(`section-picker-card-${entry.type}`),
            ).toBeTruthy();
        }
        // 21 known sections (5 original + 15 prebuilt families + html_embed).
        expect(SECTIONS_MANIFEST.length).toBe(21);
    });

    it("filters by category chip", () => {
        render(
            <SectionPicker
                open
                onClose={() => {}}
                pageId="home"
                onAdd={() => {}}
            />,
        );
        fireEvent.click(screen.getByTestId("section-picker-chip-hero"));
        // hero_image visible
        expect(
            screen.getByTestId("section-picker-card-hero_image"),
        ).toBeTruthy();
        // trust_strip should be hidden
        expect(screen.queryByTestId("section-picker-card-trust_strip")).toBeNull();
        // product_grid should be hidden
        expect(screen.queryByTestId("section-picker-card-product_grid")).toBeNull();
    });

    it("filters by search query (case-insensitive, matches name and description)", () => {
        render(
            <SectionPicker
                open
                onClose={() => {}}
                pageId="home"
                onAdd={() => {}}
            />,
        );
        const search = screen.getByTestId(
            "section-picker-search",
        ) as HTMLInputElement;
        fireEvent.change(search, { target: { value: "HERO" } });
        expect(
            screen.getByTestId("section-picker-card-hero_image"),
        ).toBeTruthy();
        // Trust strip should not match "hero".
        expect(screen.queryByTestId("section-picker-card-trust_strip")).toBeNull();
    });

    it("greys out and disables sections not valid for the current page", () => {
        render(
            <SectionPicker
                open
                onClose={() => {}}
                pageId="checkout"
                onAdd={() => {}}
            />,
        );
        // hero_image's valid_on is ["home"] — invalid for checkout.
        const card = screen.getByTestId(
            "section-picker-card-hero_image",
        ) as HTMLButtonElement;
        expect(card.disabled).toBe(true);
        expect(card.getAttribute("data-valid")).toBe("false");
    });

    it("does NOT call onAdd when an invalid card is clicked", () => {
        const onAdd = vi.fn();
        const onClose = vi.fn();
        render(
            <SectionPicker
                open
                onClose={onClose}
                pageId="checkout"
                onAdd={onAdd}
            />,
        );
        fireEvent.click(screen.getByTestId("section-picker-card-hero_image"));
        expect(onAdd).not.toHaveBeenCalled();
        expect(onClose).not.toHaveBeenCalled();
    });

    it("calls onAdd with a fresh SectionInstance seeded from defaultProps", () => {
        const onAdd = vi.fn();
        const onClose = vi.fn();
        render(
            <SectionPicker
                open
                onClose={onClose}
                pageId="home"
                onAdd={onAdd}
            />,
        );
        fireEvent.click(screen.getByTestId("section-picker-card-hero_image"));
        expect(onAdd).toHaveBeenCalledTimes(1);
        const instance = onAdd.mock.calls[0][0] as SectionInstance;
        expect(instance.type).toBe("hero_image");
        expect(instance.enabled).toBe(true);
        expect(typeof instance.id).toBe("string");
        expect(instance.id.length).toBeGreaterThan(0);
        const hero = SECTIONS_MANIFEST.find((s) => s.type === "hero_image")!;
        // Deep copy: same shape, but a different object reference.
        expect(instance.base).toEqual(hero.defaultProps);
        expect(instance.base).not.toBe(hero.defaultProps);
        // Picker should also auto-close.
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("Saved-presets tab shows an empty state when no presets are loaded", () => {
        render(
            <SectionPicker
                open
                onClose={() => {}}
                pageId="home"
                onAdd={() => {}}
                presets={[]}
            />,
        );
        fireEvent.click(screen.getByTestId("section-picker-tab-presets"));
        expect(screen.getByTestId("section-picker-presets-empty")).toBeTruthy();
        // Library grid is no longer shown.
        expect(screen.queryByTestId("section-picker-grid")).toBeNull();
    });

    it("Saved-presets tab inserts a fresh SectionInstance when a preset is clicked", () => {
        const onAdd = vi.fn();
        const onClose = vi.fn();
        const onDeletePreset = vi.fn();
        const presetRow = {
            id: "p1",
            tenant_id: "t1",
            name: "Pink hero",
            section_type: "hero_image",
            instance: {
                type: "hero_image",
                enabled: true,
                base: { title_i18n: { en: "Hi" } },
                label: "Pink",
            } as Record<string, unknown>,
            created_at: "2026-05-16T00:00:00Z",
        };
        render(
            <SectionPicker
                open
                onClose={onClose}
                pageId="home"
                onAdd={onAdd}
                presets={[presetRow] as never}
                onDeletePreset={onDeletePreset}
            />,
        );
        fireEvent.click(screen.getByTestId("section-picker-tab-presets"));
        expect(screen.getByTestId("section-picker-preset-p1")).toBeTruthy();
        fireEvent.click(screen.getByTestId("section-picker-preset-p1-pick"));
        expect(onAdd).toHaveBeenCalledTimes(1);
        const inst = onAdd.mock.calls[0][0] as SectionInstance;
        // Fresh runtime id (not blank, not "__template-…").
        expect(inst.id.length).toBeGreaterThan(0);
        expect(inst.type).toBe("hero_image");
        expect(inst.label).toBe("Pink");
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("prefixes thumbnails with the storefront origin when provided", () => {
        render(
            <SectionPicker
                open
                onClose={() => {}}
                pageId="home"
                storefrontUrl="http://localhost:3001/s/test-store"
                onAdd={() => {}}
            />,
        );
        const card = screen.getByTestId("section-picker-card-hero_image");
        const img = card.querySelector("img");
        expect(img?.getAttribute("src")).toBe(
            "http://localhost:3001/sections/hero_image.svg",
        );
    });
});
