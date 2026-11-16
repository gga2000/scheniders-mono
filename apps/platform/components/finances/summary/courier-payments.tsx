"use client";

import Link from "next/link";
import { FileUp } from "lucide-react";
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
}

/** The order codes behind one line, each opening its order. */
function OrderLinks({ orders }: { orders: StatementOrder[] }) {
    const { t } = useLanguage();
    return (
        <span className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5" dir="ltr">
            {orders.map((order) => {
                // An order made before codes existed has none: its short id still opens it.
                const code = order.code ?? order.id.slice(0, 8);
                return (
                    <Link
                        key={order.id}
                        href={`/orders?order=${order.id}`}
                        className="font-semibold tabular-nums text-foreground underline decoration-foreground/30 underline-offset-4 hover:decoration-current"
                        aria-label={t("fin.money.unpaid.row.open", { code })}
                    >
                        {code}
                    </Link>
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
    const other = gap - statement.returns - statement.prepaid_gap - statement.price_gap - statement.undelivered;
    const ordersOf = (kind: StatementOrder["kind"]) => orders.filter((order) => order.kind === kind);
    const counted = (key: string, n: number) => t(key, { n: formatWhole(n), count: n });
    const parts: Part[] =
        payments.payments > 0 && split.reached_now > 0 && gap !== 0
            ? [
                  { key: "now", label: t("fin.money.cash.part.now"), amount: split.reached_now },
                  {
                      key: "refunds",
                      label: counted("fin.money.cash.part.refunds", statement.returns_orders - statement.returns_open_orders),
                      // "Refunds" in the profit statement takes each refund's order price, and every refund paid
                      // in the period: say why it differs from what the statements took off, when it does.
                      note:
                          summary.refunds.amount === -refundsDone
                              ? t("fin.money.cash.part.refundsNote")
                              : t("fin.money.cash.part.refundsNoteDiff", { amount: money(summary.refunds.amount) }),
                      amount: refundsDone,
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
                      label: counted("fin.money.cash.part.prepaid", statement.prepaid_orders),
                      // A statement usually lists a prepaid order at nothing and keeps its fee.
                      note: statement.prepaid_gap < 0 ? t("fin.money.cash.part.prepaidNote") : undefined,
                      amount: statement.prepaid_gap,
                  },
                  { key: "price", label: counted("fin.money.cash.part.price", statement.price_gap_orders), amount: statement.price_gap, orders: ordersOf("price") },
                  {
                      key: "undelivered",
                      label: counted("fin.money.cash.part.undelivered", statement.undelivered_orders),
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
                    {parts.map((part) => (
                        <div key={part.key} className="flex items-baseline justify-between gap-4 py-2 text-[13px] first:pt-0 last:pb-0" data-part={part.key}>
                            <dt className="min-w-0 text-left text-foreground" dir={dir}>
                                {part.label}
                                {part.note && <span className="block text-[12px] leading-relaxed text-muted">{part.note}</span>}
                                {part.orders && part.orders.length > 0 && <OrderLinks orders={part.orders} />}
                            </dt>
                            <dd className="shrink-0">
                                <Money value={part.amount} className="font-semibold text-foreground" />
                            </dd>
                        </div>
                    ))}
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
