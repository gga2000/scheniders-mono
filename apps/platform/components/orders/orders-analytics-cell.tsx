import type { ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import { NumberTickerDelay } from "@/components/ui/number-ticker";

export type ChangeUnit = "%" | "pt";

interface CellProps {
    label: string;
    /** Hover text spelling out exactly what the figure counts. */
    hint: string;
    /** The headline figure; null while it loads. */
    value: ReactNode | null;
    /** Change against the earlier period; null renders nothing (no comparison beats a fake one). */
    change?: number | null;
    changeUnit?: ChangeUnit;
    /** Whether a drop is the good direction (confirm speed): flips the colours. */
    lowerIsBetter?: boolean;
    /** Quiet text beside the figure when there is no change to show: a second figure or the window it covers. */
    note?: ReactNode;
    /** A smaller second figure under the headline (the IQD equivalent of a USD figure). */
    sub?: ReactNode;
    /** Place in the bar, from 0: cells enter and start rolling one after another, left to right. */
    order?: number;
    testId: string;
}

/** Gap between one cell entering and the next. */
const STAGGER_S = 0.11;
/** The number starts rolling just after its cell begins to appear. */
const ROLL_LAG_S = 0.12;
/** The change arrow shows once the roll has mostly landed. */
const CHANGE_LAG_S = 0.9;
const EASE_OUT = [0.16, 1, 0.3, 1] as const;

/** 12% / 3.1% / 102× — a change from a base of 1 order reads as noise, so past +1000% it is a multiple. */
function formatChange(value: number, unit: ChangeUnit): string {
    const abs = Math.abs(value);
    if (unit === "%" && value >= 1000) return `${Math.round(1 + value / 100)}×`;
    const text = abs >= 10 ? String(Math.round(abs)) : abs.toFixed(1).replace(/\.0$/, "");
    return unit === "%" ? `${text}%` : `${text}pt`;
}

function Change({ value, unit, lowerIsBetter }: { value: number; unit: ChangeUnit; lowerIsBetter: boolean }) {
    if (!Number.isFinite(value) || Math.abs(value) < 0.05) return null;
    const up = value > 0;
    const good = up !== lowerIsBetter;
    return (
        <span className={cn("inline-flex items-center gap-[2px] text-[11px] font-semibold tabular-nums", good ? "text-emerald-400" : "text-rose-400")}>
            <svg viewBox="0 0 12 12" className={cn("size-[9px]", !up && "rotate-180")} aria-hidden="true">
                <path d="M6 10.5V1.5M2 5.5l4-4 4 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {formatChange(value, unit)}
        </span>
    );
}

/** One figure of the orders analytics bar: a small label, the number, and what changed (or a quiet note). */
export function OrdersAnalyticsCell({ label, hint, value, change = null, changeUnit = "%", lowerIsBetter = false, note, sub, order = 0, testId }: CellProps) {
    const showChange = value !== null && change !== null && Math.abs(change) >= 0.05;
    const reduceMotion = useReducedMotion();
    const enter = order * STAGGER_S;
    return (
        <NumberTickerDelay.Provider value={Math.round((enter + ROLL_LAG_S) * 1000)}>
        <motion.div
            className="flex-auto border-s border-white/10 px-3.5 py-1 first:border-s-0"
            title={hint}
            data-cell={testId}
            initial={reduceMotion ? false : { opacity: 0, y: 8, filter: "blur(6px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{ delay: enter, duration: 0.6, ease: EASE_OUT }}
        >
            <div className="whitespace-nowrap text-[11px] text-stone-400">{label}</div>
            <div className="flex items-baseline gap-2">
                {value === null ? (
                    <span className="my-0.5 h-5 w-14 animate-pulse rounded bg-white/15" aria-hidden="true" />
                ) : (
                    <span className="whitespace-nowrap text-[21px] font-semibold leading-tight tracking-[-0.02em] tabular-nums text-stone-50" data-stat={testId}>
                        {value}
                    </span>
                )}
                {showChange ? (
                    // The arrow lands once the number has nearly finished rolling, so the eye reads value then change.
                    <motion.span
                        initial={reduceMotion ? false : { opacity: 0, x: -4 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: enter + CHANGE_LAG_S, duration: 0.45, ease: EASE_OUT }}
                    >
                        <Change value={change} unit={changeUnit} lowerIsBetter={lowerIsBetter} />
                    </motion.span>
                ) : null}
                {value !== null && note ? <span className="whitespace-nowrap text-[11px] text-stone-400">{note}</span> : null}
            </div>
            {value !== null && sub ? (
                <div className="whitespace-nowrap text-[11px] tabular-nums text-stone-400" data-sub={testId}>
                    {sub}
                </div>
            ) : null}
        </motion.div>
        </NumberTickerDelay.Provider>
    );
}
