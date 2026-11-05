"use client";

import { useState } from "react";
import { ShieldAlert } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@scheniders/ui/popover";
import { cn } from "@/lib/utils";
import { useLanguage, useTextDir } from "@/hooks/use-language";
import { DANGER_LIMIT, useShieldDanger } from "@/hooks/use-shield-danger";
import { DANGER_OFF, snapDanger } from "@/lib/shield/danger";
import { useOrderStore } from "@/store/use-order-store";

/** The report's scale: red 0-50, yellow 50-80, green 80-100. */
const ZONES = [
    { band: "red", from: 0, to: 50, zone: "bg-rose-200 dark:bg-rose-500/40" },
    { band: "yellow", from: 50, to: 80, zone: "bg-amber-200 dark:bg-amber-500/40" },
    { band: "green", from: 80, to: 100, zone: "bg-emerald-200 dark:bg-emerald-500/40" },
] as const;

/**
 * Tools-bar Shield button on the orders page (Ali, 2026-11-05): opens a small
 * slider over the button, the same scale as the Shield report. Drag it to a
 * Trust score and the cards keep only the open orders at or under it,
 * riskiest first; all the way right shows every order again. The badge counts
 * the open orders under 80 (red when any is under 50).
 */
export function ShieldDangerToggle() {
    const { t } = useLanguage();
    const [open, setOpen] = useState(false);
    const max = useOrderStore((s) => s.dangerMax);
    const setMax = useOrderStore((s) => s.setDangerMax);
    const { count, red, scores } = useShieldDanger();
    const on = max < DANGER_OFF;
    const shown = on ? scores.filter((s) => s <= max).length : null;
    const label = t("shield.slider.button");

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    data-shield-slider-button
                    aria-pressed={on}
                    className={cn(
                        "relative p-2.5 rounded-xl transition-all duration-300",
                        on || open
                            ? "bg-rose-100 text-rose-700 shadow-sm dark:bg-[var(--primary)] dark:text-black"
                            : "text-muted-foreground hover:bg-amber-200/60 hover:text-foreground dark:hover:bg-white/5",
                    )}
                    title={label}
                    aria-label={count ? `${label} (${count})` : label}
                >
                    <ShieldAlert className="w-4 h-4" />
                    {count > 0 && (
                        <span
                            aria-hidden="true"
                            className={cn(
                                "absolute -top-1 -right-1 grid h-4 min-w-4 place-items-center rounded-full px-1 font-mono text-[9px] font-bold tabular-nums text-white",
                                red ? "bg-rose-600" : "bg-amber-500",
                            )}
                        >
                            {count >= DANGER_LIMIT ? "99+" : count}
                        </span>
                    )}
                </button>
            </PopoverTrigger>
            <PopoverContent
                side="top"
                sideOffset={10}
                className="w-[320px] rounded-2xl border-(--card-border) bg-(--card-bg) p-4 shadow-[0_12px_40px_-12px_rgba(15,23,42,0.28)]"
            >
                <DangerSlider max={max} shown={shown} onChange={setMax} />
            </PopoverContent>
        </Popover>
    );
}

/** The slider inside the popover: the report's scale with a thumb; 100 (far right) is off. */
export function DangerSlider({ max, shown, onChange }: { max: number; shown: number | null; onChange: (max: number) => void }) {
    const { t } = useLanguage();
    const dir = useTextDir();
    const on = max < DANGER_OFF;
    return (
        <>
    <div className="flex items-baseline justify-between gap-3">
        <span dir={dir} className="text-[13px] font-bold text-foreground">{t("shield.slider.title")}</span>
        <span dir={dir} className="text-[12px] text-muted-foreground tabular-nums">
            {on ? t("shield.slider.showing", { n: shown ?? 0, max }) : t("shield.slider.all")}
        </span>
    </div>

    <div className="relative mt-4 h-6" dir="ltr">
        <div className="absolute inset-x-0 top-2 flex h-2 gap-[3px]">
            {ZONES.map((z) => (
                <div key={z.band} className={cn("h-full rounded-full", z.zone)} style={{ width: `${z.to - z.from}%` }} />
            ))}
        </div>
        <span
            aria-hidden="true"
            className="pointer-events-none absolute top-0 -ml-[9px] block h-[18px] w-[18px] translate-y-[3px] rounded-full border-[3px] border-(--card-bg) bg-foreground shadow-[0_2px_6px_rgba(0,0,0,0.25)] transition-[left] duration-150"
            style={{ left: `${max}%`, top: -2 }}
        />
        <input
            type="range"
            min={0}
            max={DANGER_OFF}
            step={5}
            value={max}
            onChange={(e) => onChange(snapDanger(Number(e.target.value)))}
            aria-label={t("shield.slider.title")}
            aria-valuetext={on ? t("shield.slider.showing", { n: shown ?? 0, max }) : t("shield.slider.all")}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
    </div>

    <div className="mt-1 flex text-[11px] font-medium text-muted-foreground" dir="ltr">
        {ZONES.map((z) => (
            <span key={z.band} dir={dir} className={cn("text-left", z.band === "green" && "text-right")} style={{ width: `${z.to - z.from}%` }}>
                {t(`shield.band.${z.band}`)}
            </span>
        ))}
    </div>

    {on && (
        <button
            type="button"
            onClick={() => onChange(DANGER_OFF)}
            className="mt-3 h-8 w-full rounded-xl border border-(--card-border) text-[12px] font-semibold text-muted-foreground hover:bg-muted/40 hover:text-foreground"
        >
            {t("shield.slider.reset")}
        </button>
    )}
        </>
    );
}
