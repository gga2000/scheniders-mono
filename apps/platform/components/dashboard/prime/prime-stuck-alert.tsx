"use client";

import Link from "next/link";
import { Clock } from "lucide-react";
import { FinancialValue } from "@/components/ui/financial-value";
import { useLanguage, useTextDir } from "@/hooks/use-language";
import type { PrimeStuck } from "@/lib/prime/stuck";

/**
 * Parcels with no move at Prime for three days or more: how many, where most
 * of them are, the cash they hold, and a way to the list on the Prime page
 * (where each one can be asked about).
 */
export function PrimeStuckAlert({ stuck }: { stuck: PrimeStuck }) {
    const { t } = useLanguage();
    const dir = useTextDir();

    return (
        <section data-prime-stuck className="flex items-center gap-4 rounded-[22px] border border-[#F1DDBF] bg-[#FFFAF2] px-5 py-4 dark:border-amber-400/25 dark:bg-amber-400/[0.06]">
            <span aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#FDEBD3] text-[#8A4B00] dark:bg-amber-400/15 dark:text-amber-200">
                <Clock className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
                <p dir={dir} className="text-left text-[15px] font-bold text-[#5C3200] dark:text-amber-100">
                    {t("prime.home.stuckTitle", { count: stuck.count })}
                </p>
                <p dir={dir} className="mt-0.5 text-left text-sm text-[#8A4B00] dark:text-amber-200">
                    {stuck.city && <>{t("prime.home.stuckCity", { count: stuck.city.count, city: stuck.city.name })} · </>}
                    {t("prime.home.stuckCash")} <FinancialValue amount={stuck.cash} hideToggle className="font-semibold" />
                </p>
            </div>
            <Link
                href="/prime?list=needs"
                dir={dir}
                className="shrink-0 rounded-full border border-[#E7C9A0] bg-white px-4 py-2 text-sm font-semibold text-[#5C3200] transition-colors hover:bg-[#FFF6E8] dark:border-amber-400/30 dark:bg-transparent dark:text-amber-100"
            >
                {t("prime.home.stuckOpen")}
            </Link>
        </section>
    );
}
