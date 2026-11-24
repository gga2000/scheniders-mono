/// <reference types="vitest/globals" />
// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LanguageProvider } from "@/components/providers/language-provider";

const TENANT = "b5c4f2d4-834f-4af4-822d-9b9826a8f45a";

vi.mock("@/lib/supabase", async () =>
    (await import("@/lib/__fixtures__/recording-supabase")).recordingSupabaseModule());
vi.mock("@/components/auth/auth-provider", () => ({ useAuth: () => ({ tenantId: TENANT }) }));
vi.mock("@/hooks/use-toast", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));

import { respond, resetRecording } from "@/lib/__fixtures__/recording-supabase";
import { BusinessSettings, storeColors } from "./business-settings";

afterEach(() => {
    cleanup();
    resetRecording();
});

describe("BusinessSettings", () => {
    it("opens with the shop's own details even when the short tenant row is already cached (audit R3 UI-1)", async () => {
        respond((q) => (q.target === "tenants"
            ? {
                data: {
                    id: TENANT, business_name: "Scheniders Iraq", contact_email: "shop@example.com",
                    contact_phone: "07700000000", city: "Baghdad", address: null, plan: "internal", status: "active",
                    branding: { primary_color: "#111111", secondary_color: "#222222", logo_url: null },
                    store_config: { hero: {}, contact: {} },
                },
                error: null,
            }
            : { data: null, error: null }));
        const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
        // What useTenant() (mounted by the layout) has already cached by the time Settings opens.
        client.setQueryData(["tenant", TENANT], { id: TENANT, status: "active", trial_ends_at: null, plan: "internal", restrictions: null, display_id: 100012 });

        render(
            <QueryClientProvider client={client}>
                <LanguageProvider>
                    <BusinessSettings />
                </LanguageProvider>
            </QueryClientProvider>,
        );

        expect(await screen.findByDisplayValue("Scheniders Iraq")).toBeTruthy();
        expect(screen.getByDisplayValue("shop@example.com")).toBeTruthy();
        // The colours show read-only (they are edited in the store editor).
        expect(screen.getByText("#111111")).toBeTruthy();
    });
});

describe("storeColors", () => {
    it("shows the store editor's colours first, else the old branding pair", () => {
        expect(storeColors({
            store_config_v2: { brand_kit: { colors: { primary: "#000000", secondary: "#ffffff", accent: "#ff0000" } } },
            branding: { logo_url: null, primary_color: "#111111", secondary_color: "#222222" },
        })).toEqual(["#000000", "#ffffff", "#ff0000"]);
        expect(storeColors({
            store_config_v2: null,
            branding: { logo_url: null, primary_color: "#111111", secondary_color: "#222222" },
        })).toEqual(["#111111", "#222222"]);
        expect(storeColors({ store_config_v2: null, branding: null })).toEqual([]);
    });
});
