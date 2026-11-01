// @vitest-environment jsdom
// The risk chip prints one word per risk on every surface, and the compact value pill
// can hide its word (where a card is too narrow) while keeping it for screen readers.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";

const EN: Record<string, string> = {
    "customers.risk.caution": "Needs confirming",
    "customers.risk.high": "High risk",
    "customers.tier.vip": "VIP",
};

vi.mock("@/hooks/use-language", () => ({
    useLanguage: () => ({ language: "en", t: (key: string) => EN[key] ?? key }),
}));

import { RiskChip, ValuePill } from "./reliability-pill";

afterEach(cleanup);

describe("RiskChip", () => {
    it("prints the full word, never a short form", () => {
        const { container } = render(<RiskChip risk="caution" className="min-w-0" />);
        const chip = container.firstElementChild;
        expect(chip?.textContent).toBe("Needs confirming");
        expect(chip?.getAttribute("data-risk")).toBe("caution");
        expect(chip?.getAttribute("title")).toBeNull();
    });

    it("renders nothing for a clean customer unless asked", () => {
        expect(render(<RiskChip risk="clean" />).container.firstElementChild).toBeNull();
    });

    it("keeps the other risks as they are", () => {
        const { container } = render(<RiskChip risk="high" />);
        expect(container.firstElementChild?.textContent).toBe("High risk");
    });
});

describe("ValuePill compact", () => {
    it("names the tier with the customers screens' key", () => {
        const { container } = render(<ValuePill tier="vip" variant="compact" />);
        expect(container.textContent).toBe("VIP");
    });

    it("passes the word's classes through, so a card can hide it from sight but not from screen readers", () => {
        const { container } = render(<ValuePill tier="vip" variant="compact" labelClassName="@max-[16rem]:sr-only" />);
        const word = [...container.querySelectorAll("span")].find((s) => s.textContent === "VIP" && s.children.length === 0);
        expect(word?.className).toContain("@max-[16rem]:sr-only");
        expect(word?.className).toContain("truncate");
    });
});
