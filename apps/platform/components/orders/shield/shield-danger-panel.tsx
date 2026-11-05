"use client";

import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import { DANGER_BANDS, type DangerBand } from "@/lib/shield/danger";

/** Pastel fills in the pipeline's style; red, amber and green carry the meaning. */
const FILL: Record<DangerBand, { bg: string; dot: string }> = {
    red: { bg: "#FBD3D9", dot: "#E11D48" },
    yellow: { bg: "#FDE9B6", dot: "#F59E0B" },
    green: { bg: "#CFEFD9", dot: "#059669" },
};

interface Props {
    counts: Record<DangerBand, number>;
    active: DangerBand | null;
    onSelect: (band: DangerBand | null) => void;
    countsHidden?: boolean;
}

/**
 * The Shield danger panel above the order cards (Ali, 2026-11-05), built like
 * the order pipeline: one bar split by how many open orders sit in each band,
 * high danger (Trust under 50), medium (50-79) and low (80+ or new). Clicking
 * a band lists only its orders; clicking it again shows them all.
 */
export function ShieldDangerPanel({ counts, active, onSelect, countsHidden = false }: Props) {
    const { t } = useLanguage();
    const reduceMotion = useReducedMotion();
    const total = DANGER_BANDS.reduce((sum, b) => sum + counts[b], 0);

    return (
        <section
            data-shield-danger-panel
            className="rounded-3xl border border-(--card-border) bg-(--card-bg) p-6 shadow-[0_8px_30px_-12px_rgba(15,23,42,0.14)]"
            aria-label={t("shield.danger.title")}
        >
            <div className="mb-4 flex items-center justify-between gap-3">
                <h3 className="text-[12px] font-bold uppercase tracking-[0.16em] text-(--foreground-muted)">{t("shield.danger.title")}</h3>
                <span className="text-[13px] text-(--foreground-muted)">
                    <span className="font-semibold text-foreground tabular-nums">{countsHidden ? "—" : total.toLocaleString()}</span>{" "}
                    {t("shield.danger.total")}
                </span>
            </div>

            {!countsHidden && total === 0 ? (
                <div className="flex h-[66px] items-center justify-center rounded-[20px] border border-dashed border-(--card-border) text-sm text-(--foreground-subtle)">
                    {t("shield.danger.empty")}
                </div>
            ) : (
                <div className="flex h-[66px] items-stretch overflow-hidden rounded-[20px] ring-1 ring-black/5">
                    {DANGER_BANDS.map((band, i) => {
                        const isActive = active === band;
                        const label = t(`shield.danger.${band}`);
                        return (
                            <motion.button
                                key={band}
                                type="button"
                                data-danger-band={band}
                                layout={!reduceMotion}
                                initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                                animate={{ opacity: active && !isActive ? 0.45 : 1, y: 0 }}
                                transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1], delay: reduceMotion ? 0 : i * 0.05 }}
                                onClick={() => onSelect(isActive ? null : band)}
                                aria-pressed={isActive}
                                title={countsHidden ? label : `${label} · ${counts[band].toLocaleString()}`}
                                style={{ flexGrow: countsHidden ? 1 : Math.max(counts[band], total * 0.12), flexBasis: 0, backgroundColor: FILL[band].bg }}
                                className={cn(
                                    "relative flex min-w-[120px] flex-col items-center justify-center px-3 text-center text-slate-800 outline-none transition-[filter,opacity] duration-300",
                                    "hover:z-10 hover:brightness-[1.03] focus-visible:z-10 focus-visible:brightness-[1.03]",
                                    i > 0 && "border-l border-white/35",
                                    isActive && "z-10 ring-2 ring-inset ring-slate-900/15",
                                )}
                            >
                                <span className="text-[20px] font-extrabold leading-none tabular-nums">{countsHidden ? "—" : counts[band].toLocaleString()}</span>
                                <span className="mt-1 max-w-full truncate text-[11px] font-medium text-slate-700">{label}</span>
                            </motion.button>
                        );
                    })}
                </div>
            )}

            <div className="mt-3.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                {DANGER_BANDS.map((band) => (
                    <button
                        key={band}
                        type="button"
                        onClick={() => onSelect(active === band ? null : band)}
                        className={cn(
                            "inline-flex items-center gap-1.5 rounded-full px-1.5 py-0.5 text-[13px] font-medium transition-colors",
                            active === band ? "text-foreground" : "text-(--foreground-muted) hover:text-foreground",
                        )}
                    >
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: FILL[band].dot }} aria-hidden />
                        {t(`shield.danger.${band}`)} <span className="text-(--foreground-subtle)">· {t(`shield.danger.${band}Range`)}</span>
                    </button>
                ))}
                <span dir="auto" className="text-[12px] text-(--foreground-subtle)">{t("shield.danger.note")}</span>
            </div>
        </section>
    );
}
