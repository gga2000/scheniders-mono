/// <reference types="vitest/globals" />

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import type { StoreConfigV2, LoyaltyConfig } from "@scheniders/shared";
import type { UseStoreBuilderV2Return } from "@/hooks/use-store-builder-v2";
import { LoyaltyScreen } from "./loyalty-screen";

afterEach(cleanup);

function makeBuilder(loyalty?: LoyaltyConfig) {
    const setConfig = vi.fn();
    const config = {
        schema_version: 2,
        commerce: loyalty ? { loyalty } : undefined,
    } as unknown as StoreConfigV2;
    return { builder: { config, setConfig } as unknown as UseStoreBuilderV2Return, setConfig, config };
}

function applyLast(setConfig: ReturnType<typeof vi.fn>, config: StoreConfigV2): StoreConfigV2 {
    const updater = setConfig.mock.calls.at(-1)?.[0] as (c: StoreConfigV2) => StoreConfigV2;
    return updater(config);
}

describe("LoyaltyScreen", () => {
    it("toggles enabled", () => {
        const { builder, setConfig, config } = makeBuilder();
        render(<LoyaltyScreen builder={builder} onClose={() => {}} />);
        fireEvent.click(screen.getByTestId("loyalty-enabled"));
        expect(applyLast(setConfig, config).commerce?.loyalty?.enabled).toBe(true);
    });

    it("edits the earn rate + redeem value", () => {
        const { builder, setConfig, config } = makeBuilder({ enabled: true });
        render(<LoyaltyScreen builder={builder} onClose={() => {}} />);
        fireEvent.change(screen.getByTestId("loyalty-earn_per_iqd"), {
            target: { value: "0.001" },
        });
        expect(applyLast(setConfig, config).commerce?.loyalty?.earn_per_iqd).toBe(0.001);
        fireEvent.change(screen.getByTestId("loyalty-redeem_value_iqd"), {
            target: { value: "10" },
        });
        expect(applyLast(setConfig, config).commerce?.loyalty?.redeem_value_iqd).toBe(10);
    });
});
