/// <reference types="vitest/globals" />
// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { LanguageProvider } from "@/components/providers/language-provider";
import { EnteredByMark } from "./entered-by-mark";

vi.mock("@/hooks/chat/use-tenant-members", () => ({
    useTenantMembers: () => ({ data: [{ user_id: "u-noor", display_name: "Noor", avatar_url: null, role: "staff" }] }),
}));

afterEach(cleanup);

const show = (enteredBy: string | null, source: string) =>
    render(<LanguageProvider><EnteredByMark enteredBy={enteredBy} source={source as never} /></LanguageProvider>);

describe("EnteredByMark", () => {
    it("names the staff member who typed the order", () => {
        show("u-noor", "whatsapp");
        expect(screen.getByRole("img").getAttribute("aria-label")).toMatch(/Noor/);
    });

    it("still marks the order when that person has left the team", () => {
        show("u-gone", "tiktok");
        expect(screen.getByRole("img")).toBeTruthy();
    });

    it("shows nothing for an order that arrived on its own", () => {
        const { container } = show(null, "lightfunnels");
        expect(container.textContent).toBe("");
        expect(container.querySelector("[role=img]")).toBeNull();
    });

    it("shows nothing for imports, whose chip already says so", () => {
        const { container } = show("u-noor", "excel_import");
        expect(container.querySelector("[role=img]")).toBeNull();
    });
});
