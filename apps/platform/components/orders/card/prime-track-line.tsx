"use client";

import { useLanguage } from "@/hooks/use-language";
import { cn } from "@/lib/utils";
import { PRIME_STOP_COUNT, type PrimeTrack } from "@/lib/prime/track";

/** Colour per state: the dot, the line into a reached stop, and the pulse halo of the current stop. */
const TONE = {
    blue: { dot: "bg-[#315EA8] dark:bg-sky-400", line: "bg-[#315EA8] dark:bg-sky-400/70", halo: "bg-[#315EA8]/30 dark:bg-sky-400/30" },
    amber: { dot: "bg-[#D97706] dark:bg-amber-400", line: "bg-[#D97706] dark:bg-amber-400/70", halo: "bg-[#D97706]/30 dark:bg-amber-400/30" },
    red: { dot: "bg-[#B42318] dark:bg-rose-400", line: "bg-[#B42318] dark:bg-rose-400/70", halo: "bg-[#B42318]/30 dark:bg-rose-400/30" },
    green: { dot: "bg-[#1F7A4D] dark:bg-emerald-400", line: "bg-[#1F7A4D] dark:bg-emerald-400/70", halo: "bg-[#1F7A4D]/30 dark:bg-emerald-400/30" },
    gray: { dot: "bg-[#A9A49B] dark:bg-white/30", line: "bg-[#A9A49B] dark:bg-white/25", halo: "bg-transparent" },
} as const;
type Tone = keyof typeof TONE;

const STATE_TONE: Record<PrimeTrack["state"], Tone> = {
    moving: "blue",
    postponed: "amber",
    needs_you: "amber",
    returning: "red",
    delivered: "green",
    cancelled: "gray",
};

/**
 * The parcel's five stops: sent, Prime's branch, on the way, with the driver,
 * delivered. Reached stops are filled, the current one pulses. A parcel coming
 * back reads sent → branch → on the way → refused → coming back to you.
 */
export function PrimeTrackLine({ track, branchName }: { track: PrimeTrack; branchName: string | null }) {
    const { t } = useLanguage();
    const returning = track.state === "returning";
    const labels = [
        t("orders.prime.stop.sent"),
        branchName ?? t("orders.prime.stop.branch"),
        t("orders.prime.stop.onWay"),
        returning ? t("orders.prime.stop.refused") : t("orders.prime.stop.withDriver"),
        returning ? t("orders.prime.stop.comingBack") : t("orders.prime.stop.delivered"),
    ];
    // Coming back: the trip out went as planned (blue) until the refusal.
    const toneOf = (i: number): Tone => (returning && i < 3 ? "blue" : STATE_TONE[track.state]);

    return (
        <ol className="grid grid-cols-5 items-start" aria-label={t("orders.prime.track.label")}>
            {Array.from({ length: PRIME_STOP_COUNT }, (_, i) => {
                const reached = i <= track.stop;
                const current = i === track.stop && track.state !== "delivered" && track.state !== "cancelled";
                const tone = TONE[toneOf(i)];
                return (
                    <li
                        key={i}
                        aria-current={current ? "step" : undefined}
                        className={cn(
                            "relative flex min-w-0 flex-col items-center gap-1.5 text-center text-[11px] font-semibold",
                            reached ? "text-foreground" : "text-[#8A8A8A] dark:text-white/40",
                        )}
                    >
                        {i > 0 && (
                            <span
                                aria-hidden="true"
                                className={cn("absolute top-[6px] -left-1/2 h-0.5 w-full", reached ? tone.line : "bg-[#E4E0D8] dark:bg-white/10")}
                            />
                        )}
                        <span aria-hidden="true" className="relative z-[1] grid h-3.5 w-3.5 place-items-center">
                            {current && <span className={cn("absolute inset-[-5px] rounded-full animate-ping", tone.halo)} />}
                            <span className={cn("h-3.5 w-3.5 rounded-full", reached ? tone.dot : "bg-[#E4E0D8] dark:bg-white/15", current && "ring-[5px] ring-black/5 dark:ring-white/10")} />
                        </span>
                        <span className="max-w-full truncate px-1">{labels[i]}</span>
                    </li>
                );
            })}
        </ol>
    );
}
