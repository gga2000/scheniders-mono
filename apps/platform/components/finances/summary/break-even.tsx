"use client";

import { ArrowUpRight, Scale } from "lucide-react";
import { useLanguage, useTextDir } from "@/hooks/use-language";
import { breakEven, type FinanceSummary, type ProfitStatement } from "@/lib/finance/summary";
import { LOSS_COLOR, PROFIT_COLOR } from "./colors";
import { Emphasis } from "./emphasis";
import type { FinanceTab } from "./finance-tabs";
import { useMoneyText } from "./money";
import { SummaryTile } from "./summary-tile";

interface BreakEvenProps {
    summary: FinanceSummary;
    statement: ProfitStatement;
    onOpenTab: (tab: FinanceTab) => void;
}

/** 14 / 3.5: orders a day, with one decimal only under ten. */
function rate(value: number): string {
    return value >= 10 ? String(Math.round(value)) : value.toFixed(1).replace(/\.0$/, "");
}

/**
 * How many delivered orders a day pay the daily bill (ads, salaries, other
 * costs), against how many the shop delivers, drawn to scale: the orders that
 * pay the bill in ink, the ones that are profit in green.
 */
export function BreakEven({ summary, statement, onOpenTab }: BreakEvenProps) {
    const { t } = useLanguage();
    const dir = useTextDir();
    const money = useMoneyText();
    const even = breakEven(summary, statement);
    const say = "text-left text-[19px] font-medium leading-normal text-foreground";
    const quiet = "text-left text-[14px] leading-relaxed text-muted";

    let body = <p className={quiet} dir={dir}>{t("fin.even.none")}</p>;
    if (even && even.needed === null) {
        body = <p className="text-left text-[14px] leading-relaxed text-rose-700 dark:text-rose-300" dir={dir} data-testid="break-even-never">{t("fin.even.never")}</p>;
    } else if (even && even.needed === 0) {
        body = <p className={quiet} dir={dir} data-testid="break-even-free">{t("fin.even.free")}</p>;
    } else if (even && even.needed !== null) {
        const above = even.delivered >= even.needed;
        const figures = { need: String(Math.ceil(even.needed)), have: rate(even.delivered) };
        body = (
            <>
                <p className={say} dir={dir} data-testid="break-even-say">
                    <Emphasis text={t(above ? "fin.even.above" : "fin.even.below", figures)} />
                </p>
                <div className="flex h-2.5 gap-[3px]" aria-hidden="true">
                    {above ? (
                        <>
                            <span className="min-w-[6px] rounded-full bg-stone-900 dark:bg-stone-100" style={{ flexGrow: even.needed }} />
                            <span className="min-w-[6px] rounded-full" style={{ flexGrow: even.delivered - even.needed, background: PROFIT_COLOR }} />
                        </>
                    ) : (
                        <>
                            <span className="min-w-[6px] rounded-full" style={{ flexGrow: even.delivered, background: LOSS_COLOR }} />
                            <span
                                className="min-w-[6px] rounded-full border border-dashed border-[var(--card-border)]"
                                style={{ flexGrow: even.needed - even.delivered }}
                            />
                        </>
                    )}
                </div>
                <p className="text-left text-[13px] leading-relaxed text-muted" dir={dir}>
                    {t("fin.even.how", { left: money(even.leftPerOrder), bill: money(even.dailyBill) })}
                </p>
            </>
        );
    }

    return (
        <SummaryTile
            icon={Scale}
            color={PROFIT_COLOR}
            title={t("fin.even.title")}
            textDir={dir}
            testId="break-even"
            footer={
                <button
                    type="button"
                    onClick={() => onOpenTab("expenses")}
                    className="inline-flex items-center gap-1 text-[13px] font-semibold text-foreground underline decoration-[var(--card-border)] underline-offset-4 hover:decoration-current"
                >
                    {t("fin.even.open")}
                    <ArrowUpRight className="size-3.5" aria-hidden="true" />
                </button>
            }
        >
            {body}
        </SummaryTile>
    );
}
