"use client";

import Link from "next/link";
import { ArrowUpRight, ChevronRight } from "lucide-react";
import { useState, type CSSProperties, type ReactNode } from "react";
import { useLanguage, useTextDir } from "@/hooks/use-language";
import { STUCK_ORDERS_HREF } from "@/lib/orders/stuck-in-transit";
import { cn } from "@/lib/utils";
import type { CostLine, FinanceSummary } from "@/lib/finance/summary";
import { COST_COLORS, PROFIT_COLOR } from "./colors";
import { Money, formatWhole, useMoneyText } from "./money";
import { COURIER_PAYMENTS_ID } from "./courier-payments";
import { CARD_LINK, SummaryCard } from "./summary-card";
import { UnpaidOrders } from "./unpaid-orders";

/** The Orders page's «راجع» queue: the refused parcels Prime is bringing back. */
const RETURNING_ORDERS_HREF = "/orders?queue=back";

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

/** The link from the statements part to the courier payments card that takes it apart. */
function NowLink({ href, label }: { href: string; label: string }) {
    return (
        <Link
            href={href}
            className="mt-1 block w-fit text-[12px] font-semibold text-foreground underline decoration-foreground/30 underline-offset-4 hover:decoration-current"
            data-testid="money-from-now-link"
        >
            {label}
        </Link>
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
    // The lines that match 6,810,500 to the payments card fold away, so the open card only shows parts that add up to "paid to you".
    const [linesOpen, setLinesOpen] = useState(false);
    const { in_transit: road, returning, split, reached: payments, statement } = summary.cash;
    // What the statements finally paid for this period's orders: their price after the refunds and price
    // differences on the same statements. The fees they took off prepaid orders are not in it: those orders
    // are in "paid to you" after their fee already, so taking the fee off here too would count it twice.
    const cashForNow = payments.payments > 0 ? split.reached_now + statement.returns + statement.price_gap : split.reached_now;
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
    // The statements also paid for orders not marked delivered (outside this card): when that is all
    // that is left, name it, so the cash here and the payments card's total visibly agree.
    const prepaidFees = payments.payments > 0 ? statement.prepaid_gap : 0;
    const withRest = (statement.undelivered > 0 || prepaidFees !== 0) && cashForNow + prepaidFees + statement.undelivered === payments.amount;
    // What the same statements took off the price of these orders: said as one figure, so 6,810,500 above
    // and what actually reached the shop are never two unexplained amounts.
    const nowGap = split.reached_now - cashForNow;
    // Laid out as small lines with their amounts, not one paragraph of four figures.
    const nowLines =
        nowGap <= 0
            ? []
            : [
                  { key: "gap", label: t("fin.money.from.nowGap"), amount: -nowGap, sign: true },
                  { key: "paid", label: t("fin.money.from.nowPaid"), amount: cashForNow, sign: false },
                  ...(withRest
                      ? [
                            ...(prepaidFees !== 0
                                ? [
                                      {
                                          key: "prepaid",
                                          label: t("fin.money.from.nowPrepaidFees", { n: formatWhole(statement.prepaid_orders), count: statement.prepaid_orders }),
                                          amount: prepaidFees,
                                          sign: true,
                                      },
                                  ]
                                : []),
                            ...(statement.undelivered > 0
                                ? [
                                      {
                                          key: "undelivered",
                                          label: t("fin.money.from.nowUndelivered", { count: statement.undelivered_orders }),
                                          amount: statement.undelivered,
                                          sign: true,
                                      },
                                  ]
                                : []),
                            { key: "total", label: t("fin.money.from.nowTotal"), amount: payments.amount, sign: false },
                        ]
                      : []),
              ];
    // "Paid to you" by where its money came from, listed under it so the parts visibly add up.
    const fromElsewhere = split.reached_before > 0 || split.reached_other > 0 || split.reached_prepaid > 0;
    const sources = fromElsewhere
        ? [
              {
                  key: "now",
                  label: t("fin.money.from.now"),
                  // The statements' price of these orders is not the cash: the refunds, prepaid fees and price
                  // differences on the same statements come off it (the payments card lists each one).
                  note: null,
                  lines: nowLines,
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
    const nowSource = sources.find((source) => source.key === "now");

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
                            note={
                                t("fin.money.reached.note", { n: formatWhole(split.reached_orders), count: split.reached_orders }) +
                                // Said up front, so "paid to you" is not read as the cash the statements finally sent.
                                (nowGap > 0 && split.reached_orders > 0 ? t("fin.money.reached.taken", { where: t("fin.money.from.nowMatch") }) : "")
                            }
                            amount={split.reached}
                            textDir={dir}
                        >
                            {sources.length > 0 && (
                                <div className="mt-2 border-s-2 border-[var(--card-border)] ps-3" data-testid="money-reached-parts">
                                <dl className="space-y-1">
                                    {sources.map((source) => (
                                        <div key={source.key}>
                                        <div className="flex items-baseline justify-between gap-4 text-[13px]">
                                            <dt className="min-w-0 text-left text-muted" dir={dir}>
                                                {source.label}
                                                {source.note && <span className="block text-[12px]">{source.note}</span>}
                                                {/* The statement part is what the courier payments card takes apart: link the two,
                                                    or, when the same statements took something off, fold the lines that match them. */}
                                                {!(source.lines && source.lines.length > 0) && source.href && (
                                                    <NowLink href={source.href} label={t("fin.money.from.nowLink")} />
                                                )}
                                            </dt>
                                            <dd className="shrink-0">
                                                <Money value={source.amount} className="font-semibold text-foreground" />
                                            </dd>
                                        </div>
                                        </div>
                                    ))}
                                </dl>
                                {/* How the statements' part matches the delivery-company payments, folded under all the
                                    parts so the open card still reads as one sum; it starts again from that part. */}
                                {nowSource && nowSource.lines && nowSource.lines.length > 0 && (
                                    <div className="mt-1.5">
                                        <button
                                            type="button"
                                            onClick={() => setLinesOpen((open) => !open)}
                                            aria-expanded={linesOpen}
                                            className="flex w-fit items-center gap-1 text-left text-[12px] font-semibold text-foreground underline decoration-foreground/30 underline-offset-4 hover:decoration-current"
                                            dir={dir}
                                            data-testid="money-from-now-toggle"
                                        >
                                            <ChevronRight className={cn("size-3.5 transition-transform", linesOpen && "rotate-90")} aria-hidden="true" />
                                            {t("fin.money.from.nowMatch")}
                                        </button>
                                        {linesOpen && (
                                            <div className="mb-1 mt-1 ps-3">
                                                <ul className="space-y-0.5 text-[12px] text-muted" data-testid="money-from-now-lines">
                                                    {[
                                                        // The figure above, named as the start of this sum rather than read as a new one.
                                                        { key: "start", label: t("fin.money.from.nowStart", { label: nowSource.label }), amount: nowSource.amount, sign: false },
                                                        ...nowSource.lines,
                                                    ].map((line) => (
                                                        <li
                                                            key={line.key}
                                                            className={cn(
                                                                "flex items-baseline justify-between gap-4",
                                                                // The running sums under a hairline, so the steps read as one subtraction.
                                                                (line.key === "paid" || line.key === "total") && "border-t border-[var(--card-border)] pt-0.5 font-medium text-foreground",
                                                            )}
                                                            data-line={line.key}
                                                        >
                                                            <span className="min-w-0 text-left" dir={dir}>
                                                                {line.label}
                                                            </span>
                                                            <span className="shrink-0 whitespace-nowrap tabular-nums" dir="ltr">
                                                                {line.sign && line.amount > 0 && "+"}
                                                                <Money value={line.amount} />
                                                            </span>
                                                        </li>
                                                    ))}
                                                </ul>
                                                {nowSource.href && <NowLink href={nowSource.href} label={t("fin.money.from.nowLink")} />}
                                            </div>
                                        )}
                                    </div>
                                )}
                                </div>
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
                            <UnpaidOrders orders={summary.cash.unpaid_list} total={split.unpaid_orders} totalPrime={split.unpaid_prime} />
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
                        {summary.cash.stuck.count > 0 && (
                            <Link href={STUCK_ORDERS_HREF} className={`${CARD_LINK} mt-1.5`} data-testid="money-road-stuck-link">
                                {t("fin.money.road.stuck.open")}
                                <ArrowUpRight className="size-3.5" aria-hidden="true" />
                            </Link>
                        )}
                        {returning.count > 0 && (
                            <p className="mt-0.5 text-left text-[13px] leading-relaxed text-muted" dir={dir} data-testid="money-returning">
                                {t("fin.money.returning", { n: formatWhole(returning.count), count: returning.count })}
                            </p>
                        )}
                        {returning.count > 0 && (
                            <Link href={RETURNING_ORDERS_HREF} className={`${CARD_LINK} mt-1.5`} data-testid="money-returning-link">
                                {t("fin.money.returning.open")}
                                <ArrowUpRight className="size-3.5" aria-hidden="true" />
                            </Link>
                        )}
                    </PartRow>
                </ul>
            )}
        </SummaryCard>
    );
}
