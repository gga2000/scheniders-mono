"use client";

import { useState } from "react";
import { ShieldAlert } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@scheniders/ui/popover";
import { Switch } from "@scheniders/ui/switch";
import { cn } from "@/lib/utils";
import { useLanguage, useTextDir } from "@/hooks/use-language";
import { DANGER_BANDS, type DangerBand } from "@/lib/shield/danger";
import { useOrderStore } from "@/store/use-order-store";

/** Track colours per stop: high (red), medium (yellow), low (green). */
const STOP_TONE: Record<DangerBand, { zone: string; text: string; thumb: string }> = {
    red: { zone: "bg-rose-200 dark:bg-rose-500/40", text: "text-rose-700 dark:text-rose-300", thumb: "bg-rose-600" },
    yellow: { zone: "bg-amber-200 dark:bg-amber-500/40", text: "text-amber-700 dark:text-amber-300", thumb: "bg-amber-500" },
    green: { zone: "bg-emerald-200 dark:bg-emerald-500/40", text: "text-emerald-700 dark:text-emerald-300", thumb: "bg-emerald-600" },
};

type Counts = Record<DangerBand, number>;

/**
 * Tools-bar Shield button on the orders page (Ali, 2026-11-05): opens a small
 * slider over the button with three stops, high, medium and low danger. Picking
 * a stop lists only that band's orders (every order in the list, any status);
 * "Show all orders" clears it. The badge counts the high-danger orders. Until
 * the scores load (`ready`), counts show a dash and no stop can be picked.
 */
export function ShieldDangerToggle({ counts, ready, failed, onRetry }: { counts: Counts; ready: boolean; failed: boolean; onRetry: () => void }) {
    const { t } = useLanguage();
    const dir = useTextDir();
    const [open, setOpen] = useState(false);
    const band = useOrderStore((s) => s.dangerBand);
    const setBand = useOrderStore((s) => s.setDangerBand);
    const showPanel = useOrderStore((s) => s.showDangerPanel);
    const setShowPanel = useOrderStore((s) => s.setShowDangerPanel);
    const label = t("shield.slider.button");
    const high = ready ? counts.red : 0;

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    data-shield-slider-button
                    aria-pressed={band !== null}
                    className={cn(
                        "relative p-2.5 rounded-xl transition-all duration-300",
                        band !== null || open
                            ? "bg-rose-100 text-rose-700 shadow-sm dark:bg-[var(--primary)] dark:text-black"
                            : "text-muted-foreground hover:bg-amber-200/60 hover:text-foreground dark:hover:bg-white/5",
                    )}
                    title={label}
                    aria-label={high ? `${label} (${high})` : label}
                >
                    <ShieldAlert className="w-4 h-4" />
                    {high > 0 && (
                        <span
                            aria-hidden="true"
                            className="absolute -top-1 -right-1 grid h-4 min-w-4 place-items-center rounded-full bg-rose-600 px-1 font-mono text-[9px] font-bold tabular-nums text-white"
                        >
                            {high > 99 ? "99+" : high}
                        </span>
                    )}
                </button>
            </PopoverTrigger>
            <PopoverContent
                side="top"
                sideOffset={10}
                className="w-[320px] rounded-2xl border-(--card-border) bg-(--card-bg) p-4 shadow-[0_12px_40px_-12px_rgba(15,23,42,0.28)]"
            >
                <DangerSlider band={band} counts={ready ? counts : null} onChange={setBand} />
                {failed && (
                    <div role="alert" className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-rose-50 px-3 py-2 dark:bg-rose-500/10">
                        <span dir={dir} className="text-[12px] text-rose-700 dark:text-rose-300">{t("shield.slider.error")}</span>
                        <button type="button" onClick={onRetry} className="shrink-0 text-[12px] font-bold text-rose-700 underline-offset-2 hover:underline dark:text-rose-300">
                            {t("shield.slider.retry")}
                        </button>
                    </div>
                )}
                <label className="mt-3 flex cursor-pointer items-center justify-between gap-3 border-t border-(--card-border) pt-3">
                    <span dir={dir} className="text-[12px] font-semibold text-foreground">{t("shield.danger.show")}</span>
                    <Switch checked={showPanel} onCheckedChange={setShowPanel} aria-label={t("shield.danger.show")} />
                </label>
            </PopoverContent>
        </Popover>
    );
}

