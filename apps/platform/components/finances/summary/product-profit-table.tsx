"use client";

import { useState } from "react";
import { TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage, useTextDir } from "@/hooks/use-language";
import type { ProductProfitRow } from "@/lib/finance/summary";
import { LOSS_COLOR, PROFIT_COLOR } from "./colors";
import { Money, formatWhole } from "./money";
import { SummaryCard } from "./summary-card";

interface ProductProfitTableProps {
    rows: ProductProfitRow[];
}

/** Rows shown before "Show all". */
const FOLD = 8;
/** The database sends at most this many products. */
const SERVER_LIMIT = 50;

/** What each product sold for, what the goods cost, and what is left, best seller first. */
export function ProductProfitTable({ rows }: ProductProfitTableProps) {
    const { t } = useLanguage();
    const dir = useTextDir();
    const [all, setAll] = useState(false);
    const shown = all ? rows : rows.slice(0, FOLD);
    const th = "whitespace-nowrap pb-2.5 text-[12px] font-medium text-muted";

    return (
        <SummaryCard title={t("fin.products.title")} sub={t("fin.products.sub")} textDir={dir} testId="product-profit">
            {rows.length === 0 ? (
                <p className="py-2 text-left text-[14px] text-muted" dir={dir}>{t("fin.products.empty")}</p>
            ) : (
                <>
                    {/* Fixed columns: the numbers keep their width and the product name takes what is left, truncated. */}
                    <table className="w-full table-fixed border-collapse">
                        <colgroup>
                            <col />
                            <col className="w-[76px]" />
                            <col className="w-[136px]" />
                            <col className="w-[136px]" />
                            <col className="w-[136px]" />
                            <col className="w-[156px]" />
                        </colgroup>
                        <thead>
                            <tr className="border-b border-[var(--card-border)]">
                                <th className={cn(th, "text-left")}>{t("fin.products.col.product")}</th>
                                <th className={cn(th, "ps-5 text-right")}>{t("fin.products.col.units")}</th>
                                <th className={cn(th, "ps-5 text-right")}>{t("fin.products.col.sales")}</th>
                                <th className={cn(th, "ps-5 text-right")}>{t("fin.products.col.cost")}</th>
                                <th className={cn(th, "ps-5 text-right")}>{t("fin.products.col.profit")}</th>
                                <th className={cn(th, "ps-6 text-left")}>{t("fin.products.col.share")}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {shown.map((row) => {
                                const losing = row.profit < 0;
                                return (
                                    <tr key={row.key} className="border-b border-[var(--card-border)] last:border-b-0" data-product={row.key}>
                                        <td className="py-3">
                                            <div className="truncate text-left text-[14px] font-medium text-foreground" dir="auto">
                                                {row.name || t("fin.products.unnamed")}
                                            </div>
                                            {row.missingUnits > 0 && (
                                                <div className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2 py-0.5 text-[11.5px] font-medium text-amber-800 dark:text-amber-200">
                                                    <TriangleAlert className="size-3" aria-hidden="true" />
                                                    <span dir={dir}>{t("fin.products.missing", { n: formatWhole(row.missingUnits) })}</span>
                                                </div>
                                            )}
                                        </td>
                                        <td className="py-3 ps-5 text-right text-[14px] tabular-nums text-foreground">{formatWhole(row.units)}</td>
                                        <td className="py-3 ps-5 text-right"><Money value={row.sales} className="text-[14px] text-foreground" /></td>
                                        <td className="py-3 ps-5 text-right"><Money value={row.cost} className="text-[14px] text-muted" /></td>
                                        <td className="py-3 ps-5 text-right">
                                            <Money
                                                value={row.profit}
                                                className={cn("text-[14px] font-semibold", losing ? "text-rose-600 dark:text-rose-400" : "text-foreground")}
                                            />
                                        </td>
                                        <td className="py-3 ps-6">
                                            {row.margin !== null && (
                                                <div className="flex items-center gap-2.5">
                                                    <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-[var(--background-soft)]">
                                                        <span
                                                            className="block h-full rounded-full"
                                                            style={{
                                                                width: `${Math.min(Math.abs(row.margin), 1) * 100}%`,
                                                                background: losing ? LOSS_COLOR : PROFIT_COLOR,
                                                            }}
                                                        />
                                                    </span>
                                                    <span className="w-10 shrink-0 text-right text-[12.5px] tabular-nums text-muted" dir="ltr">
                                                        {losing ? "−" : ""}{Math.round(Math.abs(row.margin) * 100)}%
                                                    </span>
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
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
                </>
            )}
        </SummaryCard>
    );
}
