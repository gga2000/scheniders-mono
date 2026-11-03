import { describe, expect, it } from "vitest";
import { netSublabel } from "./hero-strip";

const t = (key: string, vars?: Record<string, string | number>) =>
    `${key}${vars ? JSON.stringify(vars) : ""}`;

describe("netSublabel", () => {
    it("says how much is still on the way when a loss is only timing", () => {
        const out = netSublabel({ delivered_revenue: 141_000, net_profit: -1_210_000, cash_float: 6_100_000, margin_pct: -854 }, t);
        expect(out).toBe('finances.hero.netPending{"amount":"6.10M IQD"}');
    });

    it("keeps the margin when profit is positive", () => {
        const out = netSublabel({ delivered_revenue: 5_000_000, net_profit: 900_000, cash_float: 6_100_000, margin_pct: 18 }, t);
        expect(out).toBe('finances.hero.netMargin{"pct":"18.0"}');
    });

    it("keeps the margin for a real loss with nothing in transit", () => {
        const out = netSublabel({ delivered_revenue: 1_000_000, net_profit: -50_000, cash_float: 0, margin_pct: -5 }, t);
        expect(out).toBe('finances.hero.netMargin{"pct":"-5.0"}');
    });

    it("says no delivered orders when nothing was delivered", () => {
        const out = netSublabel({ delivered_revenue: 0, net_profit: -10_000, cash_float: 500_000, margin_pct: 0 }, t);
        expect(out).toBe("finances.hero.netNone");
    });
});
