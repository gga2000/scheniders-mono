"use client";

import { motion } from "framer-motion";
import { useLanguage, useTextDir } from "@/hooks/use-language";
import type { AverageOrder } from "@/lib/finance/summary";
import { SLICE_COLORS } from "./colors";
import { Money, useMoneyText } from "./money";
import { SummaryCard } from "./summary-card";

interface OrderSlicesProps {
    average: AverageOrder;
}

/** One average delivered order as a single bar, cut into where its money goes. */
export function OrderSlices({ average }: OrderSlicesProps) {
    const { t } = useLanguage();
    const dir = useTextDir();
    const money = useMoneyText();

    return (
        <SummaryCard
            title={t("fin.order.title")}
            sub={t("fin.order.sub", { price: money(average.price) })}
            textDir={dir}
            testId="order-slices"
        >
            <div className="flex h-9 w-full gap-[3px] overflow-hidden rounded-xl" role="img" aria-label={t("fin.order.title")}>
                {average.slices.map((slice, i) => (
                    <motion.span
                        key={slice.id}
                        className="h-full first:rounded-s-xl last:rounded-e-xl"
                        style={{ background: SLICE_COLORS[slice.id] }}
                        title={`${t(`fin.slice.${slice.id}`)}: ${money(slice.amount)}`}
                        initial={{ flexGrow: 0 }}
                        animate={{ flexGrow: slice.share }}
                        transition={{ duration: 0.7, delay: i * 0.05, ease: [0.16, 1, 0.3, 1] }}
                        data-slice={slice.id}
                    />
                ))}
            </div>
            <ul className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2.5">
                {average.slices.map((slice) => (
                    <li key={slice.id} className="flex items-baseline justify-between gap-3 text-[13.5px]">
                        <span className="flex min-w-0 items-center gap-2">
                            <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: SLICE_COLORS[slice.id] }} aria-hidden="true" />
                            <span className={slice.id === "profit" ? "font-semibold text-foreground" : "text-muted"} dir={dir}>
                                {t(`fin.slice.${slice.id}`)}
                            </span>
                        </span>
                        <Money value={slice.amount} className={slice.id === "profit" ? "font-semibold text-foreground" : "font-medium text-foreground"} />
                    </li>
                ))}
            </ul>
            {average.profit < 0 && (
                <p className="mt-3 text-left text-[13.5px] text-rose-700 dark:text-rose-300" dir={dir}>
                    {t("fin.order.loss", { amount: money(Math.abs(average.profit)) })}
                </p>
            )}
        </SummaryCard>
    );
}
