"use client";

import { useLanguage, useTextDir } from "@/hooks/use-language";
import type { PrimeBoard, PrimeBoardList } from "@/lib/prime/board";
import { cn } from "@/lib/utils";

const amount = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

const STAGE_TONE = {
    gray: "bg-[#F5F3EF] text-foreground dark:bg-white/5",
    blue: "bg-[#EEF2F9] text-[#1F3F75] dark:bg-sky-400/10 dark:text-sky-200",
    ink: "bg-[#315EA8] text-white",
    green: "bg-[#E3F2E9] text-[#165C39] dark:bg-emerald-400/10 dark:text-emerald-200",
} as const;

const TILE_TONE = {
    amber: "border-[#F1DDBF] bg-[#FFFAF2] text-[#8A4B00] dark:border-amber-400/25 dark:bg-amber-400/[0.06] dark:text-amber-200",
    red: "border-[#F0C9C4] bg-[#FFF6F5] text-[#8F1D13] dark:border-rose-400/25 dark:bg-rose-500/[0.06] dark:text-rose-200",
    violet: "border-[#DED3FA] bg-[#F5F1FE] text-[#4B2FA8] dark:border-violet-400/25 dark:bg-violet-400/[0.06] dark:text-violet-200",
} as const;

/**
 * «مسار طرودك الآن»: handed to Prime today → at the branch → on the road and
 * with the driver → delivered today, then postponed / coming back / needs a
 * decision. Every number opens its parcels in the list below.
 */
export function PrimePipeline({
    board,
    branchName,
    selected,
    onSelect,
}: {
    board: PrimeBoard;
    branchName: string | null;
    selected: PrimeBoardList;
    onSelect: (list: PrimeBoardList) => void;
}) {
    const { t } = useLanguage();
    const dir = useTextDir();
    const { lists, cash } = board;

    const stage = (list: PrimeBoardList, tone: keyof typeof STAGE_TONE, label: string, foot: string, big = false) => (
        <button
            type="button"
            onClick={() => onSelect(list)}
            aria-pressed={selected === list}
            data-prime-stage={list}
            className={cn(
                "flex min-w-0 flex-col gap-1 rounded-[20px] px-[18px] py-4 text-left transition-shadow hover:shadow-[0_0_0_2px_rgba(49,94,168,0.25)]",
                STAGE_TONE[tone],
                selected === list && "shadow-[0_0_0_2px_#315EA8]",
            )}
        >
            <span dir={dir} className={cn("text-left text-xs", tone === "ink" ? "text-[#D6E1F5]" : "opacity-80")}>{label}</span>
            <span className={cn("font-bold leading-tight tabular-nums", big ? "text-[44px]" : "text-[34px]")}>{lists[list].length}</span>
            <span dir={dir} className={cn("truncate text-left text-xs tabular-nums", tone === "ink" ? "text-[#D6E1F5]" : "opacity-80")}>{foot}</span>
        </button>
    );
    const arrow = (green = false) => (
        <span aria-hidden="true" className="flex items-center justify-center">
            <span className={cn("h-1.5 w-7 rounded-full opacity-60 motion-safe:animate-pulse", green ? "bg-[#1F7A4D]" : "bg-[#315EA8]")} />
        </span>
    );
    const tile = (list: PrimeBoardList, tone: keyof typeof TILE_TONE, label: string) => (
        <button
            type="button"
            onClick={() => onSelect(list)}
            aria-pressed={selected === list}
            data-prime-stage={list}
            className={cn(
                "flex items-center justify-between rounded-2xl border px-4 py-3 text-left transition-shadow",
                TILE_TONE[tone],
                selected === list && "shadow-[0_0_0_2px_currentColor]",
            )}
        >
            <span className="text-sm font-semibold">{label}</span>
            <b className="text-xl tabular-nums">{lists[list].length}</b>
        </button>
    );

    return (
        <section className="flex flex-col gap-3.5 rounded-[22px] border border-[var(--card-border)] bg-[var(--card-bg)] p-[22px]">
            <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-lg font-bold text-foreground">{t("prime.page.pipelineTitle")}</h2>
                <span className="text-xs text-muted">{t("prime.page.pipelineHint")}</span>
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)_40px_minmax(0,1fr)_40px_minmax(0,1.4fr)_40px_minmax(0,1fr)] items-stretch">
                {stage("handed_today", "gray", t("prime.page.handedToday"), `IQD ${amount.format(cash.handed_today)}`)}
                {arrow()}
                {stage("at_branch", "blue", t("prime.page.atBranch", { branch: branchName ?? t("orders.prime.stop.branch") }), t("prime.page.waitingOut"))}
                {arrow()}
                {stage("on_road", "ink", t("prime.page.onRoad"), t("prime.page.openCash", { amount: amount.format(cash.on_road) }), true)}
                {arrow(true)}
                {stage("delivered_today", "green", t("prime.page.deliveredToday"), `IQD ${amount.format(cash.delivered_today)}`)}
            </div>
            <div className="grid grid-cols-3 gap-3">
                {tile("postponed", "amber", t("orders.prime.row.postponed"))}
                {tile("returning", "red", t("orders.prime.row.returning"))}
                {tile("needs", "violet", t("prime.page.needsDecision"))}
            </div>
        </section>
    );
}
