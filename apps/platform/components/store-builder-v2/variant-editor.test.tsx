/// <reference types="vitest/globals" />
// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { z } from "zod";
import type { Variant } from "@scheniders/shared";

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

import {
    VariantEditor,
    listOverridablePaths,
    summarizeOverrides,
    setAtPath,
    unsetAtPath,
    getAtPath,
    hasOverrideAtPath,
} from "./variant-editor";

beforeEach(() => {
    vi.clearAllMocks();
});

afterEach(() => {
    cleanup();
});

const i18nSchema = z.object({
    en: z.string().optional(),
    ar: z.string().optional(),
    ku: z.string().optional(),
});

const schema = z.object({
    title: z.string(),
    subtitle: z.string().optional(),
    cta_href: z.string(),
    title_i18n: i18nSchema,
    pills: z.array(z.string()),
});

const base = {
    title: "Hello",
    subtitle: "Shop now",
    cta_href: "/products",
    title_i18n: { en: "Hello" },
    pills: ["one", "two"],
};

function makeVariant(overrides: Partial<Variant> = {}): Variant {
    return {
        id: "v1",
        label: "Arabic",
        conditions: [{ kind: "locale", values: ["ar"] }],
        override: {},
        priority: 1,
        enabled: true,
        ...overrides,
    };
}

describe("VariantEditor — path helpers", () => {
    it("setAtPath sets nested keys without mutating input", () => {
        const a = { foo: { bar: 1 } };
        const b = setAtPath(a, "foo.baz", 2);
        expect(b).toEqual({ foo: { bar: 1, baz: 2 } });
        expect(a).toEqual({ foo: { bar: 1 } }); // unchanged
    });

    it("unsetAtPath removes a key and prunes empty parents", () => {
        const a = { foo: { bar: 1 } };
        const b = unsetAtPath(a, "foo.bar");
        expect(b).toEqual({});
    });

    it("getAtPath reads nested values", () => {
        expect(getAtPath({ a: { b: 5 } }, "a.b")).toBe(5);
        expect(getAtPath({ a: { b: 5 } }, "a.missing")).toBeUndefined();
    });

    it("hasOverrideAtPath returns true only when the path is explicitly set", () => {
        expect(hasOverrideAtPath({ a: { b: 1 } }, "a.b")).toBe(true);
        expect(hasOverrideAtPath({ a: {} }, "a.b")).toBe(false);
        expect(hasOverrideAtPath({}, "a.b")).toBe(false);
    });

    it("listOverridablePaths enumerates leaves, i18n shapes, and arrays", () => {
        const paths = listOverridablePaths(schema).map((p) => `${p.path}:${p.kind}`);
        expect(paths).toContain("title:leaf");
        expect(paths).toContain("subtitle:leaf");
        expect(paths).toContain("cta_href:leaf");
        expect(paths).toContain("title_i18n:i18n");
        expect(paths).toContain("pills:array");
    });

    it("listOverridablePaths skips unions", () => {
        const s = z.object({
            either: z.union([z.string(), z.number()]),
            kept: z.string(),
        });
        const paths = listOverridablePaths(s).map((p) => p.path);
        expect(paths).toContain("kept");
        expect(paths).not.toContain("either");
    });

    it("listOverridablePaths unwraps optional/default/effects", () => {
        const s = z.object({
            a: z.string().optional(),
            b: z.string().default("x"),
            c: z.preprocess((v) => v, z.string()),
        });
        const paths = listOverridablePaths(s).map((p) => p.path).sort();
        expect(paths).toEqual(["a", "b", "c"]);
    });

    it("summarizeOverrides joins up to 3 leaf paths", () => {
        expect(summarizeOverrides({ title: "x" })).toBe("Title");
        expect(summarizeOverrides({ title: "x", cta_href: "/a" })).toContain("Title");
        expect(summarizeOverrides({ title: "x", cta_href: "/a" })).toContain("CTA Href");
        expect(summarizeOverrides({})).toBe("");
    });

    it("summarizeOverrides treats I18nString shape as a leaf", () => {
        const out = summarizeOverrides({ title_i18n: { en: "hi" } });
        expect(out).toBe("Title");
    });

    it("summarizeOverrides shows +N more when overflow", () => {
        const out = summarizeOverrides({
            a: 1,
            b: 2,
            c: 3,
            d: 4,
            e: 5,
        });
        expect(out).toMatch(/\+2 more/);
    });
});

