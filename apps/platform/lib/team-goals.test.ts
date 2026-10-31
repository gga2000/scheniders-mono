import { describe, expect, it } from "vitest";
import { goalProgress, type Goal } from "./team-goals";

const day = (date: string, n: number) => ({ date, totalActions: n, ordersCreated: n * 2, statusChanges: 0, ordersPrinted: 1 });
const days = Array.from({ length: 30 }, (_, i) => day(`2026-10-${String(i + 2).padStart(2, "0")}`, i + 1));
const goal = (type: Goal["type"], metric: Goal["metric"]): Goal => ({ id: "g", employeeId: "u", type, metric, target: 10, createdAt: "" });

describe("goalProgress", () => {
    it("is null until the member's counts load", () => {
        expect(goalProgress(goal("daily", "totalActions"), undefined)).toBeNull();
    });
    it("daily counts only today (the last day)", () => {
        expect(goalProgress(goal("daily", "totalActions"), days)).toBe(30);
    });
    it("weekly sums the last 7 days", () => {
        expect(goalProgress(goal("weekly", "totalActions"), days)).toBe(24 + 25 + 26 + 27 + 28 + 29 + 30);
    });
    it("monthly sums all 30 days of the chosen metric", () => {
        expect(goalProgress(goal("monthly", "ordersCreated"), days)).toBe(2 * (30 * 31) / 2);
        expect(goalProgress(goal("monthly", "ordersPrinted"), days)).toBe(30);
    });
});
