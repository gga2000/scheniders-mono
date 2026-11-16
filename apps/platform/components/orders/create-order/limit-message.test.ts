import { describe, expect, it } from "vitest";
import { limitMessage } from "./limit-message";
import { ar } from "@/lib/i18n-ar";

const t = (key: string, vars?: Record<string, string | number>) =>
    Object.entries(vars ?? {}).reduce((s, [k, v]) => s.replace(`{${k}}`, String(v)), ar[key] ?? key);

describe("limitMessage", () => {
    it("words a blocked trial in Arabic, not the server's English reason", () => {
        expect(limitMessage(t, "trial_expired", undefined)).toBe(ar["orders.limit.trial_expired"]);
    });

    it("fills the numbers of a monthly limit", () => {
        expect(limitMessage(t, "monthly_limit_exceeded", { used: 1100, limit: 1000 })).toContain("1,100 من 1,000");
    });

    it("says nothing when the check passed quietly", () => {
        expect(limitMessage(t, undefined, undefined)).toBeNull();
    });

    it("has a line for every code", () => {
        for (const code of ["tenant_not_found", "suspended", "cancelled", "trial_expired", "monthly_limit_exceeded", "monthly_limit_reached", "monthly_limit_near"]) {
            expect(ar[`orders.limit.${code}`]).toBeTruthy();
        }
    });
});
