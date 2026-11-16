"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage, useTextDir } from "@/hooks/use-language";
import { refusedShare, type FinanceSummary } from "@/lib/finance/summary";
import { LOSS_COLOR } from "./colors";
import { Money, formatWhole, useMoneyText } from "./money";
import { CARD_FIGURE, CARD_LINK, SummaryCard } from "./summary-card";

interface ReturnedParcelsProps {
    summary: FinanceSummary;
}

const SQUARES = 100;
/** Steps through the hundred squares without repeating one, so the returned ones are spread out, the same way every time. */
const SPREAD = 37;

function returnedSquares(count: number): Set<number> {
    return new Set(Array.from({ length: count }, (_, k) => (k * SPREAD + 13) % SQUARES));
}

/**
 * Parcels refused at the door: how many of every hundred came back, what that
 * was worth, then the hundred parcels drawn with the returned ones in rose,
 * and the courier's fee on the way back when there is one.
 */
export function ReturnedParcels({ summary }: ReturnedParcelsProps) {
    const { t } = useLanguage();
    const dir = useTextDir();
    const money = useMoneyText();
    const { refused_orders: refused, refused_value: value, prime_returned_parcels: returnedParcels, prime_returned_fee: fee } = summary.failed;
    const share = refusedShare(summary);
    const ofHundred = share === null ? 0 : Math.round(share * SQUARES);
    const rose = returnedSquares(ofHundred);

    return (
        <SummaryCard
            title={t("fin.failed.title")}
            sub={t("fin.failed.sub")}
            textDir={dir}
            testId="returned-parcels"
            className="h-full"
            footer={
                refused > 0 && (
                    <Link href="/orders?status=rejected&dates=all" className={CARD_LINK}>
                        {t("fin.failed.open")}
                        <ArrowUpRight className="size-3.5" aria-hidden="true" />
                    </Link>
                )
            }
        >
            {refused === 0 ? (
                <p className="py-2 text-left text-[14px] text-muted" dir={dir}>{t("fin.failed.none")}</p>
            ) : (
                <>
                    <div className={cn(CARD_FIGURE, "whitespace-nowrap text-left")} dir={dir} data-testid="failed-share">
                        <span className="text-rose-600 dark:text-rose-400" dir="ltr">
                            {ofHundred === 0 ? t("fin.failed.lessThanOne") : formatWhole(ofHundred)}
                        </span>{" "}
                        {t("fin.failed.ofHundred")}
                    </div>
                    <p className="mt-2.5 text-left text-[13.5px] leading-relaxed text-muted" dir={dir} data-testid="failed-cost">
                        {t("fin.failed.cost", { refused: formatWhole(refused), count: refused, value: money(value) })}
                    </p>
                    <div className="mt-4 flex items-center justify-between gap-3 text-[12.5px] text-muted">
                        <span className="flex items-center gap-1.5">
                            <span className="size-2.5 rounded-[3px]" style={{ background: LOSS_COLOR }} aria-hidden="true" />
                            <span dir={dir}>{t("fin.failed.legend.back", { n: formatWhole(ofHundred) })}</span>
                        </span>
                        <span className="flex items-center gap-1.5">
                            <span className="size-2.5 rounded-[3px] bg-emerald-500/25 dark:bg-emerald-400/35" aria-hidden="true" />
                            <span dir={dir}>{t("fin.failed.legend.kept", { n: formatWhole(SQUARES - ofHundred) })}</span>
                        </span>
                    </div>
                    <div
                        className="mt-2 grid grid-cols-[repeat(20,minmax(0,1fr))] gap-[4px]"
                        role="img"
                        aria-label={t("fin.failed.share", { n: formatWhole(ofHundred) })}
                    >
                        {Array.from({ length: SQUARES }, (_, i) => (
                            <span
                                key={i}
                                className={cn("aspect-square rounded-[3px]", !rose.has(i) && "bg-emerald-500/25 dark:bg-emerald-400/35")}
                                style={rose.has(i) ? { background: LOSS_COLOR } : undefined}
                            />
                        ))}
                    </div>
                    {fee > 0 && (
                        <div className="mt-4 flex items-baseline justify-between gap-4 text-[13px]" data-testid="failed-fee">
                            <span className="text-left text-muted" dir={dir}>{t("fin.failed.fee", { n: formatWhole(returnedParcels), count: returnedParcels })}</span>
                            <Money value={fee} className="font-semibold text-foreground" />
                        </div>
                    )}
                </>
            )}
        </SummaryCard>
    );
}
