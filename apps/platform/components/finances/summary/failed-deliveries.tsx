"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { useLanguage, useTextDir } from "@/hooks/use-language";
import { refusedShare, type FinanceSummary } from "@/lib/finance/summary";
import { Money, formatWhole } from "./money";
import { SummaryCard } from "./summary-card";

interface FailedDeliveriesProps {
    summary: FinanceSummary;
}

/** Parcels refused at the door in the period: how many, the sales they would have been, and how often it happens. */
export function FailedDeliveries({ summary }: FailedDeliveriesProps) {
    const { t } = useLanguage();
    const dir = useTextDir();
    const { refused_orders: refused, refused_value: value } = summary.failed;
    const share = refusedShare(summary);

    return (
        <SummaryCard title={t("fin.failed.title")} sub={t("fin.failed.sub")} textDir={dir} testId="failed-deliveries">
            {refused === 0 ? (
                <p className="py-2 text-left text-[14px] text-muted" dir={dir}>{t("fin.failed.none")}</p>
            ) : (
                <>
                    <dl className="grid grid-cols-2 gap-4">
                        <div>
                            <dt className="text-left text-[12.5px] text-muted" dir={dir}>{t("fin.failed.count")}</dt>
                            <dd className="mt-1 text-[24px] font-semibold tabular-nums tracking-[-0.02em] text-foreground">{formatWhole(refused)}</dd>
                        </div>
                        <div>
                            <dt className="text-left text-[12.5px] text-muted" dir={dir}>{t("fin.failed.value")}</dt>
                            <dd className="mt-1"><Money value={value} className="text-[24px] font-semibold tracking-[-0.02em] text-foreground" /></dd>
                        </div>
                    </dl>
                    {share !== null && (
                        <p className="mt-4 text-left text-[13.5px] leading-relaxed text-muted" dir={dir} data-testid="failed-share">
                            {t("fin.failed.share", { n: formatWhole(share * 100) })}
                        </p>
                    )}
                    <Link
                        href="/orders?status=rejected"
                        className="mt-2 inline-flex items-center gap-1 text-[13px] font-medium text-foreground underline decoration-[var(--card-border)] underline-offset-4 hover:decoration-current"
                    >
                        {t("fin.failed.open")}
                        <ArrowUpRight className="size-3.5" aria-hidden="true" />
                    </Link>
                </>
            )}
        </SummaryCard>
    );
}
