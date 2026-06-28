/// <reference types="vitest/globals" />

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import type { StoreConfigV2, AnalyticsConfig } from "@scheniders/shared";
import type { UseStoreBuilderV2Return } from "@/hooks/use-store-builder-v2";
import { PixelsScreen } from "./pixels-screen";

afterEach(cleanup);

function makeBuilder(base?: AnalyticsConfig) {
    const setConfig = vi.fn();
    const config = {
        schema_version: 2,
        globals: base
            ? { analytics_pixels: { id: "x", type: "analytics_pixels", enabled: true, base } }
            : {},
    } as unknown as StoreConfigV2;
    return { builder: { config, setConfig } as unknown as UseStoreBuilderV2Return, setConfig, config };
}

function applyLast(setConfig: ReturnType<typeof vi.fn>, config: StoreConfigV2): StoreConfigV2 {
    const updater = setConfig.mock.calls.at(-1)?.[0] as (c: StoreConfigV2) => StoreConfigV2;
    return updater(config);
}

describe("PixelsScreen", () => {
    it("creates the analytics_pixels instance when setting a pixel id", () => {
        const { builder, setConfig, config } = makeBuilder();
        render(<PixelsScreen builder={builder} onClose={() => {}} />);
        fireEvent.change(screen.getByTestId("pixel-meta_pixel_id"), {
            target: { value: "123456789012345" },
        });
        const ap = applyLast(setConfig, config).globals?.analytics_pixels;
        expect(ap?.type).toBe("analytics_pixels");
        expect((ap?.base as AnalyticsConfig).meta_pixel_id).toBe("123456789012345");
    });

    it("edits a CAPI token on the existing instance", () => {
        const { builder, setConfig, config } = makeBuilder({ meta_pixel_id: "1" });
        render(<PixelsScreen builder={builder} onClose={() => {}} />);
        fireEvent.change(screen.getByTestId("pixel-meta_capi_token"), {
            target: { value: "SECRET" },
        });
        const base = applyLast(setConfig, config).globals?.analytics_pixels
            ?.base as AnalyticsConfig;
        expect(base.meta_capi_token).toBe("SECRET");
        expect(base.meta_pixel_id).toBe("1"); // preserved
    });
});
