import { z } from "zod";
import { monthlyTotal } from "./plans";

/**
 * The day-5 / end-of-trial report (Fermi B12 item 2), in the words the
 * merchant reads in the app and the team sends on WhatsApp, so both say the
 * same thing. The facts come from trial_report_core
 * (20261119001240_trial_report.sql): the shop's own numbers for the Baghdad
 * days from signup to today, or to the day the trial ended. The days the
 * report names and its pace are the trial's real days: a 7-day trial is 7,
 * not the 8 calendar days it touches (round 18).
 *
 * Rules (handoff research/00 §4): every number is the shop's own, with its
 * days; a line that is 0 is not shown; goods Shield stopped are never called
 * money "saved" (no «وفّر»). The expected monthly cost (plan + fee per
 * delivered order + messages, at the trial's pace) is there so the first
 * bill is no surprise.
 *
 * Arabic is the report's language: the team's WhatsApp copy is always
 * Arabic. The merchant app passes "en" when the merchant reads it in English.
 */

export type TrialReportLang = "ar" | "en";

export const trialReportFactsSchema = z.object({
    from_day: z.string(),
    to_day: z.string(),
    /** The trial's real days so far, rounded up: a 7-day trial reads 7. */
    days: z.number().int().min(1),
    /** The same days to the hundredth, at least one: the pace divides by them. */
    elapsed_days: z.number().min(1),
    trial_ends_at: z.string().nullable(),
    ended: z.boolean(),
    plan: z.string(),
    orders: z.number().int(),
    delivered: z.number().int(),
    sales_iqd: z.number(),
    profit_iqd: z.number(),
    /** Units sold without a cost: the profit is higher than it really is. */
    missing_cost_units: z.number().int(),
    with_courier_iqd: z.number(),
    with_courier_orders: z.number().int(),
    shield_flagged: z.number().int(),
    whatsapp_utility: z.number().int(),
    whatsapp_marketing: z.number().int(),
    /** What the shop pays after the trial; null when its plan has no prices. */
    prices: z
        .object({
            plan_month_iqd: z.number(),
            per_delivered_iqd: z.number(),
            whatsapp_utility_iqd: z.number(),
            whatsapp_marketing_iqd: z.number(),
        })
        .nullable(),
});

export type TrialReportFacts = z.infer<typeof trialReportFactsSchema>;

/** A month, for the expected cost: the trial's pace times thirty days. */
export const MONTH_DAYS = 30;

const IRAQI_MONTHS = [
    "كانون الثاني", "شباط", "آذار", "نيسان", "أيار", "حزيران",
    "تموز", "آب", "أيلول", "تشرين الأول", "تشرين الثاني", "كانون الأول",
] as const;

const ENGLISH_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

const number = (n: number) => Math.round(n).toLocaleString("en-US");
const iqd = (n: number, lang: TrialReportLang = "ar") => (lang === "ar" ? `${number(n)} د.ع` : `${number(n)} IQD`);

/** '2026-11-12' as «12 تشرين الثاني». */
export function arabicDay(day: string): string {
    const [, month, date] = day.split("-").map(Number);
    return `${date} ${IRAQI_MONTHS[(month ?? 1) - 1]}`;
}

/** «يوم», «يومين», «3 أيام», «11 يوم», as Iraqis count days. */
export function arabicDays(days: number): string {
    if (days === 1) return "يوم واحد";
    if (days === 2) return "يومين";
    if (days <= 10) return `${days} أيام`;
    return `${days} يوم`;
}

/** '2026-11-12' as "12 Nov". */
function englishDay(day: string): string {
    const [, month, date] = day.split("-").map(Number);
    return `${date} ${ENGLISH_MONTHS[(month ?? 1) - 1]}`;
}

/** The report's days: «من 12 تشرين الثاني لليوم (5 أيام)», or to the trial's last day once it ended. */
export function trialReportPeriod(facts: TrialReportFacts, lang: TrialReportLang = "ar"): string {
    if (lang === "en") {
        const to = facts.ended ? `to ${englishDay(facts.to_day)}` : "to today";
        return `From ${englishDay(facts.from_day)} ${to} (${facts.days} ${facts.days === 1 ? "day" : "days"})`;
    }
    const to = facts.ended ? `إلى ${arabicDay(facts.to_day)}` : "لليوم";
    return `من ${arabicDay(facts.from_day)} ${to} (${arabicDays(facts.days)})`;
}

export interface TrialReportLine {
    key: "orders" | "delivered" | "shield" | "with_courier" | "profit";
    label: string;
    value: string;
    /** A word under the value, such as why profit reads high. */
    note?: string;
    /**
     * The dinars a money line says, so the app can hide it like every other
     * money figure until the merchant shows it. Absent on count lines.
     */
    amountIqd?: number;
}

const LINE_WORDS = {
    ar: {
        orders: "طلباتك",
        delivered: "الواصل",
        shield: "Shield نبّه على",
        with_courier: "فلوسك عند المندوب",
        profit: "ربحك تقريباً",
        loss: "خسارتك تقريباً",
        missingCost: "بعض المنتجات بلا كلفة، فالرقم أعلى من الحقيقي",
    },
    en: {
        orders: "Your orders",
        delivered: "Delivered",
        shield: "Shield warned on",
        with_courier: "Your money with the courier",
        profit: "Your profit, roughly",
        loss: "Your loss, roughly",
        missingCost: "Some products have no cost, so this reads higher than it really is",
    },
} as const;

