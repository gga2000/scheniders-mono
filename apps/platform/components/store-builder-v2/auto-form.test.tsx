/// <reference types="vitest/globals" />
// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { z } from "zod";

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

import { AutoForm } from "./auto-form";
import { getManifestEntry } from "@/lib/sections-manifest";

beforeEach(() => {
    vi.clearAllMocks();
});

afterEach(() => {
    cleanup();
});

describe("AutoForm", () => {
    it("renders an input for a string field", () => {
        const schema = z.object({ title: z.string() });
        const onChange = vi.fn();
        render(
            <AutoForm
                schema={schema}
                value={{ title: "Hello" }}
                onChange={onChange}
            />,
        );
        const input = screen.getByTestId("auto-form-root.title-input") as HTMLInputElement;
        expect(input.value).toBe("Hello");
        fireEvent.change(input, { target: { value: "World" } });
        expect(onChange).toHaveBeenCalledWith({ title: "World" });
    });

    it("renders a number input for a number field with min/max", () => {
        const schema = z.object({
            count: z.number().int().min(1).max(20),
        });
        render(
            <AutoForm
                schema={schema}
                value={{ count: 5 }}
                onChange={() => {}}
            />,
        );
        const input = screen.getByTestId("auto-form-root.count-input") as HTMLInputElement;
        expect(input.type).toBe("number");
        expect(input.min).toBe("1");
        expect(input.max).toBe("20");
    });

    it("renders a slider for a bounded number and commits drags (C7)", () => {
        const schema = z.object({ opacity: z.number().min(0).max(1) });
        const onChange = vi.fn();
        render(
            <AutoForm
                schema={schema}
                value={{ opacity: 0.5 }}
                onChange={onChange}
            />,
        );
        const slider = screen.getByTestId(
            "auto-form-root.opacity-slider",
        ) as HTMLInputElement;
        expect(slider.type).toBe("range");
        // Float range → fine step.
        expect(slider.step).toBe("0.01");
        fireEvent.change(slider, { target: { value: "0.8" } });
        expect(onChange).toHaveBeenCalledWith({ opacity: 0.8 });
    });

    it("clearing a required number snaps to min, not 0 (C12)", () => {
        const schema = z.object({ limit: z.number().int().min(1).max(20) });
        const onChange = vi.fn();
        render(
            <AutoForm schema={schema} value={{ limit: 5 }} onChange={onChange} />,
        );
        const input = screen.getByTestId(
            "auto-form-root.limit-input",
        ) as HTMLInputElement;
        fireEvent.change(input, { target: { value: "" } });
        expect(onChange).toHaveBeenCalledWith({ limit: 1 });
    });

    it("offers Reset to default when props differ, and resets on click (C2)", () => {
        const defaults = getManifestEntry("trust_strip")?.defaultProps as
            | Record<string, unknown>
            | undefined;
        expect(defaults).toBeTruthy();
        const onChange = vi.fn();
        render(
            <AutoForm
                schema={z.object({})}
                value={{ __changed: true }}
                sectionType="trust_strip"
                onChange={onChange}
            />,
        );
        fireEvent.click(screen.getByTestId("auto-form-reset-default"));
        expect(onChange).toHaveBeenCalledWith(defaults);
    });

    it("hides Reset to default when props already equal the default (C2)", () => {
        const defaults = getManifestEntry("trust_strip")?.defaultProps as
            | Record<string, unknown>
            | undefined;
        render(
            <AutoForm
                schema={z.object({})}
                value={defaults}
                sectionType="trust_strip"
                onChange={() => {}}
            />,
        );
        expect(screen.queryByTestId("auto-form-reset-default")).toBeNull();
    });

    it("renders a switch for a boolean", () => {
        const schema = z.object({ enabled: z.boolean() });
        const onChange = vi.fn();
        render(
            <AutoForm
                schema={schema}
                value={{ enabled: false }}
                onChange={onChange}
            />,
        );
        const sw = screen.getByTestId("auto-form-root.enabled-switch");
        expect(sw.getAttribute("aria-checked")).toBe("false");
        fireEvent.click(sw);
        expect(onChange).toHaveBeenCalledWith({ enabled: true });
    });

    it("renders a segmented control for an enum with 3 options", () => {
        const schema = z.object({
            mode: z.enum(["auto", "manual", "mixed"]),
        });
        render(
            <AutoForm
                schema={schema}
                value={{ mode: "auto" }}
                onChange={() => {}}
            />,
        );
        expect(screen.getByTestId("auto-form-root.mode-segmented")).toBeTruthy();
        expect(screen.getByTestId("auto-form-root.mode-option-auto")).toBeTruthy();
        expect(screen.getByTestId("auto-form-root.mode-option-manual")).toBeTruthy();
        expect(screen.getByTestId("auto-form-root.mode-option-mixed")).toBeTruthy();
    });

    it("renders a dropdown for an enum with 6 options", () => {
        const schema = z.object({
            tint: z.enum(["red", "green", "blue", "yellow", "purple", "orange"]),
        });
        render(
            <AutoForm
                schema={schema}
                value={{ tint: "red" }}
                onChange={() => {}}
            />,
        );
        const select = screen.getByTestId("auto-form-root.tint-select") as HTMLSelectElement;
        expect(select.tagName).toBe("SELECT");
        expect(select.options.length).toBe(6);
    });

    it("recursive object renders nested fields", () => {
        const schema = z.object({
            query: z.object({
                sort: z.string(),
                limit: z.number(),
            }),
        });
        render(
            <AutoForm
                schema={schema}
                value={{ query: { sort: "newest", limit: 8 } }}
                onChange={() => {}}
            />,
        );
        expect(screen.getByTestId("auto-form-root.query-object")).toBeTruthy();
        expect(screen.getByTestId("auto-form-root.query.sort-input")).toBeTruthy();
        expect(screen.getByTestId("auto-form-root.query.limit-input")).toBeTruthy();
    });

    it("array of strings renders repeater with add/remove", () => {
        const schema = z.object({
            tags: z.array(z.string()),
        });
        let current: { tags: string[] } = { tags: ["one"] };
        const onChange = vi.fn((v) => {
            current = v as { tags: string[] };
        });
        const { rerender } = render(
            <AutoForm schema={schema} value={current} onChange={onChange} />,
        );
        expect(screen.getByTestId("auto-form-root.tags-array")).toBeTruthy();
        expect(screen.getByTestId("auto-form-root.tags-item-0")).toBeTruthy();

        fireEvent.click(screen.getByTestId("auto-form-root.tags-add"));
        expect(onChange).toHaveBeenCalled();
        expect(current.tags.length).toBe(2);

        rerender(<AutoForm schema={schema} value={current} onChange={onChange} />);
        fireEvent.click(screen.getByTestId("auto-form-root.tags-item-1-remove"));
        expect(current.tags.length).toBe(1);
    });

    it("I18nString object renders <I18nStringInput />", () => {
        const i18nSchema = z
            .object({
                en: z.string().optional(),
                ar: z.string().optional(),
                ku: z.string().optional(),
            })
            .passthrough();
        const schema = z.object({ title_i18n: i18nSchema });
        render(
            <AutoForm
                schema={schema}
                value={{ title_i18n: { en: "Hi" } }}
                onChange={() => {}}
            />,
        );
        // I18nStringInput emits these test ids using the prefix.
        expect(screen.getByTestId("auto-form-root.title_i18n-root")).toBeTruthy();
        expect(screen.getByTestId("auto-form-root.title_i18n-locale-en")).toBeTruthy();
        expect(screen.getByTestId("auto-form-root.title_i18n-locale-ar")).toBeTruthy();
        expect(screen.getByTestId("auto-form-root.title_i18n-locale-ku")).toBeTruthy();
    });

    it(".describe('multiline') renders textarea instead of input", () => {
        const schema = z.object({
            bio: z.string().describe("multiline"),
        });
        render(
            <AutoForm
                schema={schema}
                value={{ bio: "Long text…" }}
                onChange={() => {}}
            />,
        );
        const ta = screen.getByTestId("auto-form-root.bio-textarea") as HTMLTextAreaElement;
        expect(ta.tagName).toBe("TEXTAREA");
    });

    it(".describe('color') renders color picker", () => {
        const schema = z.object({
            primary: z.string().describe("color"),
        });
        render(
            <AutoForm
                schema={schema}
                value={{ primary: "#ff00aa" }}
                onChange={() => {}}
            />,
        );
        const colorInput = screen.getByTestId("auto-form-root.primary-color") as HTMLInputElement;
        const hexInput = screen.getByTestId("auto-form-root.primary-hex") as HTMLInputElement;
        expect(colorInput.type).toBe("color");
        expect(hexInput.value).toBe("#ff00aa");
    });

    it(".describe('image') renders an image upload control", () => {
        const schema = z.object({
            image_url: z.string().describe("image").optional(),
        });
        render(
            <AutoForm
                schema={schema}
                value={{ image_url: "https://example.com/img.png" }}
                onChange={() => {}}
            />,
        );
        expect(screen.getByTestId("auto-form-root.image_url-preview")).toBeTruthy();
        expect(screen.getByTestId("auto-form-root.image_url-upload")).toBeTruthy();
        expect(screen.getByTestId("auto-form-root.image_url-url")).toBeTruthy();
    });

    it("optional field unset shows Set affordance", () => {
        const schema = z.object({
            note: z.string().optional(),
        });
        const onChange = vi.fn();
        render(
            <AutoForm schema={schema} value={{}} onChange={onChange} />,
        );
        expect(screen.getByTestId("auto-form-root.note-unset")).toBeTruthy();
        fireEvent.click(screen.getByTestId("auto-form-root.note-set"));
        expect(onChange).toHaveBeenCalledWith({ note: "" });
    });

    it("forwards activeLocale to I18nStringInput — defaults to 'en'", () => {
        const i18nSchema = z.object({
            en: z.string().optional(),
            ar: z.string().optional(),
            ku: z.string().optional(),
        });
        const schema = z.object({ title_i18n: i18nSchema });
        render(
            <AutoForm
                schema={schema}
                value={{ title_i18n: { en: "Hi", ar: "مرحبا" } }}
                onChange={() => {}}
            />,
        );
        const root = screen.getByTestId("auto-form-root.title_i18n-root");
        expect(root.getAttribute("data-active-locale")).toBe("en");
        // The primary input shows the English value.
        const primary = screen.getByTestId(
            "auto-form-root.title_i18n-input",
        ) as HTMLInputElement;
        expect(primary.value).toBe("Hi");
    });

    it("passing activeLocale='ar' makes Arabic the primary input", () => {
        const i18nSchema = z.object({
            en: z.string().optional(),
            ar: z.string().optional(),
            ku: z.string().optional(),
        });
        const schema = z.object({ title_i18n: i18nSchema });
        render(
            <AutoForm
                schema={schema}
                value={{ title_i18n: { en: "Hi", ar: "مرحبا" } }}
                onChange={() => {}}
                activeLocale="ar"
            />,
        );
        const root = screen.getByTestId("auto-form-root.title_i18n-root");
        expect(root.getAttribute("data-active-locale")).toBe("ar");
        const primary = screen.getByTestId(
            "auto-form-root.title_i18n-input",
        ) as HTMLInputElement;
        expect(primary.value).toBe("مرحبا");
    });

    it("rerendering with a new activeLocale flips the primary input", () => {
        const i18nSchema = z.object({
            en: z.string().optional(),
            ar: z.string().optional(),
            ku: z.string().optional(),
        });
        const schema = z.object({ title_i18n: i18nSchema });
        const value = { title_i18n: { en: "Hi", ar: "مرحبا", ku: "سڵاو" } };
        const { rerender } = render(
            <AutoForm
                schema={schema}
                value={value}
                onChange={() => {}}
                activeLocale="en"
            />,
        );
        let primary = screen.getByTestId(
            "auto-form-root.title_i18n-input",
        ) as HTMLInputElement;
        expect(primary.value).toBe("Hi");

        rerender(
            <AutoForm
                schema={schema}
                value={value}
                onChange={() => {}}
                activeLocale="ku"
            />,
        );
        primary = screen.getByTestId(
            "auto-form-root.title_i18n-input",
        ) as HTMLInputElement;
        expect(primary.value).toBe("سڵاو");
        const root = screen.getByTestId("auto-form-root.title_i18n-root");
        expect(root.getAttribute("data-active-locale")).toBe("ku");
    });

    it("activeLocale propagates through nested objects and arrays", () => {
        const i18nSchema = z.object({
            en: z.string().optional(),
            ar: z.string().optional(),
            ku: z.string().optional(),
        });
        const schema = z.object({
            pills: z.array(
                z.object({
                    label_i18n: i18nSchema,
                }),
            ),
        });
        render(
            <AutoForm
                schema={schema}
                value={{ pills: [{ label_i18n: { en: "One", ar: "واحد" } }] }}
                onChange={() => {}}
                activeLocale="ar"
            />,
        );
        // Find any i18n-root inside the array — its active locale must be 'ar'.
        const roots = document.querySelectorAll('[data-active-locale="ar"]');
        expect(roots.length).toBeGreaterThanOrEqual(1);
    });

    /* ─ Item 2 (Phase 3c): grouped (Essentials/Style/Logic) renderer ── */

    it("renders Essentials/Style/Logic groups when sectionType is a known section type", () => {
        // Uses hero_image (a known section type). The schema includes fields
        // from all three groups so every accordion renders:
        //   essential → title_i18n  (ends with _i18n)
        //   style     → align       (exact STYLE_EXACT match)
        //   logic     → cta_href    (ends with _href)
        const schema = z.object({
            title_i18n: z.object({
                en: z.string().optional(),
                ar: z.string().optional(),
                ku: z.string().optional(),
            }),
            align: z.enum(["start", "center"]),
            cta_href: z.string(),
        });
        render(
            <AutoForm
                schema={schema}
                value={{ title_i18n: { en: "Hi" }, align: "start", cta_href: "/x" }}
                onChange={() => {}}
                sectionType="hero_image"
            />,
        );
        expect(screen.getByTestId("auto-form-grouped")).toBeTruthy();
        expect(screen.getByTestId("auto-form-group-essential")).toBeTruthy();
        expect(screen.getByTestId("auto-form-group-style")).toBeTruthy();
        expect(screen.getByTestId("auto-form-group-logic")).toBeTruthy();
        // Essentials is open by default → title_i18n (essential) renders.
        expect(screen.getByTestId("auto-form-essential.title_i18n-root")).toBeTruthy();
        // cta_href is logic, group is collapsed by default, so its input
        // should NOT be in the DOM right now.
        expect(
            screen.queryByTestId("auto-form-logic.cta_href-input"),
        ).toBeNull();
    });

    it("toggles a group collapse/expand when its header is clicked", () => {
        const schema = z.object({
            title_i18n: z.object({
                en: z.string().optional(),
                ar: z.string().optional(),
                ku: z.string().optional(),
            }),
            cta_href: z.string(),
        });
        render(
            <AutoForm
                schema={schema}
                value={{ title_i18n: { en: "Hi" }, cta_href: "/x" }}
                onChange={() => {}}
                sectionType="hero_image"
            />,
        );
        const logicToggle = screen.getByTestId("auto-form-group-logic-toggle");
        // Initially collapsed.
        expect(logicToggle.getAttribute("aria-expanded")).toBe("false");
        fireEvent.click(logicToggle);
        expect(logicToggle.getAttribute("aria-expanded")).toBe("true");
        expect(screen.getByTestId("auto-form-group-logic-body")).toBeTruthy();
        // Now the cta_href input mounts inside the logic group.
        expect(screen.getByTestId("auto-form-logic.cta_href-input")).toBeTruthy();
        // Toggle back closed.
        fireEvent.click(logicToggle);
        expect(logicToggle.getAttribute("aria-expanded")).toBe("false");
    });

    it("renders flat (no grouping) when sectionType is omitted or unknown", () => {
        const schema = z.object({ title: z.string() });

        // Case A: sectionType omitted entirely.
        const { rerender, unmount } = render(
            <AutoForm
                schema={schema}
                value={{ title: "x" }}
                onChange={() => {}}
            />,
        );
        expect(screen.queryByTestId("auto-form-grouped")).toBeNull();
        expect(screen.getByTestId("auto-form-root.title-input")).toBeTruthy();

        // Case B: sectionType provided but not registered.
        rerender(
            <AutoForm
                schema={schema}
                value={{ title: "x" }}
                onChange={() => {}}
                sectionType="totally_unknown_section_type"
            />,
        );
        expect(screen.queryByTestId("auto-form-grouped")).toBeNull();
        expect(screen.getByTestId("auto-form-root.title-input")).toBeTruthy();
        unmount();
    });
});
