"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";
import { useLanguage, useTextDir } from "@/hooks/use-language";
import type { CostLine, FinanceSummary } from "@/lib/finance/summary";
import type { FinanceTab } from "./finance-tabs";
import { Money, formatWhole } from "./money";

interface StatementDetailProps {
    line: CostLine;
    summary: FinanceSummary;
    onOpenTab: (tab: FinanceTab) => void;
}

const linkClass =
    "inline-flex items-center gap-1 text-[13px] font-medium text-foreground underline decoration-[var(--card-border)] underline-offset-4 hover:decoration-current";

/** What is inside one cost line of the statement, and where to go to change it. */
export function StatementDetail({ line, summary, onOpenTab }: StatementDetailProps) {
    const { t } = useLanguage();
    const dir = useTextDir();
    const sentence = (text: string) => <p className="text-left text-[13px] leading-relaxed text-muted" dir={dir}>{text}</p>;
    const tabLink = (tab: FinanceTab, label: string) => (
        <button type="button" onClick={() => onOpenTab(tab)} className={linkClass}>
            {label}
            <ArrowUpRight className="size-3.5" aria-hidden="true" />
        </button>
    );
    const pageLink = (href: string, label: string) => (
        <Link href={href} className={linkClass}>
            {label}
            <ArrowUpRight className="size-3.5" aria-hidden="true" />
        </Link>
    );
    const part = (key: string, label: string, amount: number) => (
        <div key={key} className="flex items-baseline justify-between gap-4 text-[13px]">
            <span className="text-left text-muted" dir={dir}>{label}</span>
            <Money value={amount} className="font-medium text-foreground" />
        </div>
    );

    let body: ReactNode;
    switch (line.id) {
        case "product_cost": {
            const missing = summary.sales.missing_cost_units;
            body = (
                <>
                    {sentence(t("fin.detail.product_cost", { n: formatWhole(summary.sales.units) }))}
                    {missing > 0 && (
                        <p className="text-left text-[13px] leading-relaxed text-amber-700 dark:text-amber-300" dir={dir}>
                            {t("fin.detail.product_cost.missing", { n: formatWhole(missing) })}
                        </p>
                    )}
                    {missing > 0 && pageLink("/products", t("fin.detail.product_cost.fix"))}
                </>
            );
            break;
        }
        case "ads":
            body = (
                <>
                    {sentence(t("fin.detail.ads"))}
                    {pageLink("/ads", t("fin.detail.ads.open"))}
                </>
            );
            break;
        case "delivery":
            body = (
                <>
                    {line.parts.length === 0 && sentence(t("fin.detail.delivery.none"))}
                    {line.parts.map((p) =>
                        part(
                            p.key,
                            p.key === "prime_fee"
                                ? t("fin.detail.delivery.prime", { n: formatWhole(summary.courier.prime_parcels) })
                                : t("fin.detail.delivery.bills"),
                            p.amount,
                        ),
                    )}
                    {tabLink("expenses", t("fin.detail.other.open"))}
                </>
            );
            break;
        case "refunds":
            body = (
                <>
                    {sentence(t("fin.detail.refunds", { n: formatWhole(summary.refunds.count) }))}
                    {tabLink("returns", t("fin.detail.refunds.open"))}
                </>
            );
            break;
        case "other":
            body = (
                <>
                    {line.parts.length === 0 && sentence(t("fin.detail.other.none"))}
                    {line.parts.map((p) => part(p.key, t(`finances.expense.cat.${p.key}`, p.key), p.amount))}
                    {tabLink("expenses", t("fin.detail.other.open"))}
                </>
            );
            break;
        case "salaries":
            body = (
                <>
                    {sentence(t("fin.detail.salaries"))}
                    {tabLink("salaries", t("fin.detail.salaries.open"))}
                </>
            );
            break;
    }

    return <div className="space-y-2 pb-3 ps-7 pt-1">{body}</div>;
}
