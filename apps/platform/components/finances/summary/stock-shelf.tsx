"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { useLanguage, useTextDir } from "@/hooks/use-language";
import { stockPurchases, type FinanceSummary } from "@/lib/finance/summary";
import { Money, formatWhole, useMoneyText } from "./money";
import { CARD_FIGURE, CARD_LINK, SummaryCard } from "./summary-card";

interface StockShelfProps {
    summary: FinanceSummary;
}

/**
 * Money sitting in goods: what the pieces on the shelf cost, then how many
 * pieces that figure covers. Stock bought in the period is named here too,
 * because it is cash that left without being a cost of the period (the goods
 * count when they sell).
 */
export function StockShelf({ summary }: StockShelfProps) {
    const { t } = useLanguage();
    const dir = useTextDir();
    const money = useMoneyText();
    const { pieces, costed_pieces: costed, cost_value: value, missing_cost_products: missing } = summary.stock;
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
                {bought > 0 && (
                    <p className={`${note} text-muted`} dir={dir} data-testid="stock-bought">
                        {t("fin.stock.bought", { amount: money(bought) })}
                    </p>
                )}
            </div>
        </SummaryCard>
    );
}
