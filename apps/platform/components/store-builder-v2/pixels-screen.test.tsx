/// <reference types="vitest/globals" />

import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import type { StoreConfigV2, AnalyticsConfig } from "@scheniders/shared";
import type { UseStoreBuilderV2Return } from "@/hooks/use-store-builder-v2";

const rpc = vi.fn();
vi.mock("@/lib/supabase", () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));

import { PixelsScreen } from "./pixels-screen";

const TENANT = "00000000-0000-4000-8000-000000000001";

afterEach(cleanup);
beforeEach(() => {
    rpc.mockReset();
    rpc.mockImplementation(async (fn: string) =>
        fn === "capi_token_status"
            ? {
                  data: [
                      { network: "meta", saved: true, last4: "WXYZ", updated_at: "2026-11-08T00:00:00Z" },
                      { network: "tiktok", saved: false, last4: null, updated_at: null },
                  ],
                  error: null,
              }
            : { data: null, error: null },
    );
});

function renderScreen(builder: UseStoreBuilderV2Return): void {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const ui: ReactElement = <PixelsScreen builder={builder} tenantId={TENANT} onClose={() => {}} />;
    render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

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
        renderScreen(builder);
        fireEvent.change(screen.getByTestId("pixel-meta_pixel_id"), {
            target: { value: "123456789012345" },
        });
        const ap = applyLast(setConfig, config).globals?.analytics_pixels;
        expect(ap?.type).toBe("analytics_pixels");
        expect((ap?.base as AnalyticsConfig).meta_pixel_id).toBe("123456789012345");
    });

    it("shows a saved key as locked with its last four characters, never the key", async () => {
        const { builder } = makeBuilder({ meta_pixel_id: "1" });
        renderScreen(builder);
        expect((await screen.findByTestId("capi-key-meta-last4")).textContent).toContain("WXYZ");
        expect(screen.getByTestId("capi-key-meta-replace")).toBeTruthy();
        // TikTok has no key: the paste box shows.
        expect((screen.getByTestId("capi-key-tiktok-input") as HTMLInputElement).value).toBe("");
        expect(screen.queryByTestId("pixel-meta_capi_token")).toBeNull();
    });

    it("saves a new key through the lockbox, not the design", async () => {
        const { builder, setConfig } = makeBuilder({ meta_pixel_id: "1" });
        renderScreen(builder);
        fireEvent.change(await screen.findByTestId("capi-key-tiktok-input"), { target: { value: " NEWKEY " } });
        fireEvent.click(screen.getByTestId("capi-key-tiktok-save"));
        await waitFor(() =>
            expect(rpc).toHaveBeenCalledWith("set_capi_token", {
                p_tenant_id: TENANT,
                p_network: "tiktok",
                p_token: "NEWKEY",
            }),
        );
        expect(setConfig).not.toHaveBeenCalled();
    });

    it("deletes a key only after the confirm", async () => {
        const { builder } = makeBuilder({ meta_pixel_id: "1" });
        renderScreen(builder);
        fireEvent.click(await screen.findByTestId("capi-key-meta-delete"));
        expect(rpc).not.toHaveBeenCalledWith("set_capi_token", expect.anything());
        fireEvent.click(screen.getByTestId("capi-key-meta-delete-yes"));
        await waitFor(() =>
            expect(rpc).toHaveBeenCalledWith("set_capi_token", {
                p_tenant_id: TENANT,
                p_network: "meta",
                p_token: "",
            }),
        );
    });

    it("tells a non-admin they cannot change keys", async () => {
        rpc.mockImplementation(async (fn: string) =>
            fn === "capi_token_status"
                ? { data: [], error: null }
                : { data: null, error: { code: "42501", message: "forbidden" } },
        );
        const { builder } = makeBuilder({ meta_pixel_id: "1" });
        renderScreen(builder);
        fireEvent.change(await screen.findByTestId("capi-key-meta-input"), { target: { value: "K" } });
        fireEvent.click(screen.getByTestId("capi-key-meta-save"));
        expect((await screen.findByRole("alert")).textContent).toMatch(/admin/i);
    });
});
