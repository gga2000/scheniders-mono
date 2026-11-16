"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { useLanguage, useTextDir } from "@/hooks/use-language";
import type { CostLine, FinanceSummary } from "@/lib/finance/summary";
import { COST_COLORS, PROFIT_COLOR } from "./colors";
import { Money, formatWhole, useMoneyText } from "./money";
import { COURIER_PAYMENTS_ID } from "./courier-payments";
import { CARD_LINK, SummaryCard } from "./summary-card";
import { UnpaidOrders } from "./unpaid-orders";

interface MoneyRouteProps {
    summary: FinanceSummary;
    /** The statement's Delivery line: it also counts what this card leaves out (returned parcels, courier bills). */
    delivery: CostLine;
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
            </div>
            <Money value={amount} className="text-[18px] font-bold tracking-[-0.01em] text-foreground" />
            {/* Spans the amount column too, so every amount on the card ends at the same edge. */}
            {children && <div className="col-span-2 col-start-2 min-w-0">{children}</div>}
        </li>
    );
}

/**
 * Where the period's sales are now. The delivered sales are cut in three,
 * order by order: what already reached the shop (after the delivery fee), the
 * delivery fee itself, and what the courier or Prime has not paid yet. The
 * three add up to the sales to the dinar, so nothing looks missing. Parcels
 * still on the road sit under a line, because they are not sales yet. The
 * courier payments dated in the period have their own card (CourierPayments):
 * a payment file can pay for orders of an earlier period. The road line says how many of its
 * parcels are the stuck ones the strip counts, so the two numbers are not added up.
 */