/**
 * The three-stop slider: high, medium, low danger. No stop picked = every order.
 * `counts` is null while the scores load. A stop with no orders can't be
 * picked, so the list never goes empty from the slider.
 */
export function DangerSlider({ band, counts, onChange }: { band: DangerBand | null; counts: Counts | null; onChange: (band: DangerBand | null) => void }) {
    const { t } = useLanguage();
    const dir = useTextDir();
    const index = band === null ? -1 : DANGER_BANDS.indexOf(band);
    const num = (n: number) => n.toLocaleString("en-US");
    const shown = (b: DangerBand) => (counts ? num(counts[b]) : "—");
    const canPick = (b: DangerBand) => band === b || (counts !== null && counts[b] > 0);
    const status = band === null ? t("shield.slider.all") : t("shield.slider.showing", { n: shown(band) });

    return (
        <>
            <div className="flex items-baseline justify-between gap-3">
                <span dir={dir} className="text-[13px] font-bold text-foreground">{t("shield.slider.title")}</span>
                <span dir={dir} className="text-[12px] text-muted-foreground tabular-nums">{status}</span>
            </div>

            <div role="radiogroup" aria-label={t("shield.slider.title")} className="relative mt-4 h-6" dir="ltr">
                <div className="absolute inset-x-0 top-2 flex h-2 gap-[3px]">
                    {DANGER_BANDS.map((b) => (
                        <div
                            key={b}
                            className={cn("h-full flex-1 rounded-full transition-opacity", STOP_TONE[b].zone, band !== null && b !== band && "opacity-40")}
                        />
                    ))}
                </div>
                {DANGER_BANDS.map((b, i) => (
                    <span
                        key={b}
                        aria-hidden="true"
                        className="pointer-events-none absolute top-[6px] -ml-[3px] block h-[6px] w-[6px] rounded-full bg-(--card-bg)"
                        style={{ left: `${(i * 2 + 1) * (100 / 6)}%` }}
                    />
                ))}
                {band !== null && (
                    <span
                        aria-hidden="true"
                        className={cn(
                            "pointer-events-none absolute top-[1px] -ml-[9px] block h-[18px] w-[18px] rounded-full border-[3px] border-(--card-bg) shadow-[0_2px_6px_rgba(0,0,0,0.25)] transition-[left] duration-200",
                            STOP_TONE[band].thumb,
                        )}
                        style={{ left: `${(index * 2 + 1) * (100 / 6)}%` }}
                    />
                )}
                <div className="absolute inset-0 flex">
                    {DANGER_BANDS.map((b) => (
                        <button
                            key={b}
                            type="button"
                            role="radio"
                            aria-checked={band === b}
                            aria-label={`${t(`shield.danger.${b}`)} (${shown(b)})`}
                            disabled={!canPick(b)}
                            onClick={() => onChange(band === b ? null : b)}
                            className="h-full flex-1 cursor-pointer disabled:cursor-not-allowed"
                        />
                    ))}
                </div>
            </div>

            <div className="mt-1 flex text-[12px] font-medium" dir="ltr">
                {DANGER_BANDS.map((b) => (
                    <button
                        key={b}
                        type="button"
                        tabIndex={-1}
                        disabled={!canPick(b)}
                        onClick={() => onChange(band === b ? null : b)}
                        className={cn(
                            "flex flex-1 flex-col items-center gap-0.5 rounded-lg py-1 transition-colors hover:bg-muted/40 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-transparent",
                            band === b ? STOP_TONE[b].text : "text-muted-foreground",
                        )}
                    >
                        <span dir={dir} className={cn(band === b && "font-bold")}>{t(`shield.danger.${b}`)}</span>
                        <span className="font-mono text-[12px] tabular-nums opacity-80">{shown(b)}</span>
                    </button>
                ))}
            </div>

            {band !== null && (
                <button
                    type="button"
                    onClick={() => onChange(null)}
                    className="mt-3 h-8 w-full rounded-xl border border-(--card-border) text-[12px] font-semibold text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                >
                    {t("shield.slider.reset")}
                </button>
            )}
        </>
    );
}
