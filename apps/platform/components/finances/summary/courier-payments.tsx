"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight, FileUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage, useTextDir } from "@/hooks/use-language";
import type { FinanceSummary } from "@/lib/finance/summary";
import { Money, formatWhole, useMoneyText } from "./money";
import { CARD_LINK, SummaryCard } from "./summary-card";

/** The card's anchor: the refunds warning at the top of the page scrolls here. */
export const COURIER_PAYMENTS_ID = "courier-payments";

type StatementOrder = FinanceSummary["cash"]["statement_orders"][number];

interface CourierPaymentsProps {
    summary: FinanceSummary;
    /** Opens the courier payment file import: how an unpaid order becomes paid. */
    onAddPayment: () => void;
}

interface Part {
    key: string;
    label: string;
    note?: string;
    amount: number;
    orders?: StatementOrder[];
    /** Show what the statement gave each order beside its code (when the amounts can differ). */
    amounts?: boolean;
    /** Nothing for the shop to do: its explanation folds behind the label, as a profit line's detail does. */
    quiet?: boolean;
}

/** The amount most of the given amounts share (the larger deduction on a tie). */
function usualAmount(amounts: readonly number[]): number {
    const counts = new Map<number, number>();
    for (const amount of amounts) counts.set(amount, (counts.get(amount) ?? 0) + 1);
    let best = 0;
    let bestCount = 0;
    for (const [amount, count] of counts) {
        if (count > bestCount || (count === bestCount && amount < best)) {
            best = amount;
            bestCount = count;
        }
    }
    return best;
}

/** The order codes behind one line, each opening its order. */
function OrderLinks({ orders, withAmounts = false }: { orders: StatementOrder[]; withAmounts?: boolean }) {
    const { t } = useLanguage();
    return (
        <span className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5" dir="ltr">
            {orders.map((order) => {
                // An order made before codes existed has none: its short id still opens it.
                const code = order.code ?? order.id.slice(0, 8);
                const link = (
                    <Link
                        key={order.id}
                        href={`/orders?order=${order.id}`}
                        className="font-semibold tabular-nums text-foreground underline decoration-foreground/30 underline-offset-4 hover:decoration-current"
                        aria-label={t("fin.money.unpaid.row.open", { code })}
                    >
                        {code}
                    </Link>
                );
                return withAmounts ? (
                    <span key={order.id} className="inline-flex items-baseline gap-1.5">
                        {link}
                        <Money value={order.amount} className="text-[12px] text-muted" />
                    </span>
                ) : (
                    link
                );
            })}
        </span>
    );
}

/**
 * The money the delivery companies actually paid out in the period, taken
 * apart against what they paid for this period's orders: the refunds they paid
 * customers for the shop (and which of those the shop has not marked yet), the
 * prepaid orders, other prices, orders paid for but not marked delivered, and
 * one remainder, so the lines add up to the payments to the dinar. Each line the
 * shop can act on names its orders.
 */
