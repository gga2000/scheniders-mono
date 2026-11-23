"use client";

import Link from "next/link";
import { X } from "lucide-react";
import {
    expectedCostText,
    expectedMonthlyCost,
    trialReportLead,
    trialReportLines,
    trialReportNoOrders,
    trialReportPeriod,
    type TrialReportFacts,
} from "@scheniders/shared/trial-report";
import { cn } from "@/lib/utils";
import { useLanguage, useTextDir } from "@/hooks/use-language";
import { FinancialValue } from "@/components/ui/financial-value";
import { BILLING_SETTINGS_PATH } from "@/lib/billing/lock-routes";

/**
 * The trial report as the merchant reads it (Fermi B12 item 2, concept A):
 * its days, the shop's own numbers without the zero ones, and what a month
 * would cost at this pace, in the words the team sends on WhatsApp. Money
 * lines hide like every other money figure until the merchant shows them;
 * the expected cost is a price, so it always shows.
 */
export function TrialReportCard({
    facts,
    choosePlan,
    onHide,
    className,
}: {
    facts: TrialReportFacts;
    /** The «اختر باقتك» button; the lock screen has its own pay button instead. */
    choosePlan: boolean;
    onHide: () => void;
    className?: string;
}) {
    const { t, language } = useLanguage();
    const dir = useTextDir();
    const lang = language === "en" ? "en" : "ar";
    const lines = trialReportLines(facts, lang);
    const cost = expectedMonthlyCost(facts);
    const costText = cost && expectedCostText(cost, lang);

    return (
        <section
            aria-labelledby="trial-report-title"
            data-testid="trial-report-card"
            className={cn("@container rounded-3xl border border-(--card-border) bg-(--card-bg) p-6 shadow-sm", className)}
        >
            <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                    <h2 id="trial-report-title" dir={dir} className="text-left text-lg font-bold text-foreground">
                        {t("trialReport.title")}
                    </h2>
                    <p dir={dir} className="mt-0.5 text-left text-sm text-muted-foreground">
                        {trialReportPeriod(facts, lang)}
                    </p>
                </div>
                <button
                    type="button"
                    onClick={onHide}
                    className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
                >
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                    <span dir={dir}>{t("trialReport.hideToday")}</span>
                </button>
            </div>

            {/* Wide (Home), the numbers and the cost sit side by side; narrow (the lock screen), one under the other. */}
            <div className="mt-3 grid gap-x-10 gap-y-3 @3xl:grid-cols-2">
                <div className="min-w-0">
                    <p dir={dir} className="text-left text-sm font-semibold text-foreground">
                        {trialReportLead(facts, lang)}:
                    </p>
                    {lines.length > 0 ? (
                        <dl className="mt-1 divide-y divide-(--card-border)">
                            {lines.map((line) => (
                                <div key={line.key} className="flex items-baseline justify-between gap-4 py-2.5" data-testid={`trial-report-${line.key}`}>
                                    <dt dir={dir} className="text-left text-sm text-foreground">
                                        {line.label}
                                        {line.note && <span className="mt-0.5 block text-xs text-muted-foreground">{line.note}</span>}
                                    </dt>
                                    <dd className="shrink-0 text-sm font-bold tabular-nums text-foreground">
                                        {line.amountIqd === undefined ? line.value : <FinancialValue amount={line.amountIqd} />}
                                    </dd>
                                </div>
                            ))}
                        </dl>
                    ) : (
                        <p dir={dir} className="mt-1 text-left text-sm text-muted-foreground">
                            {trialReportNoOrders(lang)}
                        </p>
                    )}
                </div>

                <div className="flex min-w-0 flex-col gap-4 @3xl:pt-7">
                    {costText && (
                        <div className="rounded-2xl bg-muted/40 px-4 py-3" data-testid="trial-report-cost">
                            <p dir={dir} className="text-left text-sm text-foreground">
                                {costText.label}: <strong className="font-bold">{costText.amount}</strong>
                            </p>
                            <p dir={dir} className="mt-0.5 text-left text-sm text-muted-foreground">
                                {costText.parts}
                            </p>
                        </div>
                    )}
                    {choosePlan && (
                        <div className="flex justify-end">
                            <Link
                                href={BILLING_SETTINGS_PATH}
                                className="inline-flex items-center rounded-xl bg-foreground px-5 py-2.5 text-sm font-semibold text-background transition-opacity hover:opacity-90"
                            >
                                <span dir={dir}>{t("trialReport.choosePlan")}</span>
                            </Link>
                        </div>
                    )}
                </div>
            </div>
        </section>
    );
}
