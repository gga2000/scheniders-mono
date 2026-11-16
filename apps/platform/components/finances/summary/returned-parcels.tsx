"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage, useTextDir } from "@/hooks/use-language";
import { refusedShare, type FinanceSummary } from "@/lib/finance/summary";
import { LOSS_COLOR } from "./colors";
import { Money, formatWhole } from "./money";
import { SummaryCard } from "./summary-card";

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
 * Parcels refused at the door, drawn as a hundred parcels: the ones that came
 * back in rose. Under it what they cost: the sales that never arrived and the
 * courier's fee on the way back.
 */
export function ReturnedParcels({ summary }: ReturnedParcelsProps) {
    const { t } = useLanguage();
    const dir = useTextDir();
    const { refused_orders: refused, refused_value: value, prime_returned_parcels: returnedParcels, prime_returned_fee: fee } = summary.failed;
    const share = refusedShare(summary);
    const ofHundred = share === null ? 0 : Math.round(share * SQUARES);
    const rose = returnedSquares(ofHundred);

    return (
        <SummaryCard title={t("fin.failed.title")} sub={t("fin.failed.sub")} textDir={dir} testId="returned-parcels" className="h-full">
            {refused === 0 ? (
                <p className="py-2 text-left text-[14px] text-muted" dir={dir}>{t("fin.failed.none")}</p>
            ) : (
                <>
                    <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-5">
                        <div className="grid grid-cols-[repeat(10,13px)] gap-[5px]" role="img" aria-label={t("fin.failed.share", { n: formatWhole(ofHundred) })}>
                            {Array.from({ length: SQUARES }, (_, i) => (
                                <span
                                    key={i}
                                    className={cn("size-[13px] rounded-[4px]", !rose.has(i) && "bg-emerald-500/25 dark:bg-emerald-400/20")}
                                    style={rose.has(i) ? { background: LOSS_COLOR } : undefined}
                                />
                            ))}
                        </div>
                        <div>
                            <div className="whitespace-nowrap text-left text-[30px] font-bold leading-none tracking-[-0.02em] text-foreground" dir={dir} data-testid="failed-share">
                                <span className="text-rose-600 dark:text-rose-400" dir="ltr">
                                    {ofHundred === 0 ? t("fin.failed.lessThanOne") : formatWhole(ofHundred)}
                                </span>{" "}
                                {t("fin.failed.back")}
                            </div>
                            <p className="mt-2 text-left text-[13.5px] leading-relaxed text-muted" dir={dir}>
                                {t("fin.failed.kept", { kept: formatWhole(SQUARES - ofHundred), refused: formatWhole(refused), count: refused })}
                            </p>
                        </div>
                    </div>
                    <dl className={cn("mt-5 grid gap-3", fee > 0 ? "grid-cols-2" : "grid-cols-1")}>
                        <div className="rounded-[14px] bg-[var(--background-soft)] px-3.5 py-3">
                            <dt className="text-left text-[12.5px] text-muted" dir={dir}>{t("fin.failed.value")}</dt>
                            <dd className="mt-0.5"><Money value={value} className="text-[18px] font-bold text-foreground" /></dd>
                        </div>
                        {fee > 0 && (
                            <div className="rounded-[14px] bg-[var(--background-soft)] px-3.5 py-3" data-testid="failed-fee">
                                <dt className="text-left text-[12.5px] text-muted" dir={dir}>{t("fin.failed.fee", { n: formatWhole(returnedParcels), count: returnedParcels })}</dt>
                                <dd className="mt-0.5"><Money value={fee} className="text-[18px] font-bold text-foreground" /></dd>
                            </div>
                        )}
                    </dl>
                    <Link
                        href="/orders?status=rejected"
                        className="mt-3 inline-flex items-center gap-1 text-[13px] font-semibold text-foreground underline decoration-[var(--card-border)] underline-offset-4 hover:decoration-current"
                    >
                        {t("fin.failed.open")}
                        <ArrowUpRight className="size-3.5" aria-hidden="true" />
                    </Link>
                </>
            )}
        </SummaryCard>
    );
}
