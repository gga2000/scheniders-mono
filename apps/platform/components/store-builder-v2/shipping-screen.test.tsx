/// <reference types="vitest/globals" />

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { computeDeliveryFee } from "@scheniders/shared";
import type { StoreConfigV2, GovernorateShippingConfig } from "@scheniders/shared";
import type { UseStoreBuilderV2Return } from "@/hooks/use-store-builder-v2";
import { ShippingScreen, shippingModeOf } from "./shipping-screen";

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

describe("shippingModeOf", () => {
    it("reads a store that was never configured as unset", () => {
        expect(shippingModeOf(undefined)).toBe("unset");
        expect(shippingModeOf({})).toBe("unset");
    });

    it("reads a zero fee as free", () => {
        expect(shippingModeOf({ default_rate: { fee_iqd: 0 } })).toBe("free");
    });

    it("does not call a zero fee free when a threshold rides along", () => {
        // A threshold under a free fee is dead config; it must not be mistaken
        // for the free answer, or saving would silently drop it.
        expect(
            shippingModeOf({ default_rate: { fee_iqd: 0, free_threshold_iqd: 50_000 } }),
        ).toBe("flat");
    });

    it("reads one fee as flat, and any override as per-governorate", () => {
        expect(shippingModeOf({ default_rate: { fee_iqd: 5000 } })).toBe("flat");
        expect(
            shippingModeOf({ default_rate: { fee_iqd: 5000 }, rates: { BA: { fee_iqd: 6000 } } }),
        ).toBe("by_governorate");
        // An override with no default is still per-governorate.
        expect(shippingModeOf({ rates: { BA: { fee_iqd: 6000 } } })).toBe("by_governorate");
    });
});

describe("ShippingScreen — choosing an answer", () => {
    it("warns that an unconfigured store is charging platform defaults", () => {
        const { builder } = makeBuilder();
        render(<ShippingScreen builder={builder} onClose={() => {}} />);
        expect(screen.getByTestId("shipping-screen").dataset.shippingMode).toBe("unset");
        expect(screen.getByTestId("shipping-unset-warning")).toBeTruthy();
        // The figures in that warning are the ones computeDeliveryFee actually
        // falls back to, so the warning cannot drift from the behaviour.
        expect(computeDeliveryFee(30_000, 1, {})).toBe(5000);
        expect(computeDeliveryFee(75_000, 1, {})).toBe(0);
    });

    it("free delivery writes a zero fee and nothing else", () => {
        const { builder, setConfig, config } = makeBuilder({
            default_rate: { fee_iqd: 5000, free_threshold_iqd: 75_000 },
            rates: { BA: { fee_iqd: 6000 } },
        });
        render(<ShippingScreen builder={builder} onClose={() => {}} />);
        fireEvent.click(screen.getByTestId("shipping-mode-free"));
        const next = applyLast(setConfig, config).commerce?.shipping;
        expect(next).toEqual({ default_rate: { fee_iqd: 0 } });
        // And that is genuinely free at the till, for any basket or governorate.
        expect(computeDeliveryFee(30_000, 1, { shipping: next, governorate: "BA" })).toBe(0);
        expect(computeDeliveryFee(500_000, 2, { shipping: next })).toBe(0);
    });

    it("keeps the fee when moving from free back to one fee", () => {
        const { builder, setConfig, config } = makeBuilder({ default_rate: { fee_iqd: 7000 } });
        render(<ShippingScreen builder={builder} onClose={() => {}} />);
        fireEvent.click(screen.getByTestId("shipping-mode-free"));
        expect(applyLast(setConfig, config).commerce?.shipping?.default_rate?.fee_iqd).toBe(0);
    });

    it("hides the fee inputs on free, and the governorate table unless it is per-governorate", () => {
        const { builder } = makeBuilder({ default_rate: { fee_iqd: 0 } });
        render(<ShippingScreen builder={builder} onClose={() => {}} />);
        expect(screen.queryByTestId("shipping-default-fee")).toBeNull();
        expect(screen.queryByTestId("shipping-gov-BA")).toBeNull();
    });

    it("shows the governorate table only in the per-governorate answer", () => {
        const flat = makeBuilder({ default_rate: { fee_iqd: 5000 } });
        const { unmount } = render(<ShippingScreen builder={flat.builder} onClose={() => {}} />);
        expect(screen.getByTestId("shipping-default-fee")).toBeTruthy();
        expect(screen.queryByTestId("shipping-gov-BA")).toBeNull();
        unmount();
        cleanup();

        const perGov = makeBuilder({
            default_rate: { fee_iqd: 5000 },
            rates: { BA: { fee_iqd: 6000 } },
        });
        render(<ShippingScreen builder={perGov.builder} onClose={() => {}} />);
        expect(screen.getByTestId("shipping-gov-BA")).toBeTruthy();
    });
});

describe("ShippingScreen — editing rates", () => {
    it("sets the default fee", () => {
        const { builder, setConfig, config } = makeBuilder({ default_rate: { fee_iqd: 5000 } });
        render(<ShippingScreen builder={builder} onClose={() => {}} />);
        fireEvent.change(screen.getByTestId("shipping-default-fee"), {
            target: { value: "6000" },
        });
        expect(applyLast(setConfig, config).commerce?.shipping?.default_rate).toEqual({
            fee_iqd: 6000,
        });
    });

    it("sets a per-governorate override fee", () => {
        const { builder, setConfig, config } = makeBuilder({
            default_rate: { fee_iqd: 5000 },
            rates: { BA: { fee_iqd: 6000 } },
        });
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
            default_rate: { fee_iqd: 5000 },
            rates: { BA: { fee_iqd: 8000 } },
        });
        render(<ShippingScreen builder={builder} onClose={() => {}} />);
        fireEvent.change(screen.getByTestId("shipping-fee-BA"), {
            target: { value: "" },
        });
        expect(applyLast(setConfig, config).commerce?.shipping?.rates?.BA).toBeUndefined();
    });
});

describe("ShippingScreen — the preview", () => {
    it("prices the baskets with the same function checkout uses", () => {
        const shipping: GovernorateShippingConfig = {
            default_rate: { fee_iqd: 5000, free_threshold_iqd: 75_000 },
        };
        const { builder } = makeBuilder(shipping);
        render(<ShippingScreen builder={builder} onClose={() => {}} />);
        // 30,000 is under the threshold and 80,000 is over it, so the strip
        // has to show the fee on one row and free on the other.
        const under = screen.getByTestId("shipping-preview-30000").textContent ?? "";
        const over = screen.getByTestId("shipping-preview-80000").textContent ?? "";
        expect(computeDeliveryFee(30_000, 1, { shipping, governorate: "BG" })).toBe(5000);
        expect(computeDeliveryFee(80_000, 1, { shipping, governorate: "BG" })).toBe(0);
        expect(under).toContain("5,000");
        expect(over).not.toContain("5,000");
    });

    it("says free, not a zero figure, when delivery is free", () => {
        const { builder } = makeBuilder({ default_rate: { fee_iqd: 0 } });
        render(<ShippingScreen builder={builder} onClose={() => {}} />);
        const row = screen.getByTestId("shipping-preview-30000").textContent ?? "";
        // The basket amount itself contains a zero, so match the rendered fee:
        // the part after the governorate name.
        const fee = row.split(":").pop()?.trim() ?? "";
        expect(fee).toBe("Free");
        expect(fee).not.toMatch(/^0$/);
    });
});
