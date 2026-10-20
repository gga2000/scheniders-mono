import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ProductPerformanceCard } from "./product-performance-card";

/**
 * The product editor does not mount the order book (PERF-D1), so its sales
 * figures can be unknown. Unknown must read as "--", not as "0 sold".
 */

function statValue(label: string): string | null {
    return screen.getByText(label).nextElementSibling?.textContent ?? null;
}

afterEach(cleanup);

describe("ProductPerformanceCard", () => {
    it("shows -- for sales it was not given, never 0", () => {
        render(<ProductPerformanceCard profitMargin={null} />);

        expect(statValue("Total Sales")).toBe("--");
        expect(statValue("Revenue")).toBe("--");
        expect(statValue("Avg Order Value")).toBe("--");
        expect(statValue("Profit Margin")).toBe("--");
    });

    it("shows the figures it is given, a real zero included", () => {
        render(<ProductPerformanceCard timesSold={0} totalRevenue={25000} averageOrderValue={12500} profitMargin={40} />);

        expect(statValue("Total Sales")).toBe("0");
        expect(statValue("Revenue")).toBe("25,000 IQD");
        expect(statValue("Avg Order Value")).toBe("12,500 IQD");
        expect(statValue("Profit Margin")).toBe("40.0%");
    });
});
