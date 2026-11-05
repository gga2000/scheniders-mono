"use client";

import { useLanguage, useTextDir } from "@/hooks/use-language";
import { primeAgeTone, type PrimeAgeTone, type PrimeBoard, type PrimeBoardList } from "@/lib/prime/board";
import { cn } from "@/lib/utils";

const amount = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

const STAGE_TONE = {
    gray: "bg-[#F5F3EF] text-foreground dark:bg-white/5",
    blue: "bg-[#EEF2F9] text-[#1F3F75] dark:bg-sky-400/10 dark:text-sky-200",
    ink: "bg-[#315EA8] text-white",
    green: "bg-[#E3F2E9] text-[#165C39] dark:bg-emerald-400/10 dark:text-emerald-200",
} as const;

const SIDE_TONE = {
    amber: "border-[#F1DDBF] bg-[#FFFAF2] text-[#8A4B00] dark:border-amber-400/25 dark:bg-amber-400/[0.06] dark:text-amber-200",
    red: "border-[#F0C9C4] bg-[#FFF6F5] text-[#8F1D13] dark:border-rose-400/25 dark:bg-rose-500/[0.06] dark:text-rose-200",
    violet: "border-[#DED3FA] bg-[#F5F1FE] text-[#4B2FA8] dark:border-violet-400/25 dark:bg-violet-400/[0.06] dark:text-violet-200",
} as const;

const AGE_TONE: Record<PrimeAgeTone, string> = {
    ok: "bg-black/[0.06] dark:bg-white/10",
    amber: "bg-[#FEF3E2] text-[#8A4B00] dark:bg-amber-400/20 dark:text-amber-200",
    red: "bg-[#FBEAE8] text-[#8F1D13] dark:bg-rose-500/20 dark:text-rose-200",
};

/**
 * «مسار طرودك الآن»: one thin line. Handed to Prime today → at the branch →
 * on the road and with the driver → delivered today, each with how long its
 * oldest parcel has waited (amber past 3 days, red past 6). Postponed, coming
 * back and needs-a-decision show only while they hold a parcel. Every number
 * opens its parcels in the list below.
 */
export function PrimePipeline({
    board,
    branchName,
    selected,
    onSelect,
    ages,
}: {
    board: PrimeBoard;
    branchName: string | null;
    selected: PrimeBoardList;
    onSelect: (list: PrimeBoardList) => void;
    /** Days the oldest parcel of a list has waited; absent for a list without one. */
    ages: Partial<Record<PrimeBoardList, number | null>>;
}) {
    const { t } = useLanguage();
    const dir = useTextDir();
    const { lists, cash } = board;

    const stage = (list: PrimeBoardList, tone: keyof typeof STAGE_TONE, label: string, foot: string) => {
        const age = ages[list] ?? null;
        return (
            <button
                type="button"
                onClick={() => onSelect(list)}
                aria-pressed={selected === list}
                data-prime-stage={list}
                className={cn(
                    "flex min-w-0 flex-col gap-0.5 rounded-2xl px-4 py-3 text-left transition-shadow hover:shadow-[0_0_0_2px_rgba(49,94,168,0.25)]",
                    STAGE_TONE[tone],
                    selected === list && "shadow-[0_0_0_2px_#315EA8]",
                )}
            >
                <span dir={dir} className={cn("text-left text-xs", tone === "ink" ? "text-[#D6E1F5]" : "opacity-80")}>
                    {label}
                </span>
                <span className="flex items-baseline justify-between gap-2">
                    <span className="text-[28px] font-bold leading-tight tabular-nums">{lists[list].length}</span>
                    {age !== null && age > 0 && lists[list].length > 0 && (
                        <span data-prime-age={primeAgeTone(age)} className={cn("whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold", AGE_TONE[primeAgeTone(age)], tone === "ink" && primeAgeTone(age) === "ok" && "bg-white/20 text-white")}>
                            {t("prime.page.oldestAge", { days: age })}
                        </span>
                    )}
                </span>
                {foot && (
                    <span dir={dir} className={cn("truncate text-left text-xs tabular-nums", tone === "ink" ? "text-[#D6E1F5]" : "opacity-80")}>
                        {foot}
                    </span>
                )}
            </button>
        );
    };
    const line = (green = false) => (
        <span aria-hidden="true" className="flex items-center justify-center">
            <span className={cn("h-1 w-5 rounded-full opacity-60", green ? "bg-[#1F7A4D]" : "bg-[#315EA8]")} />
        </span>
    );
    const side = (list: PrimeBoardList, tone: keyof typeof SIDE_TONE, label: string) =>
        lists[list].length === 0 ? null : (
            <button
                key={list}
                type="button"
                onClick={() => onSelect(list)}
                aria-pressed={selected === list}
                data-prime-stage={list}
                className={cn("inline-flex h-9 items-center gap-2 rounded-full border px-3.5 text-sm font-semibold transition-shadow", SIDE_TONE[tone], selected === list && "shadow-[0_0_0_2px_currentColor]")}
            >
                {label}
                <b className="tabular-nums">{lists[list].length}</b>
            </button>
        );
    const sides = [side("postponed", "amber", t("orders.prime.row.postponed")), side("returning", "red", t("orders.prime.row.returning")), side("needs", "violet", t("prime.page.needsDecision"))].filter(Boolean);

    return (
        <section aria-label={t("prime.page.pipelineTitle")} className="flex flex-col gap-3 rounded-[22px] border border-[var(--card-border)] bg-[var(--card-bg)] p-4">
            <div className="grid grid-cols-[minmax(0,1fr)_28px_minmax(0,1fr)_28px_minmax(0,1.2fr)_28px_minmax(0,1fr)] items-stretch">
                {stage("handed_today", "gray", t("prime.page.handedToday"), `IQD ${amount.format(cash.handed_today)}`)}
                {line()}
                {stage("at_branch", "blue", t("prime.page.atBranch", { branch: branchName ?? t("orders.prime.stop.branch") }), t("prime.page.waitingOut"))}
                {line()}
                {stage("on_road", "ink", t("prime.page.onRoad"), "")}
                {line(true)}
                {stage("delivered_today", "green", t("prime.page.deliveredToday"), `IQD ${amount.format(cash.delivered_today)}`)}
            </div>
            {sides.length > 0 && <div className="flex flex-wrap gap-2">{sides}</div>}
        </section>
    );
}
