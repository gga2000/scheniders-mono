import { describe, expect, it } from "vitest";
import { projectInTransit } from "./payroll-projection";

const calc = { grossSalary: 862000, absenceDeduction: 0, advancesTotal: 100000, penaltiesTotal: 0 };

describe("projectInTransit", () => {
    it("adds order pay for in-transit orders on top of today's net", () => {
        expect(projectInTransit(calc, 37, 1000)).toEqual({ orders: 37, extraOrderBonus: 37000, projectedNet: 799000 });
    });

    it("changes nothing when no orders are in transit", () => {
        expect(projectInTransit(calc, 0, 1000).projectedNet).toBe(762000);
    });

    it("never goes below zero when deductions are larger than pay", () => {
        expect(projectInTransit({ ...calc, advancesTotal: 2000000 }, 5, 1000).projectedNet).toBe(0);
    });
});
