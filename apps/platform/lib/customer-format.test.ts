import { describe, expect, it } from "vitest";
import { formatIQD } from "@scheniders/shared";
import { spentLabel } from "./customer-format";

describe("spentLabel", () => {
    it("shows a dash while the first delivery is pending and nothing is spent", () => {
        expect(spentLabel(0, true)).toBe("—");
    });

    it("shows the amount once something is delivered, or when the customer is not pending", () => {
        expect(spentLabel(0, false)).toBe(formatIQD(0));
        expect(spentLabel(190000, true)).toBe(formatIQD(190000));
        expect(spentLabel(190000, false)).toBe(formatIQD(190000));
    });
});
