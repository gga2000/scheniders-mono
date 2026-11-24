import { describe, expect, it } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { LanguageProvider } from "./language-provider";
import { useLanguage } from "@/hooks/use-language";

const wrapper = ({ children }: { children: ReactNode }) => <LanguageProvider>{children}</LanguageProvider>;

describe("t() singular forms", () => {
    it("uses the .one entry for a count of 1 and the plural otherwise", async () => {
        localStorage.setItem("schneiders_language", "en");
        const { result } = renderHook(() => useLanguage(), { wrapper });
        // English loads on demand; the page reads Arabic until it has arrived.
        await waitFor(() => expect(result.current.language).toBe("en"));
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
        expect(t("customers.broadcast.recipients", { count: 12 })).toBe("إلى 12 عميل");
        expect(t("customers.broadcast.recipients", { count: 100 })).toBe("إلى 100 عميل");
        expect(t("customers.banner.rateBase", { count: 5 })).toBe("نسبة التوصيل · 5 طلبات خالصة");
    });

    it("agrees order, piece and day counts across the app with their numbers", () => {
        localStorage.setItem("schneiders_language", "ar");
        const { result } = renderHook(() => useLanguage(), { wrapper });
        const t = result.current.t;
        expect(t("printing.shipTitle", { count: 2 })).toBe("شحن طلبين مع برايم");
        expect(t("printing.shipTitle", { count: 5 })).toBe("شحن 5 طلبات مع برايم");
        expect(t("printing.shipTitle", { count: 12 })).toBe("شحن 12 طلب مع برايم");
        expect(t("printing.shipTitle", { count: 100 })).toBe("شحن 100 طلب مع برايم");
        expect(t("orders.export.scopeSelectedSub", { count: 4 })).toBe("4 طلبات محددة");
        expect(t("till.cart.items", { count: 3 })).toBe("3 قطع");
        expect(t("till.cart.items", { count: 11 })).toBe("11 قطعة");
        expect(t("orders.card.inTransitDays", { count: 2 })).toBe("يومين بالتوصيل");
        expect(t("orders.card.inTransitDays", { count: 14 })).toBe("14 يوم بالتوصيل");
        expect(t("ads.coverage", { with: 3, count: 7, pct: 43 })).toBe("3 من 7 طلبات إعلانية بهاي الفترة بيه معرّف الإعلان (43%).");
    });

    it("says the order cadence with the Arabic form its number takes", () => {
        localStorage.setItem("schneiders_language", "ar");
        const { result } = renderHook(() => useLanguage(), { wrapper });
        const cadence = (days: number) => result.current.t("customers.behavioral.cadenceWeekly", { count: days, days: String(days) });
        expect(cadence(2)).toBe("يطلب كل ~يومين");
        expect(cadence(5)).toBe("يطلب كل ~5 أيام");
        expect(cadence(23)).toBe("يطلب كل ~23 يوم");
        expect(cadence(100)).toBe("يطلب كل ~100 يوم");
    });

    it("agrees the dashboard per-day and comparison words with their numbers", () => {
        localStorage.setItem("schneiders_language", "ar");
        const { result } = renderHook(() => useLanguage(), { wrapper });
        const t = result.current.t;
        expect(t("dashboard.bento.perDay", { count: 1 })).toBe("طلب واحد يومياً");
        expect(t("dashboard.bento.perDay", { count: 2 })).toBe("طلبين يومياً");
        expect(t("dashboard.bento.perDay", { count: 5 })).toBe("5 طلبات يومياً");
        expect(t("dashboard.bento.perDay", { count: 12 })).toBe("12 طلب يومياً");
        expect(t("dashboard.bento.perDay", { count: 100 })).toBe("100 طلب يومياً");
        expect(t("dashboard.wow.points", { n: "+2", count: 2 })).toBe("+2 نقطتين");
        expect(t("dashboard.today.ordersCount", { count: 0 })).toBe("طلبات");
        expect(t("finances.cash.dayRange", { min: 0, max: 3, count: 3 })).toBe("0-3 أيام");
        expect(t("finances.cash.dayRangeOpen", { min: 15, count: 15 })).toBe("15+ يوم");
        expect(t("dashboard.bento.vsPrevious", { count: 7 })).toBe("مقارنة بالـ 7 أيام السابقة");
        expect(t("dashboard.bento.vsPrevious", { count: 30 })).toBe("مقارنة بالـ 30 يوم السابقة");
    });

    it("agrees Reports and Finances counts with their numbers", () => {
        localStorage.setItem("schneiders_language", "ar");
        const { result } = renderHook(() => useLanguage(), { wrapper });
        const t = result.current.t;
        expect(t("reports.attention.count", { count: 7 })).toBe("7 طلبات تحتاج مراجعتك");
        expect(t("finances.overview.cash.stuck", { count: 9 })).toBe("9 طلبات متعثرة تحتاج متابعة");
        expect(t("reports.batch.ordersCount", { count: 1 })).toBe("طلب واحد");
        expect(t("reports.team.activeMembers", { count: 6 })).toBe("6 أعضاء نشطون");
        expect(t("dashboard.pipeline.periodTotal", { count: 12, period: "آخر 30 يوم" })).toBe("12 طلب · آخر 30 يوم");
    });

    it("agrees round 11's count words with their numbers", () => {
        localStorage.setItem("schneiders_language", "ar");
        const { result } = renderHook(() => useLanguage(), { wrapper });
        const t = result.current.t;
        expect(t("reports.returns.summary", { n: 9, count: 9, amount: "IQD 342,000" })).toBe("9 مرتجعات | IQD 342,000");
        expect(t("reports.period.subtitle", { n: 30, count: 30 })).toBe("مقارنة 30 يوم");
        expect(t("dashboard.forecast.basis", { count: 16 })).toBe("توقع خطي بناءً على 16 يوم من البيانات");
        expect(t("dashboard.wow.points", { n: "+4", count: 4 })).toBe("+4 نقاط");
        expect(t("map.orders", { count: 6 })).toBe("طلبات");
        expect(t("shield.home.impactTitle", { days: 30, count: 30 })).toBe("الدرع · آخر 30 يوم");
    });

    it("agrees round 15's count words with their numbers", () => {
        localStorage.setItem("schneiders_language", "ar");
        const { result } = renderHook(() => useLanguage(), { wrapper });
        const t = result.current.t;
        expect(t("reports.batch.shipped", { count: 2 })).toBe("دفعتين مشحونتين");
        expect(t("reports.batch.shipped", { count: 5 })).toBe("5 دفعات مشحونة");
        expect(t("reports.batch.shipped", { count: 25 })).toBe("25 دفعة مشحونة");
        expect(t("reports.kpi.plusReturns", { count: 1, total: 9 })).toBe("+ استرجاع واحد = 9 في صفحة الطلبات");
        expect(t("reports.kpi.plusReturns", { count: 9, total: 328 })).toBe("+ 9 استرجاعات = 328 في صفحة الطلبات");
        expect(t("orders.card.waN", { count: 0 })).toBe("واتساب · ما انرسلت رسالة بعد");
        expect(t("orders.card.waN", { count: 2 })).toBe("واتساب · اندزت رسالتين");
    });

    it("uses the .zero entry for a count of 0 in both languages", async () => {
        localStorage.setItem("schneiders_language", "ar");
        const ar = renderHook(() => useLanguage(), { wrapper });
        expect(ar.result.current.t("customers.banner.rateBase", { count: 0 })).toBe("نسبة التوصيل · ماكو طلبات خالصة");
        localStorage.setItem("schneiders_language", "en");
        const en = renderHook(() => useLanguage(), { wrapper });
        await waitFor(() => expect(en.result.current.language).toBe("en"));
        expect(en.result.current.t("customers.banner.rateBase", { count: 0 })).toBe("Delivery rate · none finished yet");
        expect(en.result.current.t("customers.banner.rateBase", { count: 4 })).toBe("Delivery rate · 4 finished");
    });

    it("picks no plural form when the count is not a number", () => {
        localStorage.setItem("schneiders_language", "ar");
        const { result } = renderHook(() => useLanguage(), { wrapper });
        expect(result.current.t("customers.broadcast.recipients", { count: "2" })).toBe("إلى 2 عميل");
    });
});
