/// <reference types="vitest/globals" />

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import type { StoreConfigV2, Bundle } from "@scheniders/shared";
import type { UseStoreBuilderV2Return } from "@/hooks/use-store-builder-v2";

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
        expect(next?.[0]).toMatchObject({ kind: "percent", enabled: true, product_ids: [] });
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
});
