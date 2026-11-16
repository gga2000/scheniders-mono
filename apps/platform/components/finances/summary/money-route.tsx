"use client";

import Link from "next/link";
import { ArrowUpRight, FileUp, HandCoins, Truck, Wallet, type LucideIcon } from "lucide-react";
import { useMemo, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useLanguage, useTextDir } from "@/hooks/use-language";
import { primeOwes, type FinanceSummary } from "@/lib/finance/summary";
import { Money, formatWhole, useMoneyText } from "./money";
import { SummaryCard } from "./summary-card";

interface MoneyRouteProps {
    summary: FinanceSummary;
    /** Opens the courier payment file import: how a payment gets onto the last stop. */
    onAddPayment: () => void;
}

interface StopProps {
    icon: LucideIcon;
    label: string;
    note: string;
    amount: number;
    textDir: "rtl" | "ltr";
    /** Draw the dashed road down to the next stop. */
    road: boolean;
    /** The last stop, where the money is in hand: its icon turns green. */
    arrived?: boolean;
    children?: ReactNode;
    testId: string;
}

function Stop({ icon: Icon, label, note, amount, textDir, road, arrived = false, children, testId }: StopProps) {
    return (
        <li className="relative grid grid-cols-[44px_minmax(0,1fr)_auto] items-start gap-x-3.5 pb-6 last:pb-0" data-testid={testId}>
            {road && <span className="absolute bottom-1 left-[21px] top-[50px] border-l-2 border-dashed border-[var(--card-border)]" aria-hidden="true" />}
            <span
                className={cn(
                    "flex size-11 items-center justify-center rounded-[14px]",
                    arrived ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300" : "bg-[var(--background-soft)] text-foreground",
                )}
            >
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
 * courier, then delivered parcels Prime has collected but not paid out (both as
 * of now, whatever period is picked), and last the courier payments that
 * reached the shop in the period. Payments are dated by the courier, sales by
 * the delivery, so the last line says how many of the period's delivered orders
 * are already paid: without it the card looks as if money were missing.
 * Stuck parcels are not repeated here: the strip and the banner above carry them.
 */
export function MoneyRoute({ summary, onAddPayment }: MoneyRouteProps) {
    const { t, language } = useLanguage();
    const dir = useTextDir();
    const money = useMoneyText();
    const { in_transit: road, returning, prime_linked: primeLinked, prime_held: held, reached } = summary.cash;
    const { orders, paid_orders: paid } = summary.sales;
    const nothingOutside = road.count === 0 && returning.count === 0 && held.parcels === 0 && reached.payments === 0;
    const dayText = useMemo(
        () => new Intl.DateTimeFormat(language === "ar" ? "ar-IQ-u-nu-latn" : "en-US", { day: "numeric", month: "short", timeZone: "UTC" }),
        [language],
    );
    const lastDay = reached.last_day === null ? "" : dayText.format(new Date(`${reached.last_day}T00:00:00Z`));
    const reachedNote =
        reached.payments === 0
            ? t("fin.money.reached.none")
            : reached.payments === 1
              ? t("fin.money.reached.one", { date: lastDay })
              : t("fin.money.reached.many", { n: formatWhole(reached.payments), date: lastDay, amount: money(reached.last_amount) });
    const addPayment = (
        <button
            type="button"
            onClick={onAddPayment}
            className="mt-2 inline-flex items-center gap-1.5 text-[13px] font-semibold text-foreground underline decoration-[var(--card-border)] underline-offset-4 hover:decoration-current"
            data-testid="money-add-payment"
        >
            <FileUp className="size-3.5" aria-hidden="true" />
            {t("fin.money.addPayment")}
        </button>
    );

    return (
        <SummaryCard title={t("fin.money.title")} sub={t("fin.money.sub")} textDir={dir} testId="money-route" className="h-full">
            {nothingOutside ? (
                <div className="py-2">
                    <p className="text-left text-[14px] text-muted" dir={dir}>{t("fin.money.none")}</p>
                    {addPayment}
                </div>
            ) : (
                <ol>
                    <Stop
                        icon={Truck}
                        label={t("fin.money.road")}
                        note={t("fin.money.road.note", { n: formatWhole(road.count), count: road.count })}
                        amount={road.amount}
                        textDir={dir}
                        road
                        testId="money-road"
                    >
                        {returning.count > 0 && (
                            <p className="mt-0.5 text-left text-[13px] leading-relaxed text-muted" dir={dir} data-testid="money-returning">
                                {t("fin.money.returning", { n: formatWhole(returning.count), count: returning.count })}
                            </p>
                        )}
                    </Stop>
                    {/* Shown with a Prime link, and whenever Prime holds the shop's money (the demo store has no link row). */}
                    {(primeLinked || held.parcels > 0) && (
                        <Stop
                            icon={HandCoins}
                            label={t("fin.money.prime")}
                            note={
                                held.parcels === 0
                                    ? t("fin.money.prime.none")
                                    : t("fin.money.prime.note", {
                                          n: formatWhole(held.parcels),
                                          count: held.parcels,
                                          collected: money(held.collected),
                                          fee: money(held.fee),
                                      })
                            }
                            amount={primeOwes(summary)}
                            textDir={dir}
                            road
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
                    <Stop
                        icon={Wallet}
                        label={t("fin.money.reached")}
                        note={reachedNote}
                        amount={reached.amount}
                        textDir={dir}
                        road={false}
                        arrived
                        testId="money-reached"
                    >
                        {addPayment}
                    </Stop>
                </ol>
            )}
            {orders > 0 && paid > 0 && (
                <p
                    className="mt-5 border-t border-[var(--card-border)] pt-3.5 text-left text-[13px] leading-relaxed text-muted"
                    dir={dir}
                    data-testid="money-paid"
                >
                    {paid >= orders
                        ? t("fin.money.paidAll", { orders: formatWhole(orders) })
                        : t("fin.money.paid", { orders: formatWhole(orders), paid: formatWhole(paid) })}
                </p>
            )}
        </SummaryCard>
    );
}
