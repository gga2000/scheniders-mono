import { cn } from "@/lib/utils";

/** Tones of the desk's status chips: blocked, needs a look, after-sale, quiet. */
export type DeskChipTone = keyof typeof DESK_CHIP_TONES;

export const DESK_CHIP_TONES = {
    bad: "bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300",
    warn: "bg-amber-50 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300",
    info: "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300",
    mute: "bg-[var(--background)] text-muted",
} as const;

export function DeskChip({ tone, children }: { tone: DeskChipTone; children: React.ReactNode }) {
    return (
        <span className={cn("inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium", DESK_CHIP_TONES[tone])}>
            {children}
        </span>
    );
}
