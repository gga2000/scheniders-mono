import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("@/hooks/use-language", () => ({
    useLanguage: () => ({
        language: "en",
        t: (k: string, p?: Record<string, string>) => (p ? `${k}:${Object.values(p).join(",")}` : k),
    }),
}));
vi.mock("@/hooks/chat/use-tenant-members", () => ({
    useTenantMembers: () => ({ data: [{ user_id: "u1", display_name: "Noor" }] }),
}));
vi.mock("@/hooks/use-categories-query", () => ({
    useCategoriesQuery: () => ({ data: [{ id: "c1", name: "Perfumes" }] }),
}));

import { ActivityLogSection, relativeTime } from "./activity-log-section";

afterEach(cleanup);

describe("ActivityLogSection", () => {
    it("names the person and shows changes in plain words, not ids", () => {
        render(
            <ActivityLogSection
                entries={[
                    {
                        id: "a",
                        action: "price_changed",
                        user_id: "u1",
                        created_at: new Date().toISOString(),
                        changes_json: {
                            price: { before: 60000, after: 61000 },
                            category_id: { before: null, after: "c1" },
                        },
                    },
                ]}
            />,
        );
        expect(screen.getByText("products.activity.action.price_changed")).toBeTruthy();
        expect(screen.getByText("products.activity.by:Noor")).toBeTruthy();
        expect(screen.queryByText(/u1/)).toBeNull();

        fireEvent.click(screen.getByText("products.activity.show"));
        expect(screen.getByText(/IQD\s61,000/)).toBeTruthy();
        expect(screen.getByText("Perfumes")).toBeTruthy();
    });
});

describe("relativeTime", () => {
    it("speaks the merchant's language", () => {
        const now = Date.parse("2026-11-03T12:00:00Z");
        expect(relativeTime("2026-11-03T09:00:00Z", "en", now)).toBe("3 hours ago");
        expect(relativeTime("2026-11-03T09:00:00Z", "ar", now)).toMatch(/ساعات/);
    });
});
