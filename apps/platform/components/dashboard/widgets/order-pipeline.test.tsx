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
        expect(screen.getByText("328 طلباً · آخر 30 يوماً")).toBeTruthy();
        // Several statuses share the 'other' stage: no single Orders filter to open.
        const other = screen.getAllByText("حالات أخرى");
        other.forEach((el) => el.click());
        expect(opened).toEqual([]);
        expect(other.every((el) => el.closest("button") === null)).toBe(true);
        screen.getAllByText("تم التوصيل")[0].click();
        expect(opened).toEqual(["delivered"]);
    });
});