export function MoneyRoute({ summary, delivery }: MoneyRouteProps) {
    const { t } = useLanguage();
    const dir = useTextDir();
    const money = useMoneyText();
    const { in_transit: road, returning, split, reached: payments, statement } = summary.cash;
    const cashForNow =
        payments.payments > 0 ? split.reached_now + statement.returns + statement.prepaid_gap + statement.price_gap : split.reached_now;
    const { orders, revenue } = summary.sales;
    // The note counts every unpaid order, so paid + unpaid adds up to the period's orders; the
    // list under it names those that still owe money, and a line there counts the ones that owe nothing.
    const owedOrders = split.unpaid_orders;
    const owedPrime = split.unpaid_prime;
    const courierOnly = owedOrders - owedPrime;
    const sold = orders > 0;
    const onRoad = road.count > 0 || returning.count > 0;

    const share = (amount: number) => (revenue > 0 ? Math.round((Math.max(amount, 0) / revenue) * 100) : 0);
    const unpaidNote =
        split.unpaid_orders === 0
            ? t("fin.money.unpaid.none")
            : owedPrime > 0 && courierOnly > 0
              ? t("fin.money.unpaid.both", {
                    n: formatWhole(owedOrders),
                    count: owedOrders,
                    prime: formatWhole(owedPrime),
                    courier: formatWhole(courierOnly),
                })
              : owedPrime > 0
                ? t("fin.money.unpaid.prime", { n: formatWhole(owedPrime), count: owedPrime })
                : t("fin.money.unpaid.courier", { n: formatWhole(courierOnly), count: courierOnly });
    // The statement's Delivery line adds the fee on parcels that came back and the courier bills:
    // say so here, so the two delivery figures on the page never look like they disagree.
    const part = (key: string) => delivery.parts.find((p) => p.key === key)?.amount ?? 0;
    const returnedFee = part("prime_returned_fee");
    const bills = part("courier_bills");
    const deliveryNote =
        returnedFee === 0 && bills === 0
            ? null
            : t(returnedFee !== 0 && bills !== 0 ? "fin.money.fee.both" : returnedFee !== 0 ? "fin.money.fee.returned" : "fin.money.fee.bills", {
                  total: money(delivery.amount),
                  extra: money(returnedFee + bills),
              });
    // "Paid to you" by where its money came from, listed under it so the parts visibly add up.
    const fromElsewhere = split.reached_before > 0 || split.reached_other > 0 || split.reached_prepaid > 0;
    const sources = fromElsewhere
        ? [
              {
                  key: "now",
                  label: t("fin.money.from.now"),
                  // The statements' price of these orders is not the cash: the refunds, prepaid fees and price
                  // differences on the same statements come off it (the payments card lists each one).
                  note: cashForNow !== split.reached_now ? t("fin.money.from.nowNote", { paid: money(cashForNow) }) : null,
                  amount: split.reached_now,
                  href: `#${COURIER_PAYMENTS_ID}`,
              },
              { key: "before", label: t("fin.money.from.before"), note: t("fin.money.from.beforeNote"), amount: split.reached_before, href: null },
              {
                  key: "prepaid",
                  label:
                      split.reached_prepaid_orders > 0
                          ? t("fin.money.from.prepaid", { n: formatWhole(split.reached_prepaid_orders), count: split.reached_prepaid_orders })
                          : t("fin.money.from.prepaidPlain"),
                  note: null,
                  amount: split.reached_prepaid,
                  href: null,
              },
              { key: "other", label: t("fin.money.from.other"), note: null, amount: split.reached_other, href: null },
          ].filter((source) => source.amount > 0)
        : [];

    return (
        <SummaryCard
            title={t("fin.money.title")}
            sub={t("fin.money.sub")}
            textDir={dir}
            testId="money-route"
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
                        >
                            {sources.length > 0 && (
                                <dl className="mt-2 space-y-1 border-s-2 border-[var(--card-border)] ps-3" data-testid="money-reached-parts">
                                    {sources.map((source) => (
                                        <div key={source.key} className="flex items-baseline justify-between gap-4 text-[13px]">
                                            <dt className="min-w-0 text-left text-muted" dir={dir}>
                                                {source.label}
                                                {source.note && <span className="block text-[12px]">{source.note}</span>}
                                                {/* The statement part is what the courier payments card takes apart: link the two. */}
                                                {source.href && (
                                                    <Link href={source.href} className="mt-0.5 block w-fit text-[12px] font-semibold text-foreground underline decoration-foreground/30 underline-offset-4 hover:decoration-current" data-testid="money-from-now-link">
                                                        {t("fin.money.from.nowLink")}
                                                    </Link>
                                                )}
                                            </dt>
                                            <dd className="shrink-0">
                                                <Money value={source.amount} className="font-semibold text-foreground" />
                                            </dd>
                                        </div>
                                    ))}
                                </dl>
                            )}
                        </PartRow>
                        <PartRow
                            part="fee"
                            label={t("fin.money.fee")}
                            note={summary.courier.prime_fee > 0 ? t("fin.money.fee.note") : t("fin.money.fee.noteCourier")}
                            amount={split.fee}
                            textDir={dir}
                        >
                            {deliveryNote && (
                                <p className="mt-0.5 text-left text-[13px] leading-relaxed text-muted" dir={dir} data-testid="money-fee-statement">
                                    {deliveryNote}
                                </p>
                            )}
                        </PartRow>
                        <PartRow part="unpaid" label={t("fin.money.unpaid")} note={unpaidNote} amount={split.unpaid} textDir={dir}>
                            <UnpaidOrders orders={summary.cash.unpaid_list} total={split.unpaid_orders} />
                            {/* Shown whenever Prime holds unpaid orders, link row or not (the demo store has none). */}
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
                        {summary.cash.stuck.count > 0 && (
                            <p className="mt-0.5 text-left text-[13px] leading-relaxed text-muted" dir={dir} data-testid="money-road-stuck">
                                {t("fin.money.road.stuck", {
                                    n: formatWhole(summary.cash.stuck.count),
                                    count: summary.cash.stuck.count,
                                    amount: money(summary.cash.stuck.amount),
                                })}
                            </p>
                        )}
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
