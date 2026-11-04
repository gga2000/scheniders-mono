"use client";

import { useAuth } from "@/components/auth/auth-provider";
import { FinancialValue } from "@/components/ui/financial-value";
import { useLanguage, useTextDir } from "@/hooks/use-language";
import { usePrimeStatements } from "@/hooks/use-prime-statements";
import { baghdadDayKey, toBaghdadDayKey } from "@/lib/order-window";
import type { PrimeHomeSummary } from "@/lib/prime/home";
import { isAdminRole } from "@/lib/permissions";
import { PrimeMark } from "./prime-mark";

/**
 * «لدى برايم لك»: the cash of parcels Prime delivered and has not paid yet
 * (net of its fees), Prime's last payment (administrators: Prime's
 * statements are theirs), this month's fees, and where this month's cash is.
 */
export function PrimeMoneyCard({ summary }: { summary: PrimeHomeSummary }) {
    const { t } = useLanguage();
    const dir = useTextDir();
    const { role } = useAuth();
    const admin = isAdminRole(role);
    const { owed, month } = summary;
    const total = month.paid + month.atPrime + month.onRoad;
    const share = (n: number) => (total > 0 ? `${(Math.max(0, n) / total) * 100}%` : "0%");

    return (
        <section data-prime-money className="flex h-full flex-col gap-4 rounded-[22px] bg-[var(--ink)] p-6 text-white">
            <header className="flex items-center justify-between gap-3">
                <span dir={dir} className="text-left text-sm text-white/70">
                    {t("prime.home.owedTitle")}
                </span>
                <PrimeMark label={t("prime.home.badge")} />
            </header>
            <div>
                <FinancialValue amount={owed.cash} className="text-[40px] font-bold leading-none tracking-tight" iconClassName="text-white/60" iconSize={16} />
                <p dir={dir} className="mt-2 text-left text-sm text-white/60">
                    {t("prime.home.owedParcels", { count: owed.parcels })}
                </p>
            </div>
            <dl className="mt-auto space-y-2 border-t border-white/10 pt-4 text-sm">
                {admin && <LastPayment />}
                <div className="flex items-center justify-between gap-3">
                    <dt dir={dir} className="text-left text-white/60">
                        {t("prime.home.monthFees")}
                    </dt>
                    <dd>
                        <FinancialValue amount={month.fees} hideToggle className="font-semibold" />
                    </dd>
                </div>
            </dl>
            <div>
                <div className="flex h-2 overflow-hidden rounded-full bg-white/10" aria-hidden="true">
                    <span className="h-full bg-[#9ED5B4]" style={{ width: share(month.paid) }} />
                    <span className="h-full bg-[#7FA3E0]" style={{ width: share(month.atPrime) }} />
                    <span className="h-full bg-[#F2B48A]" style={{ width: share(month.onRoad) }} />
                </div>
                <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/60">
                    <Legend tone="bg-[#9ED5B4]" label={t("prime.home.paid")} amount={month.paid} />
                    <Legend tone="bg-[#7FA3E0]" label={t("prime.home.atPrime")} amount={month.atPrime} />
                    <Legend tone="bg-[#F2B48A]" label={t("prime.home.onRoad")} amount={month.onRoad} />
                </ul>
            </div>
        </section>
    );
}

function Legend({ tone, label, amount }: { tone: string; label: string; amount: number }) {
    const dir = useTextDir();
    return (
        <li className="flex items-center gap-1.5">
            <span aria-hidden="true" className={`h-2 w-2 rounded-full ${tone}`} />
            <span dir={dir}>{label}</span>
            <FinancialValue amount={amount} hideToggle className="text-white/80" />
        </li>
    );
}

/** Prime's newest payment to the store, or "no payment yet". Hidden while Prime cannot be read. */
function LastPayment() {
    const { t, language } = useLanguage();
    const dir = useTextDir();
    const statements = usePrimeStatements(true);
    const answer = statements.data?.connected ? statements.data : null;
    if (!answer) return null;
    const latest = answer.statements[0] ?? null;

    // "Today" and "yesterday" as of when Prime was read.
    const readAt = statements.dataUpdatedAt;
    const when = (at: string | null) => {
        const day = toBaghdadDayKey(at);
        if (!day) return null;
        if (day === baghdadDayKey(readAt)) return t("prime.home.today");
        if (day === baghdadDayKey(readAt - 86_400_000)) return t("prime.home.yesterday");
        return new Intl.DateTimeFormat(language === "ar" ? "ar-IQ-u-nu-latn" : "en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(Date.parse(`${day}T00:00:00Z`));
    };

    return (
        <div className="flex items-center justify-between gap-3">
            <dt dir={dir} className="text-left text-white/60">
                {t("prime.home.lastPayment")}
            </dt>
            <dd className="flex items-center gap-1.5">
                {latest ? (
                    <>
                        <FinancialValue amount={latest.amount} hideToggle className="font-semibold" />
                        {when(latest.at) && (
                            <span dir={dir} className="text-white/60">
                                · {when(latest.at)}
                            </span>
                        )}
                    </>
                ) : (
                    <span dir={dir} className="text-white/60">
                        {t("prime.home.noPayment")}
                    </span>
                )}
            </dd>
        </div>
    );
}
