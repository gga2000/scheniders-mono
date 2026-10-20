/// <reference types="vitest/globals" />
// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render as rtlRender, screen, fireEvent, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * Reference fields (product_id, *_href, …) render resource pickers, which
 * read the catalogue through react-query. Wrap every render so those fields
 * mount; retry is off so a hook with no session settles immediately.
 */
function render(ui: React.ReactElement) {
    const client = new QueryClient({
        defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    return rtlRender(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}
import type { SectionInstance } from "@scheniders/shared";

vi.mock("@/lib/supabase", () => ({
    supabase: {
        storage: {
            from: () => ({
                upload: () => Promise.resolve({ error: null }),
                getPublicUrl: () => ({ data: { publicUrl: "https://example.com/x.png" } }),
            }),
        },
    },
}));

vi.mock("@/hooks/use-toast", () => ({
    toast: { success: vi.fn(), error: vi.fn() },
}));

import { SectionEditPanel } from "./section-edit-panel";

function heroInstance(overrides: Partial<SectionInstance> = {}): SectionInstance {
    return {
        id: "sec-hero-1",
        type: "hero_image",
        enabled: true,
        label: "",
        base: {
            title_i18n: { en: "Welcome!" },
            subtitle_i18n: { en: "Shop now." },
            cta_label_i18n: { en: "Shop" },
            cta_href: "/products",
            image_url: undefined,
            secondary_cta_kind: "none",
            secondary_cta_value: "",
            secondary_cta_label_i18n: { en: "Chat" },
            eyebrow_i18n: { en: "New" },
        },
        variants: [],
        ...overrides,
    };
}

beforeEach(() => {
    vi.clearAllMocks();
});

afterEach(() => {
    cleanup();
});

describe("SectionEditPanel", () => {
    it("renders hero_image instance with its current props in editable fields", () => {
        render(
            <SectionEditPanel
                instance={heroInstance()}
                onChange={() => {}}
                onClose={() => {}}
            />,
        );
        expect(screen.getByTestId("section-edit-panel")).toBeTruthy();
        // Section name header derived from manifest.
        expect(screen.getByText("Image hero")).toBeTruthy();
        // AutoForm rendered base properties — i18n title field present.
        // hero_image is grouped (Essentials/Style/Logic), so title_i18n
        // lives under the Essentials group and cta_href under Logic.
        expect(
            screen.getByTestId("auto-form-essential.title_i18n-root"),
        ).toBeTruthy();
        // Open the Logic group so its controls mount, then assert cta_href.
        // It renders as a link picker (see lib/section-field-widgets.ts):
        // "/products" is a store page, so the page <select> is preselected
        // with the stored value.
        fireEvent.click(screen.getByTestId("auto-form-group-logic-toggle"));
        const ctaPicker = screen.getByTestId(
            "auto-form-logic.cta_href-picker",
        ) as HTMLSelectElement;
        expect(ctaPicker.tagName).toBe("SELECT");
        expect(ctaPicker.value).toBe("/products");
    });

    it("changing the section label calls onChange with the updated label", () => {
        const onChange = vi.fn();
        render(
            <SectionEditPanel
                instance={heroInstance()}
                onChange={onChange}
                onClose={() => {}}
            />,
        );
        const labelInput = screen.getByTestId("section-edit-panel-label") as HTMLInputElement;
        fireEvent.change(labelInput, { target: { value: "Hero — Summer Sale" } });
        expect(onChange).toHaveBeenCalledTimes(1);
        const next = onChange.mock.calls[0][0] as SectionInstance;
        expect(next.label).toBe("Hero — Summer Sale");
    });

    it("toggling enabled calls onChange with `enabled: !enabled`", () => {
        const onChange = vi.fn();
        render(
            <SectionEditPanel
                instance={heroInstance({ enabled: true })}
                onChange={onChange}
                onClose={() => {}}
            />,
        );
        fireEvent.click(screen.getByTestId("section-edit-panel-enabled"));
        expect(onChange).toHaveBeenCalledTimes(1);
        const next = onChange.mock.calls[0][0] as SectionInstance;
        expect(next.enabled).toBe(false);
    });

    it("closing fires onClose", () => {
        const onClose = vi.fn();
        render(
            <SectionEditPanel
                instance={heroInstance()}
                onChange={() => {}}
                onClose={onClose}
            />,
        );
        fireEvent.click(screen.getByTestId("section-edit-panel-close"));
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("shows the variants empty state when no variants are present", () => {
        render(
            <SectionEditPanel
                instance={heroInstance({ variants: [] })}
                onChange={() => {}}
                onClose={() => {}}
            />,
        );
        expect(screen.getByTestId("variant-list-empty")).toBeTruthy();
    });

    it("shows the visibility 'always visible' empty state when no rules are set", () => {
        render(
            <SectionEditPanel
                instance={heroInstance({ visibility: undefined })}
                onChange={() => {}}
                onClose={() => {}}
            />,
        );
        expect(screen.getByTestId("section-edit-panel-visibility")).toBeTruthy();
        expect(
            screen.getByTestId("section-edit-panel-visibility-empty"),
        ).toBeTruthy();
    });

    it("renders existing visibility rules as removable chips", () => {
        const onChange = vi.fn();
        render(
            <SectionEditPanel
                instance={heroInstance({
                    visibility: [
                        { kind: "locale", values: ["ar"] },
                        { kind: "breakpoint", values: ["mobile"] },
                    ],
                })}
                onChange={onChange}
                onClose={() => {}}
            />,
        );
        expect(
            screen.getByTestId("section-edit-panel-visibility-chip-0"),
        ).toBeTruthy();
        expect(
            screen.getByTestId("section-edit-panel-visibility-chip-1"),
        ).toBeTruthy();
        // Remove the first chip → onChange fires with remaining rule.
        fireEvent.click(
            screen.getByTestId("section-edit-panel-visibility-chip-0-remove"),
        );
        expect(onChange).toHaveBeenCalledTimes(1);
        const next = onChange.mock.calls[0][0] as SectionInstance;
        expect(next.visibility).toEqual([
            { kind: "breakpoint", values: ["mobile"] },
        ]);
    });

    it("clicking an 'Add visibility kind' button opens the wizard", () => {
        render(
            <SectionEditPanel
                instance={heroInstance({ visibility: undefined })}
                onChange={() => {}}
                onClose={() => {}}
            />,
        );
        fireEvent.click(
            screen.getByTestId("section-edit-panel-visibility-add-locale"),
        );
        // The reused VariantAddWizard is the same modal used for variant
        // conditions — we just check it's in the DOM (step 2 view).
        expect(screen.getByTestId("variant-add-wizard")).toBeTruthy();
    });

    it("lists variants when present", () => {
        render(
            <SectionEditPanel
                instance={heroInstance({
                    variants: [
                        {
                            id: "v1",
                            label: "Arabic",
                            conditions: [{ kind: "locale", values: ["ar"] }],
                            override: {},
                            priority: 1,
                        },
                    ],
                })}
                onChange={() => {}}
                onClose={() => {}}
            />,
        );
        expect(screen.getByTestId("variant-row-v1")).toBeTruthy();
        expect(screen.getByText("Arabic")).toBeTruthy();
    });
});
