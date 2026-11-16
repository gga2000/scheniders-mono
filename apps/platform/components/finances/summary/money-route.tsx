"use client";

import Link from "next/link";
import { ArrowUpRight, FileUp } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { useLanguage, useTextDir } from "@/hooks/use-language";
import type { FinanceSummary } from "@/lib/finance/summary";
import { COST_COLORS, PROFIT_COLOR } from "./colors";
import { Money, formatWhole, useMoneyText } from "./money";
import { CARD_LINK, SummaryCard } from "./summary-card";

interface MoneyRouteProps {
    summary: FinanceSummary;
    /** Opens the courier payment file import: how an unpaid order becomes paid. */
    onAddPayment: () => void;
}

/** Your money, not in your hand yet: the green of "reached you", striped. */
const UNPAID_FILL = `repeating-linear-gradient(135deg, ${PROFIT_COLOR} 0 3px, ${PROFIT_COLOR}59 3px 6px)`;
const FILLS = {
    reached: PROFIT_COLOR,
    fee: COST_COLORS.delivery,
    unpaid: UNPAID_FILL,
} as const;

type Part = keyof typeof FILLS;

interface PartRowProps {
    part: Part | "road";
    label: string;
    note: string;
    amount: number;
    textDir: "rtl" | "ltr";
    children?: ReactNode;
}

function PartRow({ part, label, note, amount, textDir, children }: PartRowProps) {
    const swatch: CSSProperties | undefined = part === "road" ? undefined : { background: FILLS[part] };
    return (
        <li className="grid grid-cols-[12px_minmax(0,1fr)_auto] items-start gap-x-3 py-3 first:pt-0 last:pb-0" data-testid={`money-${part}`}>
            <span
                className={part === "road" ? "mt-[5px] size-3 rounded-[4px] border-2 border-dashed border-stone-400 dark:border-stone-500" : "mt-[5px] size-3 rounded-[4px]"}
                style={swatch}
                aria-hidden="true"
            />
            <div className="min-w-0">
                <div className="text-left text-[15px] font-semibold text-foreground" dir={textDir}>{label}</div>
                <p className="mt-0.5 text-left text-[13px] leading-relaxed text-muted" dir={textDir}>{note}</p>
                {children}
            </div>
            <Money value={amount} className="text-[18px] font-bold tracking-[-0.01em] text-foreground" />
        </li>
    );
}

/**
 * Where the period's sales are now. The delivered sales are cut in three,
 * order by order: what already reached the shop (after the delivery fee), the
 * delivery fee itself, and what the courier or Prime has not paid yet. The
 * three add up to the sales to the dinar, so nothing looks missing. Parcels
 * still on the road sit under a line, because they are not sales yet. The
 * courier payments dated in the period are a quiet caption: a payment file can
 * pay for orders of an earlier period, so that figure never matches the sales.
 * Stuck parcels are not repeated here: the strip and the banner above carry them.
 */
