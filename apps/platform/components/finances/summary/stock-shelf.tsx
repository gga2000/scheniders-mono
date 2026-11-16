"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { useLanguage, useTextDir } from "@/hooks/use-language";
import { stockPurchases, type FinanceSummary } from "@/lib/finance/summary";
import { productFilterHref } from "@/lib/product-filter-param";
import { Money, formatWhole, useMoneyText } from "./money";
import { CARD_FIGURE, CARD_LINK, SummaryCard } from "./summary-card";

interface StockShelfProps {
    summary: FinanceSummary;
}

/**
 * Money sitting in goods: what the pieces on the shelf cost, then how many
 * pieces that figure covers, then the three products holding most of it. Stock bought in the period is named here too,
 * because it is cash that left without being a cost of the period (the goods
 * count when they sell).
 */
export function StockShelf({ summary }: StockShelfProps) {
    const { t } = useLanguage();
    const dir = useTextDir();
    const money = useMoneyText();
    const { pieces, costed_pieces: costed, cost_value: value, missing_cost_products: missing, top } = summary.stock;
    const bought = stockPurchases(summary);
    const note = "text-left text-[13px] leading-relaxed";

    return (
        <SummaryCard
            title={t("fin.stock.title")}
            sub={t("fin.stock.sub")}
            textDir={dir}
            testId="stock-shelf"
            className="h-full"
            footer={
                <Link href="/products" className={CARD_LINK}>
                    {t("fin.stock.open")}
                    <ArrowUpRight className="size-3.5" aria-hidden="true" />
                </Link>
            }
        >
            {pieces === 0 ? (
                <p className="py-2 text-left text-[14px] text-muted" dir={dir}>{t("fin.stock.none")}</p>
            ) : (
                <div data-testid="stock-say">
                    <Money value={value} className={CARD_FIGURE} />
                    <p className="mt-2.5 text-left text-[13.5px] leading-relaxed text-muted" dir={dir}>
                        {costed < pieces
                            ? t("fin.stock.sayPart", { costed: formatWhole(costed), n: formatWhole(pieces), count: pieces })
                            : t("fin.stock.say", { n: formatWhole(pieces), count: pieces })}
                    </p>
                </div>
            )}
            <div className="mt-3 space-y-2 empty:hidden">
                {missing > 0 && (
                    <p className={`${note} text-amber-700 dark:text-amber-300`} dir={dir} data-testid="stock-missing">
                        {t("fin.stock.missing", { n: formatWhole(missing), count: missing })}
                    </p>
                )}
                {missing > 0 && (
                    <Link href={productFilterHref({ missingCost: true })} className={CARD_LINK} data-testid="stock-missing-fix">
                        {t("fin.stock.missing.fix")}
                        <ArrowUpRight className="size-3.5" aria-hidden="true" />
                    </Link>
                )}
                {bought > 0 && (
                    <p className={`${note} text-muted`} dir={dir} data-testid="stock-bought">
                        {t("fin.stock.bought", { amount: money(bought) })}
                    </p>
                )}
            </div>
            {top.length > 0 && (
                <div className="mt-4 border-t border-[var(--card-border)] pt-3.5" data-testid="stock-top">
                    <h3 className="text-left text-[12.5px] font-semibold text-muted" dir={dir}>{t("fin.stock.top")}</h3>
                    <ol className="mt-2 space-y-2">
                        {top.map((product) => (
                            <li key={product.key} className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3">
                                <div className="min-w-0">
                                    <div className="truncate text-left text-[13.5px] font-medium text-foreground" dir={dir} title={product.name}>{product.name}</div>
                                    <div className="text-left text-[12px] text-muted" dir={dir}>
                                        {t("fin.stock.pieces", { n: formatWhole(product.pieces), count: product.pieces })}
                                    </div>
                                </div>
                                <Money value={product.value} className="text-[14px] font-semibold text-foreground" />
                            </li>
                        ))}
                    </ol>
                </div>
            )}
        </SummaryCard>
    );
}
