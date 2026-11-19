import { describe, expect, it } from "vitest";
import {
    arabicDay,
    arabicDays,
    expectedCostText,
    expectedMonthlyCost,
    trialReportFactsSchema,
    trialReportLines,
    trialReportPeriod,
    trialReportText,
    type TrialReportFacts,
} from "./trial-report";

const facts = (extra: Partial<TrialReportFacts> = {}): TrialReportFacts => ({
    from_day: "2026-11-12",
    to_day: "2026-11-16",
    days: 5,
    trial_ends_at: "2026-11-19T09:00:00+00:00",
    ended: false,
    plan: "starter",
    orders: 23,
    delivered: 14,
    sales_iqd: 420_000,
    profit_iqd: 96_000,
    missing_cost_units: 0,
    with_courier_iqd: 210_000,
    with_courier_orders: 7,
    shield_flagged: 3,
    whatsapp_utility: 40,
    whatsapp_marketing: 5,
    prices: { plan_month_iqd: 9_000, per_delivered_iqd: 55, whatsapp_utility_iqd: 30, whatsapp_marketing_iqd: 80 },
    ...extra,
});

describe("the trial report's lines", () => {
    it("says each number in the handoff's words, in its order", () => {
        expect(trialReportLines(facts()).map((l) => `${l.label} ${l.value}`)).toEqual([
            "طلباتك 23",
            "الواصل 14",
            "Shield نبّه على 3",
            "فلوسك عند المندوب 210,000 د.ع",
            "ربحك تقريباً 96,000 د.ع",
        ]);
    });

    it("hides every line that is 0", () => {
        const lines = trialReportLines(facts({ delivered: 0, shield_flagged: 0, with_courier_iqd: 0, profit_iqd: 0 }));
        expect(lines.map((l) => l.key)).toEqual(["orders"]);
        expect(trialReportLines(facts({ orders: 0, delivered: 0, shield_flagged: 0, with_courier_iqd: 0, profit_iqd: 0 }))).toEqual([]);
    });

    it("calls a loss a loss, never a profit", () => {
        const [line] = trialReportLines(facts({ orders: 0, delivered: 0, shield_flagged: 0, with_courier_iqd: 0, profit_iqd: -5_000 }));
        expect(line).toMatchObject({ label: "خسارتك تقريباً", value: "5,000 د.ع" });
    });

    it("says when the profit reads high because some products have no cost", () => {
        const profit = trialReportLines(facts({ missing_cost_units: 2 })).find((l) => l.key === "profit");
        expect(profit?.note).toBe("بعض المنتجات بلا كلفة، فالرقم أعلى من الحقيقي");
    });

    it("never says money was saved", () => {
        const text = trialReportText(facts());
        expect(text).not.toMatch(/وفّر|وفر|saved/);
    });
});

describe("the report's days", () => {
    it("names the Baghdad days in Iraqi months, to today while the trial runs", () => {
        expect(trialReportPeriod(facts())).toBe("من 12 تشرين الثاني لليوم (5 أيام)");
        expect(trialReportPeriod(facts({ ended: true, to_day: "2026-11-19", days: 8 }))).toBe("من 12 تشرين الثاني إلى 19 تشرين الثاني (8 أيام)");
        expect(arabicDay("2027-01-03")).toBe("3 كانون الثاني");
    });

    it("counts days as Iraqis say them", () => {
        expect([1, 2, 3, 10, 11].map(arabicDays)).toEqual(["يوم واحد", "يومين", "3 أيام", "10 أيام", "11 يوم"]);
    });
});

describe("the expected monthly cost", () => {
    it("is the plan, the fee on each delivered order and the messages, at the trial's pace", () => {
        // 14 delivered in 5 days: 84 a month. 40 utility and 5 marketing in 5 days: 240 and 30 a month.
        expect(expectedMonthlyCost(facts())).toEqual({
            planIqd: 9_000,
            deliveredPerMonth: 84,
            perDeliveredIqd: 55,
            deliveredIqd: 84 * 55,
            messagesIqd: 240 * 30 + 30 * 80,
            totalIqd: 9_000 + 84 * 55 + 240 * 30 + 30 * 80,
        });
    });

    it("leaves out the parts that are 0, and is unknown without prices", () => {
        const quiet = expectedMonthlyCost(facts({ delivered: 0, whatsapp_utility: 0, whatsapp_marketing: 0 }));
        expect(quiet?.totalIqd).toBe(9_000);
        expect(quiet && expectedCostText(quiet)).toEqual({ headline: "كلفتك الشهرية المتوقعة بهالحجم: تقريباً 9,000 د.ع", parts: "الباقة 9,000" });
        expect(expectedMonthlyCost(facts({ prices: null }))).toBeNull();
    });
});

describe("the WhatsApp copy", () => {
    it("is the period, the lines and the expected cost, as one message", () => {
        expect(trialReportText(facts())).toBe(
            [
                "تقرير تجربتك من 12 تشرين الثاني لليوم (5 أيام)",
                "بهالأسبوع: طلباتك 23، الواصل 14، Shield نبّه على 3، فلوسك عند المندوب 210,000 د.ع، ربحك تقريباً 96,000 د.ع",
                "كلفتك الشهرية المتوقعة بهالحجم: تقريباً 23,220 د.ع (الباقة 9,000 + 55 × 84 طلب واصل + رسائل 9,600)",
            ].join("\n"),
        );
    });

    it("says there are no orders yet rather than an empty line, and covers a longer trial as the trial", () => {
        const text = trialReportText(facts({ orders: 0, delivered: 0, shield_flagged: 0, with_courier_iqd: 0, profit_iqd: 0, days: 9, ended: true, to_day: "2026-11-20" }));
        expect(text.split("\n")[1]).toBe("بفترة التجربة: ما صار عندك طلبات لهسه.");
    });

    it("reads the database's answer", () => {
        expect(trialReportFactsSchema.parse(facts())).toEqual(facts());
        expect(trialReportFactsSchema.safeParse({ ...facts(), days: 0 }).success).toBe(false);
    });
});