describe("VariantEditor", () => {
    it("returns null when closed", () => {
        const { container } = render(
            <VariantEditor
                open={false}
                variant={makeVariant()}
                schema={schema}
                base={base}
                onChange={() => {}}
                onClose={() => {}}
            />,
        );
        expect(container.firstChild).toBeNull();
    });

    it("renders existing variant with conditions visible", () => {
        render(
            <VariantEditor
                open
                variant={makeVariant()}
                schema={schema}
                base={base}
                onChange={() => {}}
                onClose={() => {}}
            />,
        );
        expect(screen.getByTestId("variant-editor")).toBeTruthy();
        expect(screen.getByTestId("variant-editor-condition-0")).toBeTruthy();
        // New merchant-friendly summary: "When viewing in Arabic"
        expect(screen.getByText(/When viewing in Arabic/)).toBeTruthy();
    });

    it("shows the empty-overrides state when override is {}", () => {
        render(
            <VariantEditor
                open
                variant={makeVariant()}
                schema={schema}
                base={base}
                onChange={() => {}}
                onClose={() => {}}
            />,
        );
        expect(screen.getByTestId("variant-editor-overrides-empty")).toBeTruthy();
    });

    it("renders an override row for each existing override path", () => {
        render(
            <VariantEditor
                open
                variant={makeVariant({ override: { title: "Greeting" } })}
                schema={schema}
                base={base}
                onChange={() => {}}
                onClose={() => {}}
            />,
        );
        expect(screen.getByTestId("variant-editor-field-title")).toBeTruthy();
        expect(screen.getByTestId("variant-editor-field-title-dot")).toBeTruthy();
        expect(screen.queryByTestId("variant-editor-field-subtitle")).toBeNull();
    });

    it("+ Override field picker shows only non-overridden paths", () => {
        render(
            <VariantEditor
                open
                variant={makeVariant({ override: { title: "x" } })}
                schema={schema}
                base={base}
                onChange={() => {}}
                onClose={() => {}}
            />,
        );
        fireEvent.click(screen.getByTestId("variant-editor-add-override"));
        const menu = screen.getByTestId("variant-editor-add-override-menu");
        expect(menu).toBeTruthy();
        expect(screen.queryByTestId("variant-editor-add-override-title")).toBeNull();
        expect(screen.getByTestId("variant-editor-add-override-subtitle")).toBeTruthy();
        expect(screen.getByTestId("variant-editor-add-override-pills")).toBeTruthy();
    });

    it("picking a field from the picker seeds it with the base value", () => {
        const onChange = vi.fn();
        render(
            <VariantEditor
                open
                variant={makeVariant()}
                schema={schema}
                base={base}
                onChange={onChange}
                onClose={() => {}}
            />,
        );
        fireEvent.click(screen.getByTestId("variant-editor-add-override"));
        fireEvent.click(screen.getByTestId("variant-editor-add-override-title"));
        expect(onChange).toHaveBeenCalledTimes(1);
        const next = onChange.mock.calls[0][0] as Variant;
        expect(next.override).toEqual({ title: "Hello" });
    });

    it("Remove override on a field deletes the key from override", () => {
        const onChange = vi.fn();
        render(
            <VariantEditor
                open
                variant={makeVariant({ override: { title: "Greeting" } })}
                schema={schema}
                base={base}
                onChange={onChange}
                onClose={() => {}}
            />,
        );
        fireEvent.click(screen.getByTestId("variant-editor-field-title-remove"));
        expect(onChange).toHaveBeenCalledTimes(1);
        const next = onChange.mock.calls[0][0] as Variant;
        expect(next.override).toEqual({});
    });

    it("editing an overridden field's value updates variant.override", () => {
        const onChange = vi.fn();
        render(
            <VariantEditor
                open
                variant={makeVariant({ override: { title: "Hello" } })}
                schema={schema}
                base={base}
                onChange={onChange}
                onClose={() => {}}
            />,
        );
        const input = screen.getByTestId("auto-form-root.title-input") as HTMLInputElement;
        fireEvent.change(input, { target: { value: "Updated" } });
        const next = onChange.mock.calls[0][0] as Variant;
        expect(next.override).toEqual({ title: "Updated" });
    });

    it("array override replaces base entirely — shows the hint", () => {
        const onChange = vi.fn();
        render(
            <VariantEditor
                open
                variant={makeVariant()}
                schema={schema}
                base={base}
                onChange={onChange}
                onClose={() => {}}
            />,
        );
        fireEvent.click(screen.getByTestId("variant-editor-add-override"));
        fireEvent.click(screen.getByTestId("variant-editor-add-override-pills"));
        const next = onChange.mock.calls[0][0] as Variant;
        // Seeded from base.
        expect(next.override).toEqual({ pills: ["one", "two"] });
        // Re-render with the overridden state to see the hint.
        cleanup();
        render(
            <VariantEditor
                open
                variant={makeVariant({ override: { pills: ["one", "two"] } })}
                schema={schema}
                base={base}
                onChange={() => {}}
                onClose={() => {}}
            />,
        );
        expect(screen.getByTestId("variant-editor-field-pills-array-hint")).toBeTruthy();
        expect(screen.getByText(/replaces base entirely/i)).toBeTruthy();
    });

    it("adding a second condition kind appends to conditions", () => {
        const onChange = vi.fn();
        render(
            <VariantEditor
                open
                variant={makeVariant()}
                schema={schema}
                base={base}
                onChange={onChange}
                onClose={() => {}}
            />,
        );
        fireEvent.click(screen.getByTestId("variant-editor-add-condition"));
        fireEvent.click(screen.getByTestId("variant-editor-add-condition-breakpoint"));
        fireEvent.click(screen.getByTestId("variant-wizard-breakpoint-mobile"));
        fireEvent.click(screen.getByTestId("variant-add-wizard-submit"));
        expect(onChange).toHaveBeenCalled();
        const next = onChange.mock.calls.at(-1)![0] as Variant;
        expect(next.conditions).toHaveLength(2);
        expect(next.conditions[1]).toEqual({
            kind: "breakpoint",
            values: ["mobile"],
        });
    });

    it("removing a condition splices it from the list", () => {
        const onChange = vi.fn();
        render(
            <VariantEditor
                open
                variant={makeVariant({
                    conditions: [
                        { kind: "locale", values: ["ar"] },
                        { kind: "breakpoint", values: ["mobile"] },
                    ],
                })}
                schema={schema}
                base={base}
                onChange={onChange}
                onClose={() => {}}
            />,
        );
        fireEvent.click(screen.getByTestId("variant-editor-condition-0-remove"));
        const next = onChange.mock.calls[0][0] as Variant;
        expect(next.conditions).toHaveLength(1);
        expect(next.conditions[0].kind).toBe("breakpoint");
    });

    it("toggling enabled fires onChange with the inverted flag", () => {
        const onChange = vi.fn();
        render(
            <VariantEditor
                open
                variant={makeVariant({ enabled: true })}
                schema={schema}
                base={base}
                onChange={onChange}
                onClose={() => {}}
            />,
        );
        fireEvent.click(screen.getByTestId("variant-editor-enabled"));
        const next = onChange.mock.calls[0][0] as Variant;
        expect(next.enabled).toBe(false);
    });

    it("editing the label calls onChange with the new label", () => {
        const onChange = vi.fn();
        render(
            <VariantEditor
                open
                variant={makeVariant()}
                schema={schema}
                base={base}
                onChange={onChange}
                onClose={() => {}}
            />,
        );
        fireEvent.change(screen.getByTestId("variant-editor-label"), {
            target: { value: "Renamed" },
        });
        const next = onChange.mock.calls[0][0] as Variant;
        expect(next.label).toBe("Renamed");
    });

    it("Done button fires onClose", () => {
        const onClose = vi.fn();
        render(
            <VariantEditor
                open
                variant={makeVariant()}
                schema={schema}
                base={base}
                onChange={() => {}}
                onClose={onClose}
            />,
        );
        fireEvent.click(screen.getByTestId("variant-editor-done"));
        expect(onClose).toHaveBeenCalled();
    });
});
