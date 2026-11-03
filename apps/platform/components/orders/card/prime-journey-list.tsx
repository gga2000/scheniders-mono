"use client";

import { useLanguage, useTextDir } from "@/hooks/use-language";
import { usePrimeJourney } from "@/hooks/use-prime-shipments";
import { primeTrack } from "@/lib/prime/track";
import { primeWhen } from "@/lib/prime/when";
import { cn } from "@/lib/utils";

type Dot = "blue" | "amber" | "red" | "green" | "gray";

const DOT: Record<Dot, string> = {
    blue: "bg-[#315EA8] dark:bg-sky-400",
    amber: "bg-[#D97706] dark:bg-amber-400",
    red: "bg-[#B42318] dark:bg-rose-400",
    green: "bg-[#1F7A4D] dark:bg-emerald-400",
    gray: "bg-[#A9A49B] dark:bg-white/30",
};

interface JourneyRow {
    key: string;
    at: string | null;
    title: string;
    dot: Dot;
}

/** The colour of a recorded step, read the same way as the band's track. */
function stepDot(stepCode: string | null, status: string | null): Dot {
    const { state } = primeTrack({ status, stepCode, cancelledAt: null, pushError: null, cancelRefusedAt: null });
    if (state === "returning") return "red";
    if (state === "postponed" || state === "needs_you") return "amber";
    if (state === "delivered") return "green";
    if (state === "cancelled") return "gray";
    return "blue";
}

/**
 * «رحلة الطرد»: every step Prime recorded for the parcel, newest first, with
 * the hand-off from the dispatch desk (and a resend request) as our own steps.
 * Read from Prime when the panel opens.
 */
export function PrimeJourneyList({ orderId, caseId }: { orderId: string; caseId: number }) {
    const { t } = useLanguage();
    const dir = useTextDir();
    const journey = usePrimeJourney(orderId, true);

    let rows: JourneyRow[] = [];
    let problem: string | null = null;
    if (journey.isError) problem = t("orders.prime.unreachable");
    else if (journey.data && !journey.data.ok) problem = t(journey.data.reason === "prime_unreachable" ? "orders.prime.unreachable" : "orders.prime.panel.noJourney");
    else if (journey.data?.ok) {
        const answer = journey.data;
        rows = [
            ...answer.steps.map((s, i) => ({
                key: `p${i}`,
                at: s.at,
                title: s.stepName ?? s.stepCode ?? s.status ?? "—",
                dot: stepDot(s.stepCode, s.status),
            })),
            ...(answer.resentAt ? [{ key: "resent", at: answer.resentAt, title: t("orders.prime.panel.resentStep"), dot: "green" as const }] : []),
            { key: "sent", at: answer.sentAt, title: t("orders.prime.panel.sentStep"), dot: "blue" as const },
        ].sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""));
    }

    return (
        <section className="flex min-w-0 flex-col gap-4 rounded-[18px] border border-[#EFECE6] bg-white p-[18px] dark:border-white/10 dark:bg-white/[0.03]">
            <header className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-bold text-foreground">{t("orders.prime.band.journey")}</h3>
                <span className="inline-flex h-6 items-center gap-1.5 rounded-lg bg-[#E8EEF8] px-2.5 text-xs font-bold text-[#1F3F75] dark:bg-sky-400/15 dark:text-sky-200">
                    {t("orders.prime.band.caseLabel")} <span className="font-mono tabular-nums">#{caseId}</span>
                </span>
            </header>
            {journey.isPending ? (
                <div className="flex flex-col gap-3" aria-busy="true">
                    {[0, 1, 2].map((i) => (
                        <div key={i} className="h-4 animate-pulse rounded bg-[#F5F3EF] dark:bg-white/5" style={{ width: `${80 - i * 15}%` }} />
                    ))}
                </div>
            ) : problem ? (
                <p dir={dir} className="text-left text-xs text-muted">{problem}</p>
            ) : (
                <ol className="flex flex-col">
                    {rows.map((row, i) => (
                        <li key={row.key} className="relative grid grid-cols-[22px_minmax(0,1fr)_auto] items-start gap-3 pb-[18px] last:pb-0">
                            {i < rows.length - 1 && <span aria-hidden="true" className="absolute bottom-[-2px] left-[10px] top-4 w-0.5 bg-[#ECE8E1] dark:bg-white/10" />}
                            <span aria-hidden="true" className={cn("relative z-[1] mx-[5px] mt-1 h-3 w-3 rounded-full", DOT[row.dot], i === 0 && "ring-4 ring-black/5 dark:ring-white/10")} />
                            <span dir={dir} className={cn("min-w-0 text-left text-[13px] leading-snug", i === 0 ? "font-bold text-foreground" : "text-[#4A4A4A] dark:text-white/70")}>{row.title}</span>
                            <span dir={dir} className="whitespace-nowrap text-xs text-[#6B6B6B] tabular-nums dark:text-white/50">{row.at ? primeWhen(row.at, t) : ""}</span>
                        </li>
                    ))}
                </ol>
            )}
        </section>
    );
}