/** The report's lines, in order, without the ones that are 0. */
export function trialReportLines(facts: TrialReportFacts, lang: TrialReportLang = "ar"): TrialReportLine[] {
    const words = LINE_WORDS[lang];
    const lines: TrialReportLine[] = [];
    if (facts.orders > 0) lines.push({ key: "orders", label: words.orders, value: number(facts.orders) });
    if (facts.delivered > 0) lines.push({ key: "delivered", label: words.delivered, value: number(facts.delivered) });
    if (facts.shield_flagged > 0) lines.push({ key: "shield", label: words.shield, value: number(facts.shield_flagged) });
    if (facts.with_courier_iqd > 0) {
        lines.push({ key: "with_courier", label: words.with_courier, value: iqd(facts.with_courier_iqd, lang), amountIqd: Math.round(facts.with_courier_iqd) });
    }
    const profit = Math.round(facts.profit_iqd);
    if (profit !== 0) {
        lines.push({
            key: "profit",
            label: profit > 0 ? words.profit : words.loss,
            value: iqd(Math.abs(profit), lang),
            note: facts.missing_cost_units > 0 ? words.missingCost : undefined,
            amountIqd: Math.abs(profit),
        });
    }
    return lines;
}

/** What the report says when the shop has no order yet. */
export function trialReportNoOrders(lang: TrialReportLang = "ar"): string {
    return lang === "ar" ? "ما صار عندك طلبات لهسه." : "No orders yet.";
}

export interface ExpectedMonthlyCost {
    planIqd: number;
    /** Delivered orders a month at the trial's pace, and their fee. */
    deliveredPerMonth: number;
    perDeliveredIqd: number;
    deliveredIqd: number;
    /** Messages a month at the trial's pace, at the shop's prices. */
    messagesIqd: number;
    totalIqd: number;
}

const perMonth = (count: number, days: number) => Math.round((count / days) * MONTH_DAYS);

/** What a month would cost at the trial's pace: the plan, the fee on each delivered order and the messages. Null without prices. */
export function expectedMonthlyCost(facts: TrialReportFacts): ExpectedMonthlyCost | null {
    const prices = facts.prices;
    if (!prices) return null;
    const deliveredPerMonth = perMonth(facts.delivered, facts.elapsed_days);
    const messagesIqd =
        perMonth(facts.whatsapp_utility, facts.elapsed_days) * prices.whatsapp_utility_iqd +
        perMonth(facts.whatsapp_marketing, facts.elapsed_days) * prices.whatsapp_marketing_iqd;
    const planAndOrders = monthlyTotal({ base_price_iqd: prices.plan_month_iqd, order_price_iqd: prices.per_delivered_iqd }, deliveredPerMonth);
    return {
        planIqd: prices.plan_month_iqd,
        deliveredPerMonth,
        perDeliveredIqd: prices.per_delivered_iqd,
        deliveredIqd: planAndOrders - prices.plan_month_iqd,
        messagesIqd,
        totalIqd: planAndOrders + messagesIqd,
    };
}

export interface ExpectedCostText {
    /** «كلفتك الشهرية المتوقعة بهالحجم: تقريباً 36,620 د.ع»: the label, a colon and the amount. */
    headline: string;
    label: string;
    /** «تقريباً 36,620 د.ع», which the app sets in bold. */
    amount: string;
    /** «الباقة 9,000 + 55 × 84 طلب واصل + رسائل 23,000», without the zero parts. */
    parts: string;
}

/** The expected monthly cost in words, and its parts without the zero ones. */
export function expectedCostText(cost: ExpectedMonthlyCost, lang: TrialReportLang = "ar"): ExpectedCostText {
    const en = lang === "en";
    const parts = [en ? `Plan ${number(cost.planIqd)}` : `الباقة ${number(cost.planIqd)}`];
    if (cost.deliveredPerMonth > 0) {
        parts.push(`${number(cost.perDeliveredIqd)} × ${number(cost.deliveredPerMonth)} ${en ? "delivered orders" : "طلب واصل"}`);
    }
    if (cost.messagesIqd > 0) parts.push(en ? `messages ${number(cost.messagesIqd)}` : `رسائل ${number(cost.messagesIqd)}`);
    const label = en ? "Your expected monthly cost at this size" : "كلفتك الشهرية المتوقعة بهالحجم";
    const amount = en ? `about ${iqd(cost.totalIqd, lang)}` : `تقريباً ${iqd(cost.totalIqd)}`;
    return { headline: `${label}: ${amount}`, label, amount, parts: parts.join(" + ") };
}

/** «بهالأسبوع» for a trial of a week or less, «بفترة التجربة» for a longer one. */
export function trialReportLead(facts: TrialReportFacts, lang: TrialReportLang = "ar"): string {
    if (lang === "en") return facts.days <= 7 ? "This week" : "During the trial";
    return facts.days <= 7 ? "بهالأسبوع" : "بفترة التجربة";
}

/** The whole report as one WhatsApp message the team can paste. */
export function trialReportText(facts: TrialReportFacts): string {
    const lines = trialReportLines(facts);
    const said = lines.length
        ? `${trialReportLead(facts)}: ${lines.map((l) => `${l.label} ${l.value}${l.note ? ` (${l.note})` : ""}`).join("، ")}`
        : `${trialReportLead(facts)}: ${trialReportNoOrders()}`;
    const out = [`تقرير تجربتك ${trialReportPeriod(facts)}`, said];
    const cost = expectedMonthlyCost(facts);
    if (cost) {
        const { headline, parts } = expectedCostText(cost);
        out.push(`${headline} (${parts})`);
    }
    return out.join("\n");
}
