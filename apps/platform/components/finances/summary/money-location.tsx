"use client";

import Link from "next/link";
import { ArrowUpRight, HandCoins, Truck, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useLanguage, useTextDir } from "@/hooks/use-language";
import { primeOwes, type FinanceSummary } from "@/lib/finance/summary";
import { Money, formatWhole, useMoneyText } from "./money";
import { SummaryCard } from "./summary-card";

interface MoneyLocationProps {
    summary: FinanceSummary;
}

interface StepProps {
    icon: LucideIcon;
    label: string;
    note: string;
    amount: number;
    textDir: "rtl" | "ltr";
    action?: ReactNode;
    testId: string;
}

function Step({ icon: Icon, label, note, amount, textDir, action, testId }: StepProps) {
    return (
        <div className="flex items-start gap-3.5 py-3.5" data-testid={testId}>
            <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-[var(--background-soft)] text-foreground">
                <Icon className="size-[18px]" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-3">
                    <span className="text-left text-[14.5px] font-medium text-foreground" dir={textDir}>{label}</span>
                    <Money value={amount} className="text-[18px] font-semibold text-foreground" />
                </div>
                <p className="mt-0.5 text-left text-[12.5px] leading-relaxed text-muted" dir={textDir}>{note}</p>
                {action}
            </div>
        </div>
    );
}

const linkClass =
    "mt-1.5 inline-flex items-center gap-1 text-[12.5px] font-medium text-foreground underline decoration-[var(--card-border)] underline-offset-4 hover:decoration-current";

/**
 * Order money that has not reached the merchant: parcels still with the
 * courier, and delivered parcels Prime has collected but not paid out. Both
 * are as of now, whatever period is picked. (Stuck parcels are raised by the
 * alert above the cards, so they are not repeated here.)
 */
export function MoneyLocation({ summary }: MoneyLocationProps) {
    const { t } = useLanguage();
    const dir = useTextDir();
    const money = useMoneyText();
    const { in_transit: road, prime_linked: primeLinked, prime_held: held } = summary.cash;
    const nothingOutside = road.count === 0 && held.parcels === 0;

    return (
        <SummaryCard title={t("fin.money.title")} sub={t("fin.money.sub")} textDir={dir} testId="money-location">
            {nothingOutside ? (
                <p className="py-2 text-left text-[14px] text-muted" dir={dir}>{t("fin.money.none")}</p>
            ) : (
                <div className="divide-y divide-[var(--card-border)]">
                    <Step
                        icon={Truck}
                        label={t("fin.money.road")}
                        note={t("fin.money.road.note", { n: formatWhole(road.count) })}
                        amount={road.amount}
                        textDir={dir}
                        testId="money-road"
                    />
                    {primeLinked && (
                        <Step
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
                            testId="money-prime"
                            action={
                                <Link href="/prime" className={linkClass}>
                                    {t("fin.money.prime.open")}
                                    <ArrowUpRight className="size-3.5" aria-hidden="true" />
                                </Link>
                            }
                        />
                    )}
                </div>
            )}
        </SummaryCard>
    );
}
