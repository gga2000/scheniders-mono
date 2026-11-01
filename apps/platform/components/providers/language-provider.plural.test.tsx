import { describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { LanguageProvider } from "./language-provider";
import { useLanguage } from "@/hooks/use-language";

const wrapper = ({ children }: { children: ReactNode }) => <LanguageProvider>{children}</LanguageProvider>;

describe("t() singular forms", () => {
    it("uses the .one entry for a count of 1 and the plural otherwise", () => {
        localStorage.setItem("schneiders_language", "en");
        const { result } = renderHook(() => useLanguage(), { wrapper });
        expect(result.current.t("finances.invoices.kpi.outSub", { count: 1 })).toBe("1 expense");
        expect(result.current.t("finances.invoices.kpi.outSub", { count: 3 })).toBe("3 expenses");
        expect(result.current.t("finances.invoices.kpi.outSub", { count: 0 })).toBe("0 expenses");
    });

    it("falls back to the normal entry in a language with no singular form", () => {
        localStorage.setItem("schneiders_language", "ar");
        const { result } = renderHook(() => useLanguage(), { wrapper });
        expect(result.current.t("finances.invoices.kpi.outSub", { count: 1 })).toBe("1 مصروف");
    });

    it("uses the Arabic dual, few and many forms, and the plain entry for the rest", () => {
        localStorage.setItem("schneiders_language", "ar");
        const { result } = renderHook(() => useLanguage(), { wrapper });
        const t = result.current.t;
        expect(t("customers.broadcast.recipients", { count: 1 })).toBe("إلى عميل واحد");
        expect(t("customers.broadcast.recipients", { count: 2 })).toBe("إلى عميلَين");
        expect(t("customers.broadcast.recipients", { count: 5 })).toBe("إلى 5 عملاء");
        expect(t("customers.broadcast.recipients", { count: 12 })).toBe("إلى 12 عميلاً");
        expect(t("customers.broadcast.recipients", { count: 100 })).toBe("إلى 100 عميل");
        expect(t("customers.banner.rateBase", { count: 5 })).toBe("نسبة التوصيل · 5 طلبات منتهية");
    });

    it("says the order cadence with the Arabic form its number takes", () => {
        localStorage.setItem("schneiders_language", "ar");
        const { result } = renderHook(() => useLanguage(), { wrapper });
        const cadence = (days: number) => result.current.t("customers.behavioral.cadenceWeekly", { count: days, days: String(days) });
        expect(cadence(2)).toBe("يطلب كل ~يومين");
        expect(cadence(5)).toBe("يطلب كل ~5 أيام");
        expect(cadence(23)).toBe("يطلب كل ~23 يوماً");
        expect(cadence(100)).toBe("يطلب كل ~100 يوم");
    });

    it("uses the .zero entry for a count of 0 in both languages", () => {
        localStorage.setItem("schneiders_language", "ar");
        const ar = renderHook(() => useLanguage(), { wrapper });
        expect(ar.result.current.t("customers.banner.rateBase", { count: 0 })).toBe("نسبة التوصيل · لا طلبات منتهية");
        localStorage.setItem("schneiders_language", "en");
        const en = renderHook(() => useLanguage(), { wrapper });
        expect(en.result.current.t("customers.banner.rateBase", { count: 0 })).toBe("Delivery rate · none finished yet");
        expect(en.result.current.t("customers.banner.rateBase", { count: 4 })).toBe("Delivery rate · 4 finished");
    });

    it("picks no plural form when the count is not a number", () => {
        localStorage.setItem("schneiders_language", "ar");
        const { result } = renderHook(() => useLanguage(), { wrapper });
        expect(result.current.t("customers.broadcast.recipients", { count: "2" })).toBe("إلى 2 عميل");
    });
});
