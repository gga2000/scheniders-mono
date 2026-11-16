"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Package, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { ProductThumb } from "@/components/products/product-thumb";
import { useLanguage, useTextDir } from "@/hooks/use-language";
import type { ProductProfitRow } from "@/lib/finance/summary";
import { PROFIT_COLOR } from "./colors";
import { Money, formatWhole, useMoneyText } from "./money";
import { SummaryCard } from "./summary-card";

interface ProductRankingProps {
    rows: ProductProfitRow[];
}

/** Rows shown before "Show all". */
const FOLD = 8;
/** The database sends at most this many products. */
const SERVER_LIMIT = 50;
const COLUMNS = "grid grid-cols-[52px_minmax(0,1.15fr)_minmax(160px,1fr)_176px_60px] items-center gap-x-3.5";

/**
 * The products of the period, the one that earned most first: picture, full
 * name, pieces and profit on one piece, then the product's part of all the
 * profit as a bar, its profit, and what share of its sales that profit is.
 * The order is the rank, so no rank number is printed; the margin is a plain
 * number, because a pill that is green on every row says nothing.
 */
export function ProductRanking({ rows }: ProductRankingProps) {
    const { t } = useLanguage();
    const dir = useTextDir();
    const money = useMoneyText();
    const reduceMotion = useReducedMotion();
    const [all, setAll] = useState(false);
    const shown = all ? rows : rows.slice(0, FOLD);
    const head = "whitespace-nowrap text-[12px] font-medium text-muted";

    return (
        <SummaryCard title={t("fin.products.title")} sub={t("fin.products.sub")} textDir={dir} testId="product-ranking">
            {rows.length === 0 ? (
                <p className="py-2 text-left text-[14px] text-muted" dir={dir}>{t("fin.products.empty")}</p>
            ) : (
                <>
                    <div className={cn(COLUMNS, "border-b border-[var(--card-border)] pb-2")} aria-hidden="true">
                        <span />
                        <span className={cn(head, "text-left")}>{t("fin.products.col.product")}</span>
                        <span className={cn(head, "text-left")}>{t("fin.products.col.part")}</span>
                        <span className={cn(head, "text-right")}>{t("fin.products.col.profit")}</span>
                        <span className={cn(head, "text-right")}>{t("fin.products.col.share")}</span>
                    </div>
                    <ol>
                        {shown.map((row, i) => {
                            const losing = row.profit < 0;
                            const name = row.name || t("fin.products.unnamed");
                            return (
                                <li
                                    key={row.key}
                                    className={cn(COLUMNS, "border-b border-[var(--card-border)] py-3 last:border-b-0")}
                                    data-product={row.key}
                                >
                                    <span className="relative flex size-[52px] items-center justify-center overflow-hidden rounded-[14px] bg-[var(--background-soft)] text-muted">
                                        {row.imageUrl ? <ProductThumb src={row.imageUrl} alt="" sizes="52px" /> : <Package className="size-6" aria-hidden="true" />}
                                    </span>
                                    <div className="min-w-0">
                                        <div className="truncate text-left text-[15px] font-semibold text-foreground" dir="auto" title={name}>{name}</div>
                                        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-muted">
                                            <span dir={dir}>
                                                {row.profitPerPiece === null
                                                    ? t("fin.products.pieces", { n: formatWhole(row.units), count: row.units })
                                                    : t("fin.products.piecesEach", { n: formatWhole(row.units), count: row.units, each: money(row.profitPerPiece) })}
                                            </span>
                                            {row.missingUnits > 0 && (
                                                <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2 py-0.5 text-[11.5px] font-medium text-amber-800 dark:text-amber-200">
                                                    <TriangleAlert className="size-3" aria-hidden="true" />
                                                    <span dir={dir}>{t("fin.products.missing", { n: formatWhole(row.missingUnits), count: row.missingUnits })}</span>
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <span className="flex items-center gap-3">
                                        <span className="h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-[var(--background-soft)]" aria-hidden="true">
                                            <motion.span
                                                className="block h-full rounded-full"
                                                style={{ background: PROFIT_COLOR }}
                                                initial={reduceMotion ? false : { width: 0 }}
                                                animate={{ width: `${row.profitShare * 100}%` }}
                                                transition={{ duration: 0.7, delay: Math.min(i, 6) * 0.04, ease: [0.16, 1, 0.3, 1] }}
                                            />
                                        </span>
                                        <span className="w-9 shrink-0 text-right text-[12.5px] font-semibold tabular-nums text-muted" dir="ltr" data-share={row.key}>
                                            {Math.round(row.profitShare * 100)}%
                                        </span>
                                    </span>
                                    <div className="text-right">
                                        <Money
                                            value={row.profit}
                                            className={cn("text-[17px] font-bold", losing ? "text-rose-600 dark:text-rose-400" : "text-foreground")}
                                        />
                                        <div className="text-[12px] text-muted" dir={dir}>{t("fin.products.ofSales", { amount: money(row.sales) })}</div>
                                    </div>
                                    <span className="justify-self-end text-[13.5px] font-semibold tabular-nums text-muted" dir="ltr" data-margin={row.key}>
                                        {row.margin !== null && `${losing ? "−" : ""}${Math.round(Math.abs(row.margin) * 100)}%`}
                                    </span>
                                </li>
                            );
                        })}
                    </ol>
                    {(rows.length > FOLD || rows.length >= SERVER_LIMIT) && (
                        <div className="mt-3 flex items-center justify-between gap-4">
                            {rows.length > FOLD ? (
                                <button
                                    type="button"
                                    onClick={() => setAll((v) => !v)}
                                    className="text-[13px] font-medium text-foreground underline decoration-[var(--card-border)] underline-offset-4 hover:decoration-current"
                                >
                                    {all ? t("fin.products.showLess") : t("fin.products.showAll", { n: formatWhole(rows.length) })}
                                </button>
                            ) : <span />}
                            {rows.length >= SERVER_LIMIT && <span className="text-[12.5px] text-muted" dir={dir}>{t("fin.products.top")}</span>}
                        </div>
                    )}
                </>
            )}
        </SummaryCard>
    );
}
