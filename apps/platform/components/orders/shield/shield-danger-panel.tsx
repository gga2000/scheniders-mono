"use client";

import { motion, useReducedMotion } from "framer-motion";
import { ShieldAlert, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage, useTextDir } from "@/hooks/use-language";
import { DANGER_BANDS, type DangerBand } from "@/lib/shield/danger";

/** Soft fills with a strong accent per band; red, amber and green carry the meaning. */
const TONE: Record<DangerBand, { tile: string; ring: string; dot: string; num: string }> = {
    red: { tile: "bg-rose-50 dark:bg-rose-500/10", ring: "ring-rose-500/60", dot: "bg-rose-500", num: "text-rose-700 dark:text-rose-300" },
    yellow: { tile: "bg-amber-50 dark:bg-amber-500/10", ring: "ring-amber-500/60", dot: "bg-amber-500", num: "text-amber-700 dark:text-amber-300" },
    green: { tile: "bg-emerald-50 dark:bg-emerald-500/10", ring: "ring-emerald-500/60", dot: "bg-emerald-500", num: "text-emerald-700 dark:text-emerald-300" },
};

interface Props {
    counts: Record<DangerBand, number>;
    /** Every order in the list; each one sits in one band. */
    listTotal: number;
    active: DangerBand | null;
    onSelect: (band: DangerBand | null) => void;
    onClose: () => void;
    countsHidden?: boolean;
}

/**
 * The Shield danger section above the order cards (Ali, 2026-11-05): three
 * tiles, high danger (Trust under 50), medium (50-79) and low (80+ or new),
 * sized by how many orders sit in each. Every order in the list gets a band,
 * whatever its status. Clicking a tile lists only its orders; clicking it
 * again shows them all.
 */
export function ShieldDangerPanel({ counts, listTotal, active, onSelect, onClose, countsHidden = false }: Props) {
    const { t } = useLanguage();
    const dir = useTextDir();
    const reduceMotion = useReducedMotion();
    const banded = DANGER_BANDS.reduce((sum, b) => sum + counts[b], 0);
    const num = (n: number) => (countsHidden ? "—" : n.toLocaleString());

    return (
        <section
            data-shield-danger-panel
            className="rounded-3xl border border-(--card-border) bg-(--card-bg) px-5 py-4 shadow-[0_8px_30px_-14px_rgba(15,23,42,0.16)]"
            aria-label={t("shield.danger.title")}
        >
            <div className="flex items-center gap-3">
                <span aria-hidden="true" className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300">
                    <ShieldAlert className="h-[18px] w-[18px]" />
                </span>
                <div className="min-w-0 flex-1">
                    <h3 dir={dir} className="text-left text-[14px] font-bold text-foreground">{t("shield.danger.title")}</h3>
                    <p dir={dir} className="text-left text-[12px] text-(--foreground-muted)">
                        {t("shield.danger.sub", { total: num(listTotal) })}
                    </p>
                </div>
                <button
                    type="button"
                    onClick={onClose}
                    aria-label={t("shield.danger.hide")}
                    title={t("shield.danger.hide")}
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-(--foreground-muted) hover:bg-muted/40 hover:text-foreground"
                >
                    <X className="h-4 w-4" />
                </button>
            </div>

            <div className="mt-3.5 flex gap-2">
                {DANGER_BANDS.map((band, i) => {
                    const isActive = active === band;
                    const tone = TONE[band];
                    return (
                        <motion.button
                            key={band}
                            type="button"
                            data-danger-band={band}
                            layout={!reduceMotion}
                            initial={reduceMotion ? false : { opacity: 0, y: 6 }}
                            animate={{ opacity: active && !isActive ? 0.5 : 1, y: 0 }}
                            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1], delay: reduceMotion ? 0 : i * 0.05 }}
                            onClick={() => onSelect(isActive ? null : band)}
                            aria-pressed={isActive}
                            style={{ flexGrow: countsHidden ? 1 : Math.max(counts[band], banded * 0.18, 1), flexBasis: 0 }}
                            className={cn(
                                "flex min-w-[150px] items-center justify-between gap-3 rounded-2xl px-4 py-2.5 text-left outline-none transition-shadow",
                                "hover:shadow-sm focus-visible:ring-2",
                                tone.tile,
                                isActive && cn("ring-2", tone.ring),
                            )}
                        >
                            <span className="min-w-0">
                                <span dir={dir} className="flex items-center gap-1.5 text-[13px] font-bold text-foreground">
                                    <span aria-hidden="true" className={cn("h-2 w-2 shrink-0 rounded-full", tone.dot)} />
                                    {t(`shield.danger.${band}`)}
                                </span>
                                <span dir={dir} className="mt-0.5 block truncate text-[11px] text-(--foreground-muted)">{t(`shield.danger.${band}Range`)}</span>
                            </span>
                            <span className={cn("font-mono text-[22px] font-extrabold leading-none tabular-nums", tone.num)}>{num(counts[band])}</span>
                        </motion.button>
                    );
                })}
            </div>
        </section>
    );
}
