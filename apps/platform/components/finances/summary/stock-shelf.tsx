"use client";

import Link from "next/link";
import { ArrowUpRight, Boxes } from "lucide-react";
import { useLanguage, useTextDir } from "@/hooks/use-language";
import { stockPurchases, type FinanceSummary } from "@/lib/finance/summary";
import { COST_COLORS } from "./colors";
import { Emphasis } from "./emphasis";
import { formatWhole, useMoneyText } from "./money";
import { SummaryTile } from "./summary-tile";

interface StockShelfProps {
    summary: FinanceSummary;
}

/**
 * Money sitting in goods: the pieces on the shelf now and what they cost.
 * Stock bought in the period is named here too, because it is cash that left
 * without being a cost of the period (the goods count when they sell).
 */
export function StockShelf({ summary }: StockShelfProps) {
    const { t } = useLanguage();
    const dir = useTextDir();
    const money = useMoneyText();
    const { pieces, cost_value: value, missing_cost_products: missing } = summary.stock;
    const bought = stockPurchases(summary);

    return (
        <SummaryTile
            icon={Boxes}
            color={COST_COLORS.product_cost}
            title={t("fin.stock.title")}
            textDir={dir}
            testId="stock-shelf"
            footer={
                <Link
                    href="/products"
                    className="inline-flex items-center gap-1 text-[13px] font-semibold text-foreground underline decoration-[var(--card-border)] underline-offset-4 hover:decoration-current"
                >
                    {t("fin.stock.open")}
                    <ArrowUpRight className="size-3.5" aria-hidden="true" />
                </Link>
            }
        >
            {pieces === 0 ? (
                <p className="text-left text-[14px] leading-relaxed text-muted" dir={dir}>{t("fin.stock.none")}</p>
            ) : (
                <p className="text-left text-[19px] font-medium leading-normal text-foreground" dir={dir} data-testid="stock-say">
                    <Emphasis text={t("fin.stock.say", { n: formatWhole(pieces), value: formatWhole(value) })} />
                </p>
            )}
            {missing > 0 && (
                <p className="text-left text-[13px] leading-relaxed text-amber-700 dark:text-amber-300" dir={dir} data-testid="stock-missing">
                    {t("fin.stock.missing", { n: formatWhole(missing) })}
                </p>
            )}
            {bought > 0 && (
                <p className="text-left text-[13px] leading-relaxed text-muted" dir={dir} data-testid="stock-bought">
                    {t("fin.stock.bought", { amount: money(bought) })}
                </p>
            )}
        </SummaryTile>
    );
}
