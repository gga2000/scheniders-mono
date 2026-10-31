import { describe, it, expect, afterEach } from "vitest";
import type { ReactElement } from "react";
import { cleanup, render as rtlRender, screen } from "@testing-library/react";
import { LanguageProvider } from "@/components/providers/language-provider";
import { ProductPerformanceCard } from "./product-performance-card";

const render = (ui: ReactElement) => rtlRender(ui, { wrapper: LanguageProvider });

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

        expect(statValue("المبيعات")).toBe("--");
        expect(statValue("الإيرادات")).toBe("--");
        expect(statValue("متوسط قيمة الطلب")).toBe("--");
        expect(statValue("هامش الربح")).toBe("--");
    });

    it("shows the figures it is given, a real zero included", () => {
        render(<ProductPerformanceCard timesSold={0} totalRevenue={25000} averageOrderValue={12500} profitMargin={40} />);

        expect(statValue("المبيعات")).toBe("0");
        expect(statValue("الإيرادات")).toBe("25,000 IQD");
        expect(statValue("متوسط قيمة الطلب")).toBe("12,500 IQD");
        expect(statValue("هامش الربح")).toBe("40.0%");
    });
});
