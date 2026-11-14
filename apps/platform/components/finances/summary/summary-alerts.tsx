"use client";

import Link from "next/link";
import { ArrowUpRight, Clock, Tag, type LucideIcon } from "lucide-react";
import { useLanguage, useTextDir } from "@/hooks/use-language";
import type { FinanceSummary } from "@/lib/finance/summary";
import { formatWhole, useMoneyText } from "./money";

interface SummaryAlertsProps {
    summary: FinanceSummary;
}

interface Alert {
    key: string;
    icon: LucideIcon;
    text: string;
    href: string;
    action: string;
}

/**
 * The two things worth a merchant's attention before reading the numbers:
 * parcels stuck on the road, and delivered goods with no cost on file (which
 * make the profit read too high). Nothing shows when neither applies.
 */
export function SummaryAlerts({ summary }: SummaryAlertsProps) {
    const { t } = useLanguage();
    const dir = useTextDir();
    const money = useMoneyText();
    const alerts: Alert[] = [];
    if (summary.cash.stuck.count > 0) {
        alerts.push({
            key: "stuck",
            icon: Clock,
            text: t("fin.alert.stuck", { n: formatWhole(summary.cash.stuck.count), amount: money(summary.cash.stuck.amount) }),
            href: "/orders?status=in_transit",
            action: t("fin.alert.stuck.open"),
        });
    }
    if (summary.sales.missing_cost_units > 0) {
        alerts.push({
            key: "no_cost",
            icon: Tag,
            text: t("fin.alert.noCost", { n: formatWhole(summary.sales.missing_cost_units) }),
            href: "/products",
            action: t("fin.alert.noCost.open"),
        });
    }
    if (alerts.length === 0) return null;

    return (
        <div className="grid gap-3 lg:grid-cols-2" data-testid="summary-alerts">
            {alerts.map(({ key, icon: Icon, text, href, action }) => (
                <Link
                    key={key}
                    href={href}
                    className="flex items-center gap-3 rounded-2xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-amber-900 transition-colors hover:bg-amber-500/15 dark:text-amber-100"
                    data-alert={key}
                >
                    <Icon className="size-[18px] shrink-0" aria-hidden="true" />
                    <span className="min-w-0 flex-1 text-left text-[13.5px] font-medium leading-relaxed" dir={dir}>{text}</span>
                    <span className="flex shrink-0 items-center gap-1 whitespace-nowrap text-[13px] font-semibold underline underline-offset-4">
                        {action}
                        <ArrowUpRight className="size-3.5" aria-hidden="true" />
                    </span>
                </Link>
            ))}
        </div>
    );
}
