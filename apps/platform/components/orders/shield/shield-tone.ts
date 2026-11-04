import type { ShieldBand } from "@/lib/shield/delivery-chance";

/** Shield's three colours; semantic (risk), separate from the store's accent. */
export const SHIELD_TONE: Record<ShieldBand, { ring: string; pill: string; text: string }> = {
    red: {
        ring: "border-rose-600 text-rose-700 dark:border-rose-400 dark:text-rose-300",
        pill: "bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
        text: "text-rose-700 dark:text-rose-300",
    },
    yellow: {
        ring: "border-amber-500 text-amber-700 dark:border-amber-400 dark:text-amber-300",
        pill: "bg-amber-50 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
        text: "text-amber-700 dark:text-amber-300",
    },
    green: {
        ring: "border-emerald-600 text-emerald-700 dark:border-emerald-400 dark:text-emerald-300",
        pill: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
        text: "text-emerald-700 dark:text-emerald-300",
    },
};

export const SEQ_TONE: Record<string, string> = {
    D: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300",
    R: "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300",
    N: "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300",
    C: "bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300",
    O: "bg-zinc-100 text-zinc-700 dark:bg-zinc-500/20 dark:text-zinc-300",
};
