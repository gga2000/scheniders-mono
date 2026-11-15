"use client";

import Link from "next/link";
import { ArrowUpRight, Clock, HandCoins, Truck, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useLanguage, useTextDir } from "@/hooks/use-language";
import { primeOwes, type FinanceSummary } from "@/lib/finance/summary";
import { Money, formatWhole, useMoneyText } from "./money";
import { SummaryCard } from "./summary-card";

interface MoneyRouteProps {
    summary: FinanceSummary;
}

interface StopProps {
    icon: LucideIcon;
    label: string;
    note: string;
    amount: number;
    textDir: "rtl" | "ltr";
    /** Draw the dashed road down to the next stop. */
    road: boolean;
    children?: ReactNode;
    testId: string;
}

function Stop({ icon: Icon, label, note, amount, textDir, road, children, testId }: StopProps) {
    return (
        <li className="relative grid grid-cols-[44px_minmax(0,1fr)_auto] items-start gap-x-3.5 pb-6 last:pb-0" data-testid={testId}>
            {road && <span className="absolute bottom-1 left-[21px] top-[50px] border-l-2 border-dashed border-[var(--card-border)]" aria-hidden="true" />}
            <span className="flex size-11 items-center justify-center rounded-[14px] bg-[var(--background-soft)] text-foreground">
                <Icon className="size-5" aria-hidden="true" />
            </span>
            <div className="min-w-0 pt-0.5">
                <div className="text-left text-[15px] font-semibold text-foreground" dir={textDir}>{label}</div>
                <p className="mt-0.5 text-left text-[13px] leading-relaxed text-muted" dir={textDir}>{note}</p>
                {children}
            </div>
            <Money value={amount} className="pt-0.5 text-[20px] font-bold tracking-[-0.01em] text-foreground" />
        </li>
    );
}

/**
 * The road order money takes to the merchant, as stops: parcels still with the
 * courier, then delivered parcels Prime has collected but not paid out. Both
 * are as of now, whatever period is picked.
 */
export function MoneyRoute({ summary }: MoneyRouteProps) {
    const { t } = useLanguage();
    const dir = useTextDir();
    const money = useMoneyText();
    const { in_transit: road, stuck, prime_linked: primeLinked, prime_held: held } = summary.cash;
    const nothingOutside = road.count === 0 && held.parcels === 0;

    return (
        <SummaryCard title={t("fin.money.title")} sub={t("fin.money.sub")} textDir={dir} testId="money-route" className="h-full">
            {nothingOutside ? (
                <p className="py-2 text-left text-[14px] text-muted" dir={dir}>{t("fin.money.none")}</p>
            ) : (
                <ol>
                    <Stop
                        icon={Truck}
                        label={t("fin.money.road")}
                        note={t("fin.money.road.note", { n: formatWhole(road.count) })}
                        amount={road.amount}
                        textDir={dir}
                        road={primeLinked}
                        testId="money-road"
                    >
                        {stuck.count > 0 && (
                            <Link
                                href="/orders?status=in_transit"
                                className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-amber-500/12 px-2.5 py-1 text-[12px] font-semibold text-amber-800 transition-colors hover:bg-amber-500/20 dark:text-amber-200"
                                data-testid="money-stuck"
                            >
                                <Clock className="size-3.5 shrink-0" aria-hidden="true" />
                                <span dir={dir}>{t("fin.money.stuck", { n: formatWhole(stuck.count), amount: money(stuck.amount) })}</span>
                            </Link>
                        )}
                    </Stop>
                    {primeLinked && (
                        <Stop
                            icon={HandCoins}
                            label={t("fin.money.prime")}
                            note={
                                held.parcels === 0
                                    ? t("fin.money.prime.none")
                                    : t("fin.money.prime.note", {
                                          n: formatWhole(held.parcels),
                                          collected: money(held.collected),
                                          fee: money(held.fee),
                                      })
                            }
                            amount={primeOwes(summary)}
                            textDir={dir}
                            road={false}
                            testId="money-prime"
                        >
                            <Link
                                href="/prime"
                                className="mt-2 inline-flex items-center gap-1 text-[13px] font-semibold text-foreground underline decoration-[var(--card-border)] underline-offset-4 hover:decoration-current"
                            >
                                {t("fin.money.prime.open")}
                                <ArrowUpRight className="size-3.5" aria-hidden="true" />
                            </Link>
                        </Stop>
                    )}
                </ol>
            )}
        </SummaryCard>
    );
}
