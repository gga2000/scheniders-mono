"use client";

import { useLanguage, useTextDir } from "@/hooks/use-language";
import { usePrimeStatements } from "@/hooks/use-prime-statements";

const amount = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

/** «الكشف الجديد»: Prime's newest payment, how many of its parcels match our orders, and the difference. */
export function PrimeStatementCard({ onOpen }: { onOpen: (id: number) => void }) {
    const { t } = useLanguage();
    const dir = useTextDir();
    const statements = usePrimeStatements(true);
    const answer = statements.data;
    const entry = answer?.connected ? answer.statements[0] : undefined;
    const latest = answer?.connected ? answer.latest : null;

    return (
        <section className="flex flex-col gap-3.5 rounded-[22px] border border-[#1E1E1E] bg-[#1E1E1E] p-5 text-white">
            <div className="flex items-center justify-between gap-3">
                <h2 className="font-bold">{t("prime.page.newStatement")}</h2>
                {latest && (
                    <span
                        className={
                            latest.summary.different > 0 || latest.summary.unknown > 0
                                ? "inline-flex h-[26px] items-center rounded-full bg-[#3A2A10] px-2.5 text-xs font-bold text-[#F5C98A]"
                                : "inline-flex h-[26px] items-center rounded-full bg-[#143524] px-2.5 text-xs font-bold text-[#BFE3CC]"
                        }
                    >
                        {latest.summary.different > 0 || latest.summary.unknown > 0 ? t("prime.page.statementDiff") : t("prime.page.statementMatch")}
                    </span>
                )}
            </div>
            {statements.isPending ? (
                <div className="h-16 animate-pulse rounded-xl bg-white/10" aria-busy="true" />
            ) : statements.isError ? (
                <p className="text-sm text-[#B5B5B5]">{t("orders.prime.unreachable")}</p>
            ) : !entry || !latest ? (
                <p dir={dir} className="text-left text-sm text-[#B5B5B5]">
                    {t("prime.page.noStatements")}
                </p>
            ) : (
                <>
                    <div className="flex items-baseline justify-between gap-3">
                        <span dir={dir} className="text-[13px] text-[#B5B5B5]">
                            {t("prime.page.statementLine", { id: entry.id, parcels: latest.summary.parcels })}
                        </span>
                        <b className="text-[26px] tabular-nums">{amount.format(entry.amount)}</b>
                    </div>
                    <div dir={dir} className="flex gap-2 text-left text-[13px] text-[#D4D4D4]">
                        <span>{t("prime.page.matchedCount", { count: latest.summary.matched })}</span>
                        {latest.summary.diff !== 0 && (
                            <>
                                <span>·</span>
                                <span>{t("prime.page.diffAmount", { amount: amount.format(Math.abs(latest.summary.diff)) })}</span>
                            </>
                        )}
                    </div>
                    <button
                        type="button"
                        onClick={() => onOpen(entry.id)}
                        className="inline-flex h-[42px] items-center justify-center rounded-full bg-white px-4 text-[13px] font-semibold text-[#1E1E1E] transition-colors hover:bg-white/90"
                    >
                        {t("prime.page.openStatement")}
                    </button>
                </>
            )}
        </section>
    );
}
