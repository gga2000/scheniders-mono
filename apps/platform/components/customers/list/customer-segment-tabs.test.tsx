// The removable chip for a filter no saved view matches names each axis once: the risk
// level already says "risk", so the axis is "COD" ("الدفع عند الاستلام"), not the full
// "COD risk" ("خطر الدفع عند الاستلام: خطر مرتفع" said "خطر" twice).

import { describe, expect, it } from "vitest";
import { translations } from "@/lib/i18n";
import { describeFilter } from "./customer-segment-tabs";

const tFor = (lang: "en" | "ar") => (key: string) => translations[lang][key] ?? key;

describe("describeFilter", () => {
    it("names the risk axis without repeating the level's word, in English and Arabic", () => {
        const state = { value: "vip" as const, risk: "high" as const, lane: null };
        expect(describeFilter(state, tFor("en"))).toBe("COD: High risk · Value: VIP");
        const ar = describeFilter(state, tFor("ar"));
        expect(ar).toBe("الدفع عند الاستلام: خطر مرتفع · القيمة: VIP");
        expect(ar.match(/خطر/g)).toHaveLength(1);
    });

    it("leaves the shared column and export label alone", () => {
        expect(translations.en["customers.risk.label"]).toBe("COD risk");
        expect(translations.ar["customers.risk.label"]).toBe("خطر الدفع عند الاستلام");
    });
});
