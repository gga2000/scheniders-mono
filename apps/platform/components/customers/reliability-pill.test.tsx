// @vitest-environment jsdom
// The card's short caution word keeps the full one on hover and for screen readers.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";

const EN: Record<string, string> = {
    "customers.risk.caution": "Needs confirming",
    "customers.risk.cautionShort": "Confirm",
    "customers.risk.high": "High risk",
};

vi.mock("@/hooks/use-language", () => ({
    useLanguage: () => ({ language: "en", t: (key: string) => EN[key] ?? key }),
}));

import { RiskChip } from "./reliability-pill";

afterEach(cleanup);

describe("RiskChip", () => {
    it("prints the full word by default", () => {
        const { container } = render(<RiskChip risk="caution" />);
        const chip = container.firstElementChild;
        expect(chip?.textContent).toBe("Needs confirming");
        expect(chip?.getAttribute("title")).toBeNull();
    });

    it("prints the short word on the card, the full one on hover and for screen readers", () => {
        const { container } = render(<RiskChip risk="caution" short />);
        const chip = container.firstElementChild;
        expect(chip?.querySelector(".truncate")?.textContent).toBe("Confirm");
        expect(chip?.getAttribute("title")).toBe("Needs confirming");
        expect(chip?.querySelector(".sr-only")?.textContent).toContain("Needs confirming");
    });

    it("keeps a risk without a short word as it is", () => {
        const { container } = render(<RiskChip risk="high" short />);
        const chip = container.firstElementChild;
        expect(chip?.textContent).toBe("High risk");
        expect(chip?.getAttribute("title")).toBeNull();
    });
});
