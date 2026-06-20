/// <reference types="vitest/globals" />

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import type { StoreConfigV2, CartRecoveryConfig } from "@scheniders/shared";
import type { UseStoreBuilderV2Return } from "@/hooks/use-store-builder-v2";
import { CartRecoveryScreen } from "./cart-recovery-screen";

afterEach(cleanup);

function makeBuilder(cart_recovery?: CartRecoveryConfig) {
    const setConfig = vi.fn();
    const config = {
        schema_version: 2,
        commerce: cart_recovery ? { cart_recovery } : undefined,
    } as unknown as StoreConfigV2;
    return { builder: { config, setConfig } as unknown as UseStoreBuilderV2Return, setConfig, config };
}

function applyLast(setConfig: ReturnType<typeof vi.fn>, config: StoreConfigV2): StoreConfigV2 {
    const updater = setConfig.mock.calls.at(-1)?.[0] as (c: StoreConfigV2) => StoreConfigV2;
    return updater(config);
}

describe("CartRecoveryScreen", () => {
    it("toggles enabled", () => {
        const { builder, setConfig, config } = makeBuilder();
        render(<CartRecoveryScreen builder={builder} onClose={() => {}} />);
        fireEvent.click(screen.getByTestId("cart-recovery-enabled"));
        expect(applyLast(setConfig, config).commerce?.cart_recovery?.enabled).toBe(true);
    });

    it("edits the delay", () => {
        const { builder, setConfig, config } = makeBuilder({ enabled: true, delay_minutes: 30 });
        render(<CartRecoveryScreen builder={builder} onClose={() => {}} />);
        fireEvent.change(screen.getByTestId("cart-recovery-delay"), {
            target: { value: "120" },
        });
        expect(applyLast(setConfig, config).commerce?.cart_recovery?.delay_minutes).toBe(120);
    });
});
