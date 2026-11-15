/// <reference types="vitest/globals" />
// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { LanguageProvider } from "@/components/providers/language-provider";

const state: { displayId: number | null } = { displayId: null };

vi.mock("@/components/auth/auth-provider", () => ({
    useAuth: () => ({ tenantId: "b5c4f2d4-0000-4000-8000-000000000000" }),
}));
vi.mock("@/hooks/use-tenant", () => ({
    useTenant: () => ({ data: state.displayId == null ? undefined : { display_id: state.displayId } }),
}));

const { MerchantCodeBadge } = await import("./merchant-code-badge");

afterEach(() => {
    cleanup();
    state.displayId = null;
});

describe("MerchantCodeBadge", () => {
    it("shows no number until the store row arrives", () => {
        const { container } = render(<LanguageProvider><MerchantCodeBadge /></LanguageProvider>);
        expect(container.querySelector("button")).toBeNull();
        expect(container.textContent).toBe("");
    });

    it("shows the store's own number once it is known", () => {
        state.displayId = 100012;
        const { container } = render(<LanguageProvider><MerchantCodeBadge /></LanguageProvider>);
        expect(container.querySelector("button")?.textContent).toBe("100012");
    });
});
