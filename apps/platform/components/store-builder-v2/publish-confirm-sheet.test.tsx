/// <reference types="vitest/globals" />
// @vitest-environment jsdom

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import type {
    BrandKit,
    StoreConfigV2,
    SectionInstance,
    CheckResult,
    HealthCheck,
} from "@scheniders/shared";

import { PublishConfirmSheet } from "./publish-confirm-sheet";

const emptyBrandKit: BrandKit = {
    identity: {},
    colors: {
        primary: "#000",
        secondary: "#111",
        accent: "#222",
        surface: "#fff",
        surface_alt: "#eee",
        ink: "#000",
        success: "#0f0",
        danger: "#f00",
    },
    typography: { display: "Inter", body: "Inter", scale: "comfortable" },
    shape: {
        radius: "soft",
        border_thickness: "thin",
        shadow_style: "soft",
        rotation_intensity: "subtle",
    },
    motion: { enabled: true, speed: "normal" },
    voice: { formality: "casual" },
};

function makeConfig(overrides: Partial<StoreConfigV2> = {}): StoreConfigV2 {
    return {
        schema_version: 2,
        brand_kit: emptyBrandKit,
        pages: [],
        globals: {},
        experiments: [],
        segments: [],
        schedules: [],
        default_locale: "en",
        enabled_locales: ["en"],
        ...overrides,
    };
}

function makeSection(
    id: string,
    type: string,
    base: Record<string, unknown> = {},
    overrides: Partial<SectionInstance> = {},
): SectionInstance {
    return { id, type, enabled: true, base, ...overrides };
}

afterEach(() => cleanup());

describe("PublishConfirmSheet — diff section", () => {
    it("shows 'First publish — everything is new.' copy when publishedConfig is null", () => {
        const config = makeConfig({
            pages: [
                { page_id: "home", sections: [makeSection("s1", "hero_image", {})] },
            ],
        });
        render(
            <PublishConfirmSheet
                open
                blockingChecks={[]}
                onClose={() => {}}
                onPublishAnyway={() => {}}
                onJumpToFix={() => {}}
                config={config}
                publishedConfig={null}
            />,
        );
        expect(screen.getByTestId("publish-confirm-sheet")).toBeTruthy();
        expect(screen.getByTestId("publish-diff")).toBeTruthy();
        expect(screen.getByTestId("publish-diff-first-publish").textContent).toMatch(
            /First publish/i,
        );
    });

    it("shows added / removed / modified groupings against a prior publishedConfig", () => {
        const prev = makeConfig({
            pages: [
                {
                    page_id: "home",
                    sections: [
                        makeSection("s1", "hero_image", {
                            title_i18n: { en: "Welcome" },
                        }),
                        makeSection("s-rm", "trust_strip", {}),
                    ],
                },
            ],
        });
        const next = makeConfig({
            pages: [
                {
                    page_id: "home",
                    sections: [
                        makeSection("s1", "hero_image", {
                            title_i18n: { en: "Grand Opening" },
                        }),
                        makeSection("s2", "newsletter_inline", {}),
                    ],
                },
            ],
        });

        render(
            <PublishConfirmSheet
                open
                blockingChecks={[]}
                onClose={() => {}}
                onPublishAnyway={() => {}}
                onJumpToFix={() => {}}
                config={next}
                publishedConfig={prev}
            />,
        );
        expect(screen.getByTestId("publish-diff")).toBeTruthy();
        expect(screen.getByTestId("publish-diff-page-home")).toBeTruthy();
        // Counts pill — 1 added, 1 removed, 1 modified.
        expect(screen.getByTestId("publish-diff-page-home-added-count").textContent).toContain("1");
        expect(screen.getByTestId("publish-diff-page-home-removed-count").textContent).toContain("1");
        expect(screen.getByTestId("publish-diff-page-home-modified-count").textContent).toContain("1");
        expect(screen.getByTestId("publish-diff-section-home-s1")).toBeTruthy();
        expect(screen.getByTestId("publish-diff-section-home-s2")).toBeTruthy();
        expect(screen.getByTestId("publish-diff-section-home-s-rm")).toBeTruthy();
    });

    it("expands a modified section to show per-field deltas", () => {
        const prev = makeConfig({
            pages: [
                {
                    page_id: "home",
                    sections: [
                        makeSection("s1", "hero_image", {
                            title_i18n: { en: "Welcome" },
                            image_url: "https://a.example/x.png",
                        }),
                    ],
                },
            ],
        });
        const next = makeConfig({
            pages: [
                {
                    page_id: "home",
                    sections: [
                        makeSection("s1", "hero_image", {
                            title_i18n: { en: "Grand Opening 20% OFF" },
                            image_url: "https://b.example/x.png",
                        }),
                    ],
                },
            ],
        });
        render(
            <PublishConfirmSheet
                open
                blockingChecks={[]}
                onClose={() => {}}
                onPublishAnyway={() => {}}
                onJumpToFix={() => {}}
                config={next}
                publishedConfig={prev}
            />,
        );
        // Click the modified section to expand deltas.
        fireEvent.click(screen.getByTestId("publish-diff-section-toggle-s1"));
        const deltas = screen.getByTestId("publish-diff-section-deltas-s1");
        expect(deltas).toBeTruthy();
        // The new title shows up inside the deltas list.
        expect(deltas.textContent).toContain("Grand Opening 20% OFF");
        expect(deltas.textContent).toContain("Image URL");
    });

    it("renders the existing blocking warnings list when checks are passed", () => {
        const check: HealthCheck & CheckResult = {
            id: "missing-cta",
            label: "Missing CTA",
            description: "",
            category: "content",
            severity: "blocks_publish",
            blocks_publish: true,
            status: "fail",
            message: "Hero section is missing a CTA",
        } as unknown as HealthCheck & CheckResult;
        render(
            <PublishConfirmSheet
                open
                blockingChecks={[check]}
                onClose={() => {}}
                onPublishAnyway={() => {}}
                onJumpToFix={() => {}}
                config={makeConfig({})}
                publishedConfig={null}
            />,
        );
        expect(screen.getByTestId("publish-confirm-sheet-item-missing-cta")).toBeTruthy();
    });

    it("clicking 'Publish anyway' fires onPublishAnyway", () => {
        const onPublishAnyway = vi.fn();
        render(
            <PublishConfirmSheet
                open
                blockingChecks={[]}
                onClose={() => {}}
                onPublishAnyway={onPublishAnyway}
                onJumpToFix={() => {}}
                config={makeConfig({})}
                publishedConfig={null}
            />,
        );
        fireEvent.click(screen.getByTestId("publish-confirm-sheet-publish-anyway"));
        expect(onPublishAnyway).toHaveBeenCalledTimes(1);
    });
});
