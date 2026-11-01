// @vitest-environment jsdom
// The rating help: each rule starts right after its pill (one grid for both axes), and
// every text line, Arabic included, shares the one left edge.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("@/hooks/use-language", () => ({
    useLanguage: () => ({ language: "ar", t: (key: string) => key }),
}));

import { CustomerRatingHelp } from "./customer-rating-help";
import { FIRST_DELIVERY_DOT } from "@/lib/customer-reliability";

afterEach(cleanup);

describe("CustomerRatingHelp", () => {
    it("puts each rule in the cell right after its pill, on the left edge", () => {
        render(<CustomerRatingHelp layout="wide" />);
        fireEvent.click(screen.getByLabelText("customers.help.trigger"));

        const grid = screen.getByText("customers.help.value.vip").parentElement;
        expect(grid?.className).toContain("grid-cols-[max-content_minmax(0,1fr)]");
        // Both axes share that grid, so their rules line up.
        expect(screen.getByText("customers.help.risk.caution").parentElement).toBe(grid);

        for (const key of ["vip", "good", "newcomer"]) {
            const rule = screen.getByText(`customers.help.value.${key}`);
            expect(rule.getAttribute("dir")).toBe("auto");
            expect(rule.className).toContain("text-left");
            // The pill is the cell just before its rule.
            expect(rule.previousElementSibling?.textContent).toBe(`customers.tier.${key}`);
        }
    });

    it("aligns the dot rows, the score text and the footnotes the same way", () => {
        render(<CustomerRatingHelp layout="wide" />);
        fireEvent.click(screen.getByLabelText("customers.help.trigger"));
        for (const key of [
            "customers.help.activity.active",
            "customers.help.score.body",
            "customers.help.delivery",
            "customers.help.risk.title",
        ]) {
            const el = screen.getByText(key);
            expect(el.getAttribute("dir")).toBe("auto");
            expect(el.className).toContain("text-left");
        }
    });

    it("lists every last-order dot, the teal first-delivery dot included", () => {
        render(<CustomerRatingHelp layout="wide" />);
        fireEvent.click(screen.getByLabelText("customers.help.trigger"));
        const rows = ["active", "cooling", "dormant", "firstDelivery"].map((key) => screen.getByText(`customers.help.activity.${key}`));
        // One section, in this order: the three recency states, then the first delivery.
        const section = rows[0].closest("section");
        for (const row of rows) expect(row.closest("section")).toBe(section);
        expect(rows.map((r) => r.textContent)).toEqual([...section?.querySelectorAll("p span[dir=auto]") ?? []].map((e) => e.textContent));
        const dot = rows[3].previousElementSibling;
        expect(dot?.className).toContain(FIRST_DELIVERY_DOT);
        expect(rows[3].getAttribute("dir")).toBe("auto");
    });
});
