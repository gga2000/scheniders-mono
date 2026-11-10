"use client";

// «دليلك» — the guide's home in the corner after the basics: the optional
// phases with their minutes and ticks. Picking one starts it on its page.

import { useEffect, useRef, useState } from "react";
import { Check, ChevronRight, Compass, EyeOff, X } from "lucide-react";
import { useLanguage, useTextDir } from "@/hooks/use-language";
import { cn } from "@/lib/utils";

export interface GuideListItem {
    id: string;
    labelKey: string;
    minutes: number;
    done: boolean;
}

const R = 9;
const C = 2 * Math.PI * R;

export function GuideList({
    items,
    left,
    onPick,
    onHide,
}: {
    items: readonly GuideListItem[];
    left: number;
    onPick: (id: string) => void;
    onHide: () => void;
}) {
    const { t } = useLanguage();
    const dir = useTextDir();
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    const done = items.filter((i) => i.done).length;

    useEffect(() => {
        if (!open) return;
        const close = (e: MouseEvent): void => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener("mousedown", close);
        return () => document.removeEventListener("mousedown", close);
    }, [open]);

    return (
        <div ref={ref} className="fixed bottom-6 z-[46]" style={{ left }} data-testid="merchant-guide-list">
            {open && (
                <div
                    role="dialog"
                    aria-label={t("guide.name")}
                    className="merchant-guide-card absolute bottom-[calc(100%+10px)] left-0 grid w-[min(340px,calc(100vw-32px))] gap-1 rounded-2xl bg-neutral-900 p-3 text-white shadow-[0_18px_40px_-16px_rgba(0,0,0,0.6)]"
                >
                    <div className="flex items-center justify-between px-1 pb-1">
                        <span dir={dir} className="text-sm font-bold">
                            {t("guide.name")}
                        </span>
                        <button
                            type="button"
                            onClick={() => setOpen(false)}
                            aria-label={t("guide.fo.close")}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-neutral-400 hover:bg-white/10 hover:text-white"
                        >
                            <X className="h-4 w-4" aria-hidden="true" />
                        </button>
                    </div>
                    {items.map((item) => (
                        <button
                            key={item.id}
                            type="button"
                            data-testid={`merchant-guide-list-${item.id}`}
                            onClick={() => {
                                setOpen(false);
                                onPick(item.id);
                            }}
                            className="flex items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#EFFF00]"
                        >
                            <span
                                className={cn(
                                    "grid h-6 w-6 shrink-0 place-items-center rounded-full border",
                                    item.done ? "border-[#EFFF00] bg-[#EFFF00] text-neutral-900" : "border-white/25",
                                )}
                            >
                                {item.done && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
                            </span>
                            <span dir={dir} className="flex-1 text-sm font-semibold">
                                {t(item.labelKey)}
                            </span>
                            <span dir={dir} className="text-xs tabular-nums text-neutral-400">{t("guide.list.minutes", { count: item.minutes })}</span>
                            <ChevronRight className="h-4 w-4 text-neutral-500" aria-hidden="true" />
                        </button>
                    ))}
                    <button
                        type="button"
                        onClick={onHide}
                        className="mt-1 inline-flex items-center gap-1.5 justify-self-start rounded-full px-2 py-1.5 text-xs text-neutral-400 hover:text-white"
                    >
                        <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
                        <span dir={dir}>{t("guide.list.hide")}</span>
                    </button>
                </div>
            )}
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                aria-expanded={open}
                className="inline-flex h-11 items-center gap-2.5 rounded-full bg-neutral-900 px-4 text-sm text-white shadow-[0_10px_30px_-12px_rgba(0,0,0,0.6)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#EFFF00]"
            >
                <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0 -rotate-90" aria-hidden="true">
                    <circle cx="12" cy="12" r={R} fill="none" stroke="rgb(255 255 255 / 0.25)" strokeWidth="3" />
                    <circle
                        cx="12"
                        cy="12"
                        r={R}
                        fill="none"
                        stroke="#EFFF00"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeDasharray={`${items.length ? (C * done) / items.length : 0} ${C}`}
                    />
                </svg>
                <span dir={dir}>
                    {t("guide.name")} · {t("guide.progressDone", { done, total: items.length })}
                </span>
                <Compass className="h-4 w-4 text-[#EFFF00]" aria-hidden="true" />
            </button>
        </div>
    );
}
