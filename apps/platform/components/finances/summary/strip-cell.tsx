"use client";

import type { ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { NumberTickerDelay } from "@/components/ui/number-ticker";
import { ChangeChip, isShownChange } from "./change-chip";

interface StripCellProps {
    label: string;
    /** Hover text spelling out exactly what the figure counts. */
    hint: string;
    value: ReactNode;
    /** Percent change against the earlier period; null shows nothing. */
    change?: number | null;
    lowerIsBetter?: boolean;
    /** One quiet line under the figure. */
    note?: ReactNode;
    /** Place in the strip, from 0: cells enter one after another. */
    order: number;
    testId: string;
}

const STAGGER_S = 0.09;
const EASE_OUT = [0.16, 1, 0.3, 1] as const;

/** One of the smaller figures of the Finances strip: label, number, and a change or a note. */
export function StripCell({ label, hint, value, change = null, lowerIsBetter = false, note, order, testId }: StripCellProps) {
    const reduceMotion = useReducedMotion();
    const enter = order * STAGGER_S;
    return (
        <NumberTickerDelay.Provider value={Math.round((enter + 0.1) * 1000)}>
            <motion.div
                className="min-w-0 border-s border-white/10 px-5 py-1"
                title={hint}
                data-cell={testId}
                initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: enter, duration: 0.5, ease: EASE_OUT }}
            >
                <div className="whitespace-nowrap text-[12px] text-stone-400">{label}</div>
                <div className="mt-1 whitespace-nowrap text-[22px] font-semibold leading-tight tracking-[-0.02em] tabular-nums text-stone-50" data-stat={testId}>
                    {value}
                </div>
                <div className="mt-0.5 flex min-h-[18px] items-center gap-2 whitespace-nowrap text-[11.5px] text-stone-400">
                    {note}
                    {isShownChange(change) && <ChangeChip value={change} lowerIsBetter={lowerIsBetter} />}
                </div>
            </motion.div>
        </NumberTickerDelay.Provider>
    );
}
