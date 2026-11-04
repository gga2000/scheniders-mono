"use client";

import Link from "next/link";
import { useLanguage, useTextDir } from "@/hooks/use-language";
import type { PrimeBoard } from "@/lib/prime/board";
import { PrimeMark } from "./prime-mark";

/**
 * «مع برايم الآن»: parcels still on their way, delivered today, and coming
 * back. Each number opens its parcels on the Prime page.
 */
export function PrimeNowCard({ board }: { board: PrimeBoard }) {
    const { t } = useLanguage();
    const dir = useTextDir();
    const figures = [
        { href: "/prime", count: board.out, label: t("prime.home.out"), tone: "text-[#1F3F75] dark:text-sky-200", key: "out" },
        { href: "/prime?list=delivered_today", count: board.lists.delivered_today.length, label: t("prime.home.deliveredToday"), tone: "text-[#165C39] dark:text-emerald-300", key: "delivered" },
        { href: "/prime?list=returning", count: board.lists.returning.length, label: t("prime.home.returning"), tone: "text-[#8F1D13] dark:text-rose-300", key: "returning" },
    ];

    return (
        <section data-prime-now className="flex h-full flex-col gap-3 rounded-[22px] border border-[var(--card-border)] bg-[var(--card-bg)] p-5">
            <header className="flex items-center justify-between gap-3">
                <span dir={dir} className="text-left text-xs text-muted">
                    {t("prime.home.nowTitle")}
                </span>
                <PrimeMark label={t("prime.home.badge")} />
            </header>
            <div className="mt-auto grid grid-cols-3 gap-2">
                {figures.map((f) => (
                    <Link key={f.key} href={f.href} data-prime-now-figure={f.key} className="rounded-2xl px-2 py-1.5 transition-colors hover:bg-[var(--background)]">
                        <span className={`block text-[34px] font-bold leading-tight tabular-nums ${f.tone}`}>{f.count}</span>
                        <span dir={dir} className="block text-left text-xs text-muted">
                            {f.label}
                        </span>
                    </Link>
                ))}
            </div>
        </section>
    );
}