export function CourierPayments({ summary, onAddPayment }: CourierPaymentsProps) {
    const { t } = useLanguage();
    const dir = useTextDir();
    const money = useMoneyText();
    const { reached: payments, split, statement, statement_orders: orders } = summary.cash;
    const fromElsewhere = split.reached_before > 0 || split.reached_other > 0 || split.reached_prepaid > 0;
    const gap = payments.amount - split.reached_now;
    const refundsDone = statement.returns - statement.returns_open;
    const refundsDoneOrders = statement.returns_orders - statement.returns_open_orders;
    const other = gap - statement.returns - statement.prepaid_gap - statement.price_gap - statement.undelivered;
    const ordersOf = (kind: StatementOrder["kind"]) => orders.filter((order) => order.kind === kind);
    const counted = (key: string, n: number) => t(key, { n: formatWhole(n), count: n });
    const [opened, setOpened] = useState<ReadonlySet<string>>(() => new Set());
    const toggle = (key: string) =>
        setOpened((was) => {
            const next = new Set(was);
            if (!next.delete(key)) next.add(key);
            return next;
        });
    const prepaidElsewhere = Math.max(split.reached_prepaid_orders - statement.prepaid_orders, 0);
    // A prepaid order loses the whole delivery fee; one the statement credited with some money loses less, so say why.
    const prepaidNote = (prepaid: StatementOrder[]) => {
        const fee = usualAmount(prepaid.map((order) => order.amount));
        const odd = prepaid.length > 1 && fee < 0 ? prepaid.filter((order) => order.amount > fee && order.amount < 0) : [];
        return [
            // Some order on the statement is off the usual fee: say the usual fee first, then the exception.
            odd.length > 0 ? t("fin.money.cash.part.prepaidNoteOdd", { fee: money(-fee) }) : t("fin.money.cash.part.prepaidNote"),
            ...odd.map((order) =>
                t("fin.money.cash.part.prepaidOdd", {
                    code: order.code ?? order.id.slice(0, 8),
                    collected: money(order.amount - fee),
                    net: money(-order.amount),
                }),
            ),
            // "Paid to you" counts more prepaid orders than these statements list: say where the rest are,
            // so the two counts on the page are not read as missing fees.
            ...(prepaidElsewhere > 0
                ? [t("fin.money.cash.part.prepaidElsewhere", { n: formatWhole(prepaidElsewhere), count: prepaidElsewhere })]
                : []),
        ].join(" ");
    };
    const parts: Part[] =
        payments.payments > 0 && split.reached_now > 0 && gap !== 0
            ? [
                  { key: "now", label: t("fin.money.cash.part.now"), amount: split.reached_now },
                  {
                      key: "refunds",
                      label: counted("fin.money.cash.part.refunds", refundsDoneOrders),
                      // "Refunds" in the profit statement takes each refund's order price, and every refund paid
                      // in the period: when it differs from what the statements took off, name the one cause.
                      note:
                          summary.refunds.amount === -refundsDone
                              ? t("fin.money.cash.part.refundsNote")
                              : summary.refunds.count === refundsDoneOrders
                                ? t("fin.money.cash.part.refundsNotePrice", {
                                      amount: money(summary.refunds.amount),
                                      diff: money(Math.abs(summary.refunds.amount + refundsDone)),
                                  })
                                : t("fin.money.cash.part.refundsNoteMore", { amount: money(summary.refunds.amount) }),
                      amount: refundsDone,
                      quiet: true,
                  },
                  {
                      key: "refunds-open",
                      label: counted("fin.money.cash.part.refundsOpen", statement.returns_open_orders),
                      note: t("fin.money.cash.part.refundsOpenNote", { amount: money(-statement.returns_open) }),
                      amount: statement.returns_open,
                      orders: ordersOf("refund_open"),
                  },
                  {
                      key: "prepaid",
                      // A statement usually lists a prepaid order at nothing and keeps its fee.
                      label: counted(statement.prepaid_gap < 0 ? "fin.money.cash.part.prepaidFee" : "fin.money.cash.part.prepaid", statement.prepaid_orders),
                      note: statement.prepaid_gap < 0 ? prepaidNote(ordersOf("prepaid")) : undefined,
                      amount: statement.prepaid_gap,
                      orders: ordersOf("prepaid"),
                      // One odd row (a statement listing an order at 1 dinar) explains an odd total.
                      amounts: true,
                      quiet: true,
                  },
                  {
                      key: "price",
                      label: counted("fin.money.cash.part.price", statement.price_gap_orders),
                      note: t(statement.price_gap > 0 ? "fin.money.cash.part.priceMore" : "fin.money.cash.part.priceLess", {
                          amount: money(Math.abs(statement.price_gap)),
                      }),
                      amount: statement.price_gap,
                      orders: ordersOf("price"),
                  },
                  {
                      key: "undelivered",
                      label: counted("fin.money.cash.part.undelivered", statement.undelivered_orders),
                      note: t("fin.money.cash.part.undeliveredNote"),
                      amount: statement.undelivered,
                      orders: ordersOf("undelivered"),
                  },
                  { key: "other", label: t("fin.money.cash.part.other"), amount: other },
              ].filter((part) => part.amount !== 0)
            : [];
    // Two "paid" figures sit on the page: say how these payments relate to "Paid to you".
    const link =
        parts.length === 0
            ? null
            : split.reached_before > 0
              ? t("fin.money.cash.linkBefore", { now: money(split.reached_now), before: money(split.reached_before) })
              : t("fin.money.cash.link", { now: money(split.reached_now) });
    const why = payments.payments > 0 && split.reached_now === 0 && !fromElsewhere ? t("fin.money.payments.why") : null;

    return (
        <SummaryCard
            title={t("fin.money.cash.title")}
            sub={payments.payments > 0 ? counted("fin.money.cash.count", payments.payments) : t("fin.money.payments.none")}
            textDir={dir}
            testId="money-payments"
            id={COURIER_PAYMENTS_ID}
            action={payments.payments > 0 && <Money value={payments.amount} className="text-[22px] font-bold tracking-[-0.01em] text-foreground" />}
            footer={
                <button type="button" onClick={onAddPayment} className={CARD_LINK} data-testid="money-add-payment">
                    <FileUp className="size-3.5" aria-hidden="true" />
                    {t("fin.money.addPayment")}
                </button>
            }
        >
            {link && (
                <p className="text-left text-[13px] leading-relaxed text-muted" dir={dir} data-testid="money-payments-link">
                    {link}
                </p>
            )}
            {parts.length > 0 && (
                <dl className="mt-3 divide-y divide-[var(--card-border)]" data-testid="money-payments-parts">
                    {parts.map((part) => {
                        // A quiet line with something behind it folds; a line the shop must act on stays open.
                        const folds = part.quiet === true && (part.note !== undefined || (part.orders?.length ?? 0) > 0);
                        const open = !folds || opened.has(part.key);
                        return (
                            <div key={part.key} className="flex items-baseline justify-between gap-4 py-2 text-[13px] first:pt-0 last:pb-0" data-part={part.key}>
                                <dt className="min-w-0 text-left text-foreground" dir={dir}>
                                    {folds ? (
                                        <button
                                            type="button"
                                            onClick={() => toggle(part.key)}
                                            aria-expanded={open}
                                            className="inline-flex items-baseline gap-1.5 text-left decoration-foreground/30 underline-offset-4 hover:underline"
                                            data-fold={part.key}
                                        >
                                            {part.label}
                                            <ChevronRight
                                                className={cn("size-3 shrink-0 self-center text-muted transition-transform", open && "rotate-90")}
                                                aria-hidden="true"
                                            />
                                        </button>
                                    ) : (
                                        part.label
                                    )}
                                    {/* A note the shop must act on reads in full colour; one that only explains stays grey. */}
                                    {open && part.note && (
                                        <span className={cn("block text-[12px] leading-relaxed", part.quiet ? "text-muted" : "text-foreground")} data-note={part.key}>
                                            {part.note}
                                        </span>
                                    )}
                                    {open && part.orders && part.orders.length > 0 && <OrderLinks orders={part.orders} withAmounts={part.amounts} />}
                                </dt>
                                <dd className="shrink-0">
                                    {/* A difference that adds to the payments carries its sign, like the ones that take away. */}
                                    <span className="whitespace-nowrap font-semibold text-foreground" dir="ltr">
                                        {part.key !== "now" && part.amount > 0 && "+"}
                                        <Money value={part.amount} />
                                    </span>
                                </dd>
                            </div>
                        );
                    })}
                </dl>
            )}
            {why && (
                <p className="text-left text-[13px] leading-relaxed text-muted" dir={dir}>
                    {why}
                </p>
            )}
        </SummaryCard>
    );
}