export function MoneyRoute({ summary, onAddPayment }: MoneyRouteProps) {
    const { t } = useLanguage();
    const dir = useTextDir();
    const money = useMoneyText();
    const { in_transit: road, returning, prime_linked: primeLinked, reached: payments, split } = summary.cash;
    const { orders, revenue } = summary.sales;
    const courierOnly = split.unpaid_orders - split.unpaid_prime;
    const sold = orders > 0;
    const onRoad = road.count > 0 || returning.count > 0;

    const share = (amount: number) => (revenue > 0 ? Math.round((Math.max(amount, 0) / revenue) * 100) : 0);
    const unpaidNote =
        split.unpaid_orders === 0
            ? t("fin.money.unpaid.none")
            : split.unpaid_prime > 0 && courierOnly > 0
              ? t("fin.money.unpaid.both", {
                    n: formatWhole(split.unpaid_orders),
                    count: split.unpaid_orders,
                    prime: formatWhole(split.unpaid_prime),
                    courier: formatWhole(courierOnly),
                })
              : split.unpaid_prime > 0
                ? t("fin.money.unpaid.prime", { n: formatWhole(split.unpaid_prime), count: split.unpaid_prime })
                : t("fin.money.unpaid.courier", { n: formatWhole(courierOnly), count: courierOnly });
    const paymentsNote =
        payments.payments === 0
            ? t("fin.money.payments.none")
            : payments.payments === 1
              ? t("fin.money.payments.one", { amount: money(payments.amount) })
              : t("fin.money.payments", { n: formatWhole(payments.payments), amount: money(payments.amount) });

    return (
        <SummaryCard
            title={t("fin.money.title")}
            sub={t("fin.money.sub")}
            textDir={dir}
            testId="money-route"
            className="h-full"
            action={
                sold && (
                    <div className="text-right" data-testid="money-sold">
                        <Money value={revenue} className="text-[22px] font-bold tracking-[-0.01em] text-foreground" />
                        <p className="mt-0.5 text-[12.5px] text-muted" dir={dir}>
                            {t("fin.money.orders", { n: formatWhole(orders), count: orders })}
                        </p>
                    </div>
                )
            }
            footer={
                <div className="w-full">
                    <p className="text-left text-[13px] leading-relaxed text-muted" dir={dir} data-testid="money-payments">{paymentsNote}</p>
                    <button type="button" onClick={onAddPayment} className={`${CARD_LINK} mt-1.5`} data-testid="money-add-payment">
                        <FileUp className="size-3.5" aria-hidden="true" />
                        {t("fin.money.addPayment")}
                    </button>
                </div>
            }
        >
            {!sold && !onRoad && <p className="py-2 text-left text-[14px] text-muted" dir={dir}>{t("fin.money.none")}</p>}

            {sold && (
                <>
                    <div
                        className="mb-5 flex h-3 gap-[3px] overflow-hidden rounded-full"
                        role="img"
                        aria-label={t("fin.money.split", { reached: share(split.reached), fee: share(split.fee), unpaid: share(split.unpaid) })}
                        data-testid="money-split"
                    >
                        {(["reached", "fee", "unpaid"] as const).map((part) =>
                            split[part] > 0 ? (
                                <i key={part} className="block min-w-[3px]" style={{ flex: `${split[part]} 1 0`, background: FILLS[part] }} />
                            ) : null,
                        )}
                    </div>
                    <ul>
                        <PartRow
                            part="reached"
                            label={t("fin.money.reached")}
                            note={t("fin.money.reached.note", { n: formatWhole(split.reached_orders), count: split.reached_orders })}
                            amount={split.reached}
                            textDir={dir}
                        />
                        <PartRow
                            part="fee"
                            label={t("fin.money.fee")}
                            note={primeLinked ? t("fin.money.fee.note") : t("fin.money.fee.noteCourier")}
                            amount={split.fee}
                            textDir={dir}
                        />
                        <PartRow part="unpaid" label={t("fin.money.unpaid")} note={unpaidNote} amount={split.unpaid} textDir={dir}>
                            {split.unpaid_prime > 0 && (
                                <Link href="/prime" className={`${CARD_LINK} mt-1.5`}>
                                    {t("fin.money.prime.open")}
                                    <ArrowUpRight className="size-3.5" aria-hidden="true" />
                                </Link>
                            )}
                        </PartRow>
                    </ul>
                </>
            )}

            {onRoad && (
                <ul className={sold ? "mt-4 border-t border-[var(--card-border)] pt-4" : undefined}>
                    <PartRow
                        part="road"
                        label={t("fin.money.road")}
                        note={t("fin.money.road.note", { n: formatWhole(road.count), count: road.count })}
                        amount={road.amount}
                        textDir={dir}
                    >
                        {returning.count > 0 && (
                            <p className="mt-0.5 text-left text-[13px] leading-relaxed text-muted" dir={dir} data-testid="money-returning">
                                {t("fin.money.returning", { n: formatWhole(returning.count), count: returning.count })}
                            </p>
                        )}
                    </PartRow>
                </ul>
            )}
        </SummaryCard>
    );
}
