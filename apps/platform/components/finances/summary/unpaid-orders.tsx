"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useLanguage, useTextDir } from "@/hooks/use-language";
import type { FinanceSummary } from "@/lib/finance/summary";
import { Money, formatWhole } from "./money";
import { CARD_LINK } from "./summary-card";

type UnpaidOrder = FinanceSummary["cash"]["unpaid_list"][number];

interface UnpaidOrdersProps {
    orders: readonly UnpaidOrder[];
    /** Every unpaid delivered order of the period, the listed ones included. */
    total: number;
}

/** The server lists at most this many: past it, the rest are only counted. */
export const UNPAID_LIST_CAP = 20;
/** Up to this many rows show at once; a longer list shows the oldest few and a button for the rest. */
const SHOW_ALL_UP_TO = 7;
const SHOWN_FOLDED = 5;
/** Money owed this many days after delivery is late: the row says so in amber. */
const LATE_AFTER_DAYS = 14;

/** Whole days from a YYYY-MM-DD day to today in Baghdad. */
function daysSince(day: string, now: Date): number {
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Baghdad" }).format(now);
    return Math.max(Math.round((Date.parse(today) - Date.parse(day)) / 86_400_000), 0);
}

/**
 * The delivered orders that still owe the shop money, oldest first, so the
 * merchant can see which ones to chase and open each one. Orders the list
 * leaves out owe nothing after the delivery fee (a free replacement), unless
 * the list is full, in which case the rest are simply not shown.
 */
export function UnpaidOrders({ orders, total }: UnpaidOrdersProps) {
    const { t, language } = useLanguage();
    const dir = useTextDir();
    const dayFormat = useMemo(
        () => new Intl.DateTimeFormat(language === "ar" ? "ar-IQ-u-nu-latn" : "en-US", { day: "numeric", month: "short", timeZone: "UTC" }),
        [language],
    );
    const [open, setOpen] = useState(false);
    const rest = Math.max(total - orders.length, 0);
    const folds = orders.length > SHOW_ALL_UP_TO;
    const visible = folds && !open ? orders.slice(0, SHOWN_FOLDED) : orders;
    const now = new Date();
    if (orders.length === 0 && rest === 0) return null;
    const anyLate = orders.some((order) => daysSince(order.day, now) > LATE_AFTER_DAYS);

    const restNote =
        rest === 0
            ? null
            : orders.length >= UNPAID_LIST_CAP
              ? t("fin.money.unpaid.more", { shown: formatWhole(orders.length), n: formatWhole(rest), count: orders.length })
              : t("fin.money.unpaid.rest", { n: formatWhole(rest), count: rest });

    return (
        <div className="mt-2.5" data-testid="money-unpaid-list">
            {orders.length > 0 && (
                <ul aria-label={t("fin.money.unpaid.list")} className="divide-y divide-[var(--card-border)] border-s-2 border-[var(--card-border)] ps-3">
                    {visible.map((order) => {
                        // An order made before codes existed has none: its short id still opens it.
                        const code = order.code ?? order.id.slice(0, 8);
                        const days = daysSince(order.day, now);
                        return (
                            <li key={order.id} className="flex items-center justify-between gap-4 py-2 first:pt-0 last:pb-0">
                                <div className="min-w-0">
                                    <div className="flex min-w-0 items-baseline gap-2">
                                        <Link
                                            href={`/orders?order=${order.id}`}
                                            className="shrink-0 text-[13px] font-semibold tabular-nums text-foreground underline decoration-foreground/30 underline-offset-4 hover:decoration-current"
                                            aria-label={t("fin.money.unpaid.row.open", { code })}
                                            dir="ltr"
                                        >
                                            {code}
                                        </Link>
                                        {order.customer && (
                                            <span className="truncate text-[13px] text-foreground" dir="auto">
                                                {order.customer}
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-left text-[12px] text-muted" dir={dir}>
                                        <span
                                            className={days > LATE_AFTER_DAYS ? "font-semibold text-amber-700 dark:text-amber-400" : undefined}
                                            title={dayFormat.format(new Date(order.day))}
                                            data-late={days > LATE_AFTER_DAYS || undefined}
                                        >
                                            {t("fin.money.unpaid.row.age", { n: formatWhole(days), count: days })}
                                        </span>
                                        {" · "}
                                        {t(order.prime ? "fin.money.unpaid.row.prime" : "fin.money.unpaid.row.courier")}
                                    </p>
                                </div>
                                <Money value={order.amount} className="shrink-0 text-[13px] font-semibold text-foreground" />
                            </li>
                        );
                    })}
                </ul>
            )}
            {folds && (
                <button type="button" className={`${CARD_LINK} mt-2`} aria-expanded={open} onClick={() => setOpen((was) => !was)}>
                    {open ? t("fin.money.unpaid.showLess") : t("fin.money.unpaid.showAll", { n: formatWhole(orders.length) })}
                </button>
            )}
            {anyLate && (
                <p className="mt-2 text-left text-[12px] leading-relaxed text-amber-700 dark:text-amber-400" dir={dir} data-testid="money-unpaid-late">
                    {t("fin.money.unpaid.lateNote")}
                </p>
            )}
            {restNote && (
                <p className="mt-2 text-left text-[12px] leading-relaxed text-muted" dir={dir} data-testid="money-unpaid-rest">
                    {restNote}
                </p>
            )}
        </div>
    );
}
