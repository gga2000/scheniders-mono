/// <reference types="vitest/globals" />

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import type { StoreConfigV2, Bundle } from "@scheniders/shared";
import type { UseStoreBuilderV2Return } from "@/hooks/use-store-builder-v2";

const toastMock = vi.fn();
vi.mock("@/hooks/use-toast", () => ({ toast: (arg: unknown) => toastMock(arg) }));

vi.mock("@/hooks/use-products-query", () => ({
    useProductsQuery: () => ({
        data: [
            { id: "p1", name: "Alpha" },
            { id: "p2", name: "Beta" },
        ],
    }),
}));

import { BundlesScreen } from "./bundles-screen";

afterEach(cleanup);

function makeBuilder(bundles?: Bundle[]) {
    const setConfig = vi.fn();
    const config = {
        schema_version: 2,
        commerce: bundles ? { bundles } : undefined,
    } as unknown as StoreConfigV2;
    return { builder: { config, setConfig } as unknown as UseStoreBuilderV2Return, setConfig, config };
}

function applyLast(setConfig: ReturnType<typeof vi.fn>, config: StoreConfigV2): StoreConfigV2 {
    const updater = setConfig.mock.calls.at(-1)?.[0] as (c: StoreConfigV2) => StoreConfigV2;
    return updater(config);
}

describe("BundlesScreen", () => {
    it("adds a first bundle", () => {
        const { builder, setConfig, config } = makeBuilder();
        render(<BundlesScreen builder={builder} onClose={() => {}} />);
        fireEvent.click(screen.getByTestId("bundles-empty-add"));
        const next = applyLast(setConfig, config).commerce?.bundles;
        expect(next).toHaveLength(1);
        expect(next?.[0]).toMatchObject({ kind: "percent", enabled: false, product_ids: [] });
    });

    it("a bundle with fewer than two products cannot read as switched on", () => {
        const { builder } = makeBuilder([
            { id: "x", product_ids: ["p1"], kind: "percent", value: 10, enabled: true },
        ]);
        render(<BundlesScreen builder={builder} onClose={() => {}} />);
        const toggle = screen.getByTestId("bundle-enabled-0") as HTMLButtonElement;
        expect(toggle.getAttribute("aria-checked")).toBe("false");
        expect(toggle.disabled).toBe(true);
    });

    it("toggles a product into a bundle", () => {
        const { builder, setConfig, config } = makeBuilder([
            { id: "x", product_ids: [], kind: "percent", value: 10, enabled: true },
        ]);
        render(<BundlesScreen builder={builder} onClose={() => {}} />);
        fireEvent.click(screen.getByTestId("bundle-0-product-p1"));
        expect(applyLast(setConfig, config).commerce?.bundles?.[0].product_ids).toEqual(["p1"]);
    });

    it("edits the discount value", () => {
        const { builder, setConfig, config } = makeBuilder([
            { id: "x", product_ids: ["p1", "p2"], kind: "percent", value: 10, enabled: true },
        ]);
        render(<BundlesScreen builder={builder} onClose={() => {}} />);
        fireEvent.change(screen.getByTestId("bundle-value-0"), {
            target: { value: "25" },
        });
        expect(applyLast(setConfig, config).commerce?.bundles?.[0].value).toBe(25);
    });

    it("names a bundle in the editor's language and clears it when emptied", () => {
        const { builder, setConfig, config } = makeBuilder([
            { id: "x", product_ids: [], kind: "percent", value: 10, enabled: true },
        ]);
        render(<BundlesScreen builder={builder} onClose={() => {}} />);
        fireEvent.change(screen.getByTestId("bundle-name-0"), { target: { value: "Summer duo" } });
        expect(Object.values(applyLast(setConfig, config).commerce?.bundles?.[0].name ?? {})).toEqual(["Summer duo"]);
    });

    it("search narrows the list, picked products stay visible as chips", () => {
        const { builder, setConfig, config } = makeBuilder([
            { id: "x", product_ids: ["p2"], kind: "percent", value: 10, enabled: true },
        ]);
        render(<BundlesScreen builder={builder} onClose={() => {}} />);
        fireEvent.change(screen.getByTestId("bundle-0-search"), { target: { value: "alp" } });
        expect(screen.getByTestId("bundle-0-product-p1")).toBeTruthy();
        expect(screen.queryByTestId("bundle-0-product-p2")).toBeNull();
        expect(screen.getByTestId("bundle-0-picked").textContent).toContain("Beta");
        fireEvent.click(screen.getByTestId("bundle-0-unpick-p2"));
        expect(applyLast(setConfig, config).commerce?.bundles?.[0].product_ids).toEqual([]);
    });

    it("says so when nothing matches the search", () => {
        const { builder } = makeBuilder([
            { id: "x", product_ids: [], kind: "percent", value: 10, enabled: true },
        ]);
        render(<BundlesScreen builder={builder} onClose={() => {}} />);
        fireEvent.change(screen.getByTestId("bundle-0-search"), { target: { value: "zzz" } });
        expect(screen.getByTestId("bundle-0-no-match")).toBeTruthy();
    });

    it("dropping under two products switches the bundle off, so a new pick never turns it on", () => {
        const { builder, setConfig, config } = makeBuilder([
            { id: "x", product_ids: ["p1", "p2"], kind: "percent", value: 10, enabled: true },
        ]);
        render(<BundlesScreen builder={builder} onClose={() => {}} />);
        fireEvent.click(screen.getByTestId("bundle-0-product-p2"));
        expect(applyLast(setConfig, config).commerce?.bundles?.[0]).toMatchObject({ product_ids: ["p1"], enabled: false });
    });

    it("removing a bundle offers an undo that puts it back in place", () => {
        toastMock.mockClear();
        const a: Bundle = { id: "a", product_ids: [], kind: "percent", value: 10, enabled: false };
        const b: Bundle = { id: "b", product_ids: [], kind: "percent", value: 5, enabled: false };
        const { builder, setConfig, config } = makeBuilder([a, b]);
        render(<BundlesScreen builder={builder} onClose={() => {}} />);
        fireEvent.click(screen.getByTestId("bundle-remove-0"));
        expect(applyLast(setConfig, config).commerce?.bundles).toEqual([b]);
        const arg = toastMock.mock.calls[0][0] as { action: { onClick: () => void } };
        arg.action.onClick();
        expect(applyLast(setConfig, config).commerce?.bundles).toEqual([a, b]);
    });
});
