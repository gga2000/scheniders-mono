// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { LanguageProvider } from "@/components/providers/language-provider";
import type { PipelineStage } from "@/lib/analytics/dashboard-calculations";
import { OrderPipeline } from "./order-pipeline";

afterEach(cleanup);

const stage = (status: string, count: number): PipelineStage =>
    ({ status, label: status, count, color: "#000", textColor: "#fff", bgClass: "" });

describe("dashboard order pipeline", () => {
    it("names the period it counted, not «إجمالي نشط»", () => {
        localStorage.setItem("schneiders_language", "ar");
        render(
            <LanguageProvider>
                <OrderPipeline period="7d" stages={[stage("new", 2), stage("in_transit", 2), stage("delivered", 3)]} />
            </LanguageProvider>,
        );
        expect(screen.getByText("7 طلبات · آخر 7 أيام")).toBeTruthy();
        expect(document.body.textContent).not.toContain("إجمالي نشط");
    });

    it("counts every order of the period, so its total matches the orders card", () => {
        localStorage.setItem("schneiders_language", "ar");
        const opened: string[] = [];
        render(
            <LanguageProvider>
                <OrderPipeline
                    period="30d"
                    stages={[stage("new", 4), stage("in_transit", 39), stage("delivered", 192), stage("other", 93)]}
                    onStageClick={(status) => opened.push(status)}
                />
            </LanguageProvider>,
        );
        expect(screen.getByText("328 طلب · آخر 30 يوم")).toBeTruthy();
        // Several statuses share the 'other' stage: no single Orders filter to open.
        const other = screen.getAllByText("حالات ثانية");
        other.forEach((el) => el.click());
        expect(opened).toEqual([]);
        expect(other.every((el) => el.closest("button") === null)).toBe(true);
        screen.getAllByText("تم التوصيل")[0].click();
        expect(opened).toEqual(["delivered"]);
    });

    it("gives «مكتمل» its own stage and writes counts with separators, like the Orders chips", () => {
        localStorage.setItem("schneiders_language", "ar");
        const opened: string[] = [];
        render(
            <LanguageProvider>
                <OrderPipeline
                    period="all"
                    stages={[stage("in_transit", 46), stage("delivered", 6), stage("completed", 3198), stage("other", 2181)]}
                    onStageClick={(status) => opened.push(status)}
                />
            </LanguageProvider>,
        );
        expect(screen.getByText("5,431 طلب · كل الأيام")).toBeTruthy();
        screen.getAllByText("مكتمل")[0].click();
        expect(opened).toEqual(["completed"]);
        // The hover title takes the plural form, not «192 طلبات».
        const completed = screen.getAllByText("3,198")[0].closest("[title]");
        expect(completed?.getAttribute("title")).toBe("مكتمل: 3,198 طلب");
        expect(screen.getAllByText("6")[0].closest("[title]")?.getAttribute("title")).toBe("تم التوصيل: 6 طلبات");
    });

    it("never offers an empty stage as a link, and says Orders lists in-transit from every day (round 13)", () => {
        localStorage.setItem("schneiders_language", "ar");
        const opened: string[] = [];
        render(
            <LanguageProvider>
                <OrderPipeline
                    period="7d"
                    stages={[stage("new", 0), stage("in_transit", 3), stage("delivered", 3)]}
                    onStageClick={(status) => opened.push(status)}
                />
            </LanguageProvider>,
        );
        const empty = screen.getAllByText("جديد");
        empty.forEach((el) => el.click());
        expect(opened).toEqual([]);
        expect(empty.every((el) => el.closest("button") === null)).toBe(true);
        const transit = screen.getAllByText("قيد التوصيل")[0].closest("[title]");
        expect(transit?.getAttribute("title")).toBe("قيد التوصيل: 3 طلبات\nصفحة الطلبات تعرض «قيد التوصيل» من كل الأيام");
    });
});
