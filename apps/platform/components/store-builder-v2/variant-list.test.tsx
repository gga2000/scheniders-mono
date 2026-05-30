/// <reference types="vitest/globals" />
// @vitest-environment jsdom

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import type { SectionInstance, Variant } from "@scheniders/shared";

import { VariantList, rewritePriorities } from "./variant-list";

afterEach(() => {
    cleanup();
});

function makeVariant(overrides: Partial<Variant> & { id: string }): Variant {
    return {
        id: overrides.id,
        label: overrides.label ?? overrides.id,
        conditions: overrides.conditions ?? [{ kind: "locale", values: ["ar"] }],
        override: overrides.override ?? {},
        priority: overrides.priority ?? 1,
        enabled: overrides.enabled,
    };
}

function makeInstance(variants: Variant[]): SectionInstance {
    return {
        id: "sec-1",
        type: "hero_image",
        enabled: true,
        base: {},
        variants,
    };
}

describe("VariantList", () => {
    it("shows the empty state when there are 0 variants", () => {
        const onAdd = vi.fn();
        render(
            <VariantList
                instance={makeInstance([])}
                onChange={() => {}}
                onAdd={onAdd}
                onEdit={() => {}}
            />,
        );
        expect(screen.getByTestId("variant-list-empty")).toBeTruthy();
        fireEvent.click(screen.getByTestId("variant-list-empty-add"));
        expect(onAdd).toHaveBeenCalledTimes(1);
    });

    it("renders 3 variants with their labels", () => {
        const variants = [
            makeVariant({ id: "v1", label: "Arabic" }),
            makeVariant({
                id: "v2",
                label: "Mobile only",
                conditions: [{ kind: "breakpoint", values: ["mobile"] }],
            }),
            makeVariant({
                id: "v3",
                label: "New customers",
                conditions: [{ kind: "audience", segment_id: "seg-1" }],
            }),
        ];
        render(
            <VariantList
                instance={makeInstance(variants)}
                onChange={() => {}}
                onAdd={() => {}}
                onEdit={() => {}}
            />,
        );
        expect(screen.getByText("Arabic")).toBeTruthy();
        expect(screen.getByText("Mobile only")).toBeTruthy();
        expect(screen.getByText("New customers")).toBeTruthy();
        expect(screen.getByTestId("variant-list-count").textContent).toContain("3");
    });

    it("delete with confirm removes the variant via onChange", () => {
        const onChange = vi.fn();
        const variants = [makeVariant({ id: "v1" }), makeVariant({ id: "v2" })];
        const confirmSpy = vi
            .spyOn(window, "confirm")
            .mockImplementation(() => true);
        render(
            <VariantList
                instance={makeInstance(variants)}
                onChange={onChange}
                onAdd={() => {}}
                onEdit={() => {}}
            />,
        );
        fireEvent.click(screen.getByTestId("variant-row-v1-delete"));
        expect(confirmSpy).toHaveBeenCalled();
        expect(onChange).toHaveBeenCalledTimes(1);
        const next = onChange.mock.calls[0][0] as Variant[];
        expect(next).toHaveLength(1);
        expect(next[0].id).toBe("v2");
        confirmSpy.mockRestore();
    });

    it("delete is skipped when confirm is rejected", () => {
        const onChange = vi.fn();
        const variants = [makeVariant({ id: "v1" }), makeVariant({ id: "v2" })];
        const confirmSpy = vi
            .spyOn(window, "confirm")
            .mockImplementation(() => false);
        render(
            <VariantList
                instance={makeInstance(variants)}
                onChange={onChange}
                onAdd={() => {}}
                onEdit={() => {}}
            />,
        );
        fireEvent.click(screen.getByTestId("variant-row-v1-delete"));
        expect(onChange).not.toHaveBeenCalled();
        confirmSpy.mockRestore();
    });

    it("disabled variant shows hollow enabled dot", () => {
        const variants = [makeVariant({ id: "v1", enabled: false })];
        render(
            <VariantList
                instance={makeInstance(variants)}
                onChange={() => {}}
                onAdd={() => {}}
                onEdit={() => {}}
            />,
        );
        const dot = screen.getByTestId("variant-row-v1-dot");
        expect(dot.getAttribute("data-enabled")).toBe("false");
    });

    it("enabled variant shows filled enabled dot", () => {
        const variants = [makeVariant({ id: "v1", enabled: true })];
        render(
            <VariantList
                instance={makeInstance(variants)}
                onChange={() => {}}
                onAdd={() => {}}
                onEdit={() => {}}
            />,
        );
        const dot = screen.getByTestId("variant-row-v1-dot");
        expect(dot.getAttribute("data-enabled")).toBe("true");
    });

    it("clicking edit fires onEdit with the variant id", () => {
        const onEdit = vi.fn();
        const variants = [makeVariant({ id: "v1" })];
        render(
            <VariantList
                instance={makeInstance(variants)}
                onChange={() => {}}
                onAdd={() => {}}
                onEdit={onEdit}
            />,
        );
        fireEvent.click(screen.getByTestId("variant-row-v1-edit"));
        expect(onEdit).toHaveBeenCalledWith("v1");
    });

    it("clicking add fires onAdd", () => {
        const onAdd = vi.fn();
        const variants = [makeVariant({ id: "v1" })];
        render(
            <VariantList
                instance={makeInstance(variants)}
                onChange={() => {}}
                onAdd={onAdd}
                onEdit={() => {}}
            />,
        );
        fireEvent.click(screen.getByTestId("variant-list-add"));
        expect(onAdd).toHaveBeenCalledTimes(1);
    });

    it("rewritePriorities maps first item to highest priority number", () => {
        const variants = [
            makeVariant({ id: "v1", priority: 1 }),
            makeVariant({ id: "v2", priority: 1 }),
            makeVariant({ id: "v3", priority: 1 }),
        ];
        const out = rewritePriorities(variants);
        expect(out.map((v) => v.priority)).toEqual([3, 2, 1]);
        // First-array-position wins ties — higher number wins in the resolver.
        expect(out[0].priority).toBeGreaterThan(out[1].priority);
        expect(out[1].priority).toBeGreaterThan(out[2].priority);
    });
});
