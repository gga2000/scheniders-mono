/// <reference types="vitest/globals" />

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import type { StoreConfigV2, GovernorateShippingConfig } from "@scheniders/shared";
import type { UseStoreBuilderV2Return } from "@/hooks/use-store-builder-v2";
import { ShippingScreen } from "./shipping-screen";

afterEach(cleanup);

function makeBuilder(shipping?: GovernorateShippingConfig) {
    const setConfig = vi.fn();
    const config = {
        schema_version: 2,
        commerce: shipping ? { shipping } : undefined,
    } as unknown as StoreConfigV2;
    return { builder: { config, setConfig } as unknown as UseStoreBuilderV2Return, setConfig, config };
}

function applyLast(setConfig: ReturnType<typeof vi.fn>, config: StoreConfigV2): StoreConfigV2 {
    const updater = setConfig.mock.calls.at(-1)?.[0] as (c: StoreConfigV2) => StoreConfigV2;
    return updater(config);
}

describe("ShippingScreen", () => {
    it("renders + sets the default rate fee", () => {
        const { builder, setConfig, config } = makeBuilder();
        render(<ShippingScreen builder={builder} onClose={() => {}} />);
        expect(screen.getByTestId("shipping-screen")).toBeTruthy();
        fireEvent.change(screen.getByTestId("shipping-default-fee"), {
            target: { value: "6000" },
        });
        expect(applyLast(setConfig, config).commerce?.shipping?.default_rate).toEqual({
            fee_iqd: 6000,
        });
    });

    it("sets a per-governorate override fee", () => {
        const { builder, setConfig, config } = makeBuilder();
        render(<ShippingScreen builder={builder} onClose={() => {}} />);
        fireEvent.change(screen.getByTestId("shipping-fee-BA"), {
            target: { value: "8000" },
        });
        expect(applyLast(setConfig, config).commerce?.shipping?.rates?.BA).toEqual({
            fee_iqd: 8000,
        });
    });

    it("clearing a governorate fee removes the override", () => {
        const { builder, setConfig, config } = makeBuilder({
            rates: { BA: { fee_iqd: 8000 } },
        });
        render(<ShippingScreen builder={builder} onClose={() => {}} />);
        fireEvent.change(screen.getByTestId("shipping-fee-BA"), {
            target: { value: "" },
        });
        expect(applyLast(setConfig, config).commerce?.shipping?.rates?.BA).toBeUndefined();
    });

    it("toggles the open-before-paying promise without touching the rest of returns_policy", () => {
        const setConfig = vi.fn();
        const config = {
            schema_version: 2,
            commerce: { returns_policy: { window_days: 7 } },
        } as unknown as StoreConfigV2;
        const builder = { config, setConfig } as unknown as UseStoreBuilderV2Return;
        render(<ShippingScreen builder={builder} onClose={() => {}} />);
        const box = screen.getByTestId("shipping-inspect-before-paying") as HTMLInputElement;
        expect(box.checked).toBe(false);
        fireEvent.click(box);
        const on = applyLast(setConfig, config);
        expect(on.commerce?.returns_policy).toEqual({ window_days: 7, inspect_before_paying: true });

        // The mock builder never re-renders, so mount again on the "on" config to turn it off.
        cleanup();
        const setConfig2 = vi.fn();
        render(
            <ShippingScreen
                builder={{ config: on, setConfig: setConfig2 } as unknown as UseStoreBuilderV2Return}
                onClose={() => {}}
            />,
        );
        const box2 = screen.getByTestId("shipping-inspect-before-paying") as HTMLInputElement;
        expect(box2.checked).toBe(true);
        fireEvent.click(box2);
        expect(applyLast(setConfig2, on).commerce?.returns_policy).toEqual({ window_days: 7 });
    });
});
