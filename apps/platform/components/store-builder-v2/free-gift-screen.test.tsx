/// <reference types="vitest/globals" />
// @vitest-environment jsdom

import { describe, it, expect, vi, afterEach } from "vitest";
import { render as rtlRender, screen, fireEvent, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { StoreConfigV2, FreeGiftRewardConfig } from "@scheniders/shared";
import type { UseStoreBuilderV2Return } from "@/hooks/use-store-builder-v2";
import { FreeGiftScreen } from "./free-gift-screen";

afterEach(cleanup);

/** The product picker reads the catalogue through react-query; give it a client
 *  with retry off so a hook with no session settles immediately. */
function render(ui: React.ReactElement) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    return rtlRender(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

function makeBuilder(free_gift?: FreeGiftRewardConfig) {
    const setConfig = vi.fn();
    const config = {
        schema_version: 2,
        commerce: free_gift ? { free_gift } : undefined,
    } as unknown as StoreConfigV2;
    return { builder: { config, setConfig } as unknown as UseStoreBuilderV2Return, setConfig, config };
}

function applyLast(setConfig: ReturnType<typeof vi.fn>, config: StoreConfigV2): StoreConfigV2 {
    const updater = setConfig.mock.calls.at(-1)?.[0] as (c: StoreConfigV2) => StoreConfigV2;
    return updater(config);
}

describe("FreeGiftScreen", () => {
    it("toggles enabled", () => {
        const { builder, setConfig, config } = makeBuilder();
        render(<FreeGiftScreen builder={builder} onClose={() => {}} />);
        fireEvent.click(screen.getByTestId("free-gift-enabled"));
        expect(applyLast(setConfig, config).commerce?.free_gift?.enabled).toBe(true);
    });

    it("stores the threshold as whole IQD", () => {
        const { builder, setConfig, config } = makeBuilder({ enabled: true });
        render(<FreeGiftScreen builder={builder} onClose={() => {}} />);
        fireEvent.change(screen.getByTestId("free-gift-threshold"), { target: { value: "75000.4" } });
        expect(applyLast(setConfig, config).commerce?.free_gift?.threshold_iqd).toBe(75000);
    });

    it("warns that the gift is not live until product and threshold are set", () => {
        // This is the storefront's own rule surfaced where it can be fixed:
        // enabled alone must not make the cart promise a gift.
        const { builder } = makeBuilder({ enabled: true });
        render(<FreeGiftScreen builder={builder} onClose={() => {}} />);
        expect(screen.getByTestId("free-gift-incomplete")).toBeTruthy();
    });

    it("drops the warning once all three are set", () => {
        const { builder } = makeBuilder({ enabled: true, product_id: "p1", threshold_iqd: 50000 });
        render(<FreeGiftScreen builder={builder} onClose={() => {}} />);
        expect(screen.queryByTestId("free-gift-incomplete")).toBeNull();
    });

    it("does not warn while the feature is off", () => {
        const { builder } = makeBuilder({ enabled: false });
        render(<FreeGiftScreen builder={builder} onClose={() => {}} />);
        expect(screen.queryByTestId("free-gift-incomplete")).toBeNull();
    });

    it("closes", () => {
        const onClose = vi.fn();
        const { builder } = makeBuilder();
        render(<FreeGiftScreen builder={builder} onClose={onClose} />);
        fireEvent.click(screen.getByTestId("free-gift-close"));
        expect(onClose).toHaveBeenCalled();
    });
});
