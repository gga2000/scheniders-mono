// @vitest-environment jsdom
// The Arabic outcome mix keeps every number beside its word: one isolated run per
// outcome inside a dir="auto" line, never one joined string.

import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

const AR_MIX: Record<string, string> = {
    "customers.behavioral.mix.delivered": "{pct}% وصلت",
    "customers.behavioral.mix.returned": "{pct}% راجعة",
    "customers.behavioral.mix.rejected": "{pct}% مرفوضة",
    "customers.snapshot.title": "لمحة عن العميل",
    "customers.snapshot.phoneInvalid": "صيغة الرقم قد تكون غير صحيحة",
    "customers.behavioral.cadenceWeekly": "cadence days={days} count={count}",
};

vi.mock("@/hooks/use-language", () => ({
    useLanguage: () => ({
        language: "ar",
        t: (key: string, vars?: Record<string, string | number>) =>
            (AR_MIX[key] ?? key).replace(/\{(\w+)\}/g, (_, k: string) => String(vars?.[k] ?? "")),
    }),
}));
vi.mock("@/hooks/use-customer-links", () => ({ useCustomerLinks: () => ({ data: [] }) }));

import { BehavioralPatternsCard } from "./behavioral-patterns-card";

afterEach(cleanup);

const order = (status: string, day: number) => ({ status, created_at: `2026-10-${String(day).padStart(2, "0")}T12:00:00Z` });

describe("BehavioralPatternsCard outcome mix", () => {
    it("renders each Arabic outcome as its own isolated run in a dir=auto line", () => {
        const orders = [
            ...Array.from({ length: 13 }, (_, i) => order("delivered", i + 1)),
            order("returned", 20),
        ];
        render(<BehavioralPatternsCard orders={orders} phone="07701234567" />);

        const delivered = screen.getByText("93% وصلت");
        const returned = screen.getByText("7% راجعة");
        // Two separate elements: the 93% can never be reordered away from "وصلت".
        expect(delivered).not.toBe(returned);
        for (const run of [delivered, returned]) {
            expect(run.className).toContain("[unicode-bidi:isolate]");
            expect(run.textContent).toMatch(/^\d+% \S+$/);
        }

        const line = delivered.closest("p");
        expect(line?.getAttribute("dir")).toBe("auto");
        expect(line).toBe(returned.closest("p"));
        expect(line?.textContent).toBe("93% وصلت · 7% راجعة");
    });

    it("lists only the outcomes that happened, delivered always first", () => {
        const orders = [order("delivered", 1), order("rejected", 5), order("rejected", 9), order("delivered", 13)];
        render(<BehavioralPatternsCard orders={orders} phone="07701234567" />);
        const line = screen.getByText("50% وصلت").closest("p");
        expect(line?.textContent).toBe("50% وصلت · 50% مرفوضة");
    });
});

describe("BehavioralPatternsCard snapshot (fewer than three orders)", () => {
    it("renders nothing for a valid number: the hero already shows the place", () => {
        const { container } = render(<BehavioralPatternsCard orders={[order("delivered", 1)]} phone="07701234567" />);
        expect(container.firstChild).toBeNull();
    });

    it("is one strip with the warning for a bad number", () => {
        render(<BehavioralPatternsCard orders={[order("delivered", 1)]} phone="0123" />);
        expect(screen.getByText("لمحة عن العميل")).toBeTruthy();
        expect(screen.getByText("صيغة الرقم قد تكون غير صحيحة")).toBeTruthy();
    });
});

describe("BehavioralPatternsCard order cadence", () => {
    it("passes the day count as a number, so the plural helper can pick the Arabic form", () => {
        // An order every 23 days: "~23 يوماً", the accusative singular, needs the count.
        const orders = [1, 24, 47].map((d) => ({ status: "delivered", created_at: new Date(Date.UTC(2026, 6, d, 12)).toISOString() }));
        render(<BehavioralPatternsCard orders={orders} phone="07701234567" />);
        expect(screen.getByText("cadence days=23 count=23")).toBeTruthy();
    });
});
