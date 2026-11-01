// @vitest-environment jsdom
// Trust events read relative for a month, then as their short day, and name their order.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";

vi.mock("@/hooks/use-language", () => ({
    useLanguage: () => ({
        language: "en",
        t: (key: string, vars?: Record<string, string | number>) =>
            key === "customers.recency.daysAgo" ? `${vars?.days} days ago` : key,
    }),
}));

import { RELATIVE_DAYS } from "@/lib/customer-reliability";
import { TrustEventDate } from "./trust-event-date";

const NOW = new Date("2026-11-01T09:00:00Z");
const daysBefore = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();

beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
});
afterEach(() => {
    cleanup();
    vi.useRealTimers();
});

describe("TrustEventDate", () => {
    it("is relative up to a month", () => {
        const { container } = render(<TrustEventDate date={daysBefore(RELATIVE_DAYS)} />);
        expect(container.textContent).toBe(`${RELATIVE_DAYS} days ago`);
    });

    it("is the short day past a month, with the full day on hover", () => {
        const { container } = render(<TrustEventDate date="2026-07-07T09:00:00Z" />);
        expect(container.textContent).toBe("Jul 7");
        const time = container.querySelector("time");
        expect(time?.getAttribute("title")).toBe("Jul 7, 2026");
        expect(time?.getAttribute("dateTime")).toBe("2026-07-07T09:00:00Z");
    });

    it("names the order the event came from", () => {
        const { container } = render(<TrustEventDate date={daysBefore(20)} orderId="SCH-10420" />);
        expect(container.textContent).toBe("#SCH-10420 · 20 days ago");
    });

    it("shows the date alone for an event without an order", () => {
        const { container } = render(<TrustEventDate date={daysBefore(20)} orderId={null} />);
        expect(container.textContent).toBe("20 days ago");
    });
});
