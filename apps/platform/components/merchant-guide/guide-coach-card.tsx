"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";
import { ArrowRight, Check, ChevronLeft, ChevronRight, Minus } from "lucide-react";
import { useLanguage, useTextDir } from "@/hooks/use-language";
import { cn } from "@/lib/utils";
import { GuideCaption } from "./guide-caption";
import { GuideSoundButton } from "./guide-sound-button";
import type { GuideVoice } from "./use-guide-voice";
import type { TargetBox } from "./use-target-rect";

const GAP = 18;
const EDGE = 16;
/** How far above the bottom edge the card rests when it has nothing to point at. */
const DOCK_BOTTOM = 84;

/** Next to the element when there's room: below, else above, right, left. Always clear of the pill's band. */
function placeCard(card: HTMLElement, box: TargetBox | null, dockLeft: number): void {
    const w = card.offsetWidth;
    const h = card.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left: number;
    let top: number;
    if (!box) {
        left = dockLeft;
        top = vh - DOCK_BOTTOM - h;
    } else if (box.top + box.height + GAP + h <= vh - DOCK_BOTTOM) {
        top = box.top + box.height + GAP;
        left = box.left + box.width / 2 - w / 2;
    } else if (box.top - GAP - h >= EDGE) {
        top = box.top - GAP - h;
        left = box.left + box.width / 2 - w / 2;
    } else if (box.left + box.width + GAP + w <= vw - EDGE) {
        left = box.left + box.width + GAP;
        top = box.top + box.height / 2 - h / 2;
    } else {
        left = box.left - GAP - w;
        top = box.top + box.height / 2 - h / 2;
    }
    card.style.left = `${Math.max(EDGE, Math.min(vw - w - EDGE, left))}px`;
    // Never under the guide pill in the bottom corner.
    card.style.top = `${Math.max(EDGE, Math.min(vh - h - DOCK_BOTTOM, top))}px`;
}

export interface GuideCoachCardProps {
    /** "The basics · 2 of 4" */
    heading: string;
    voice: GuideVoice;
    soundOn: boolean;
    onToggleSound: () => void;
    checkText: string;
    box: TargetBox | null;
    /** Where the card rests (beside the pill) when it has nothing to point at. */
    dockLeft: number;
    /** Position within a step that walks several fields (name, photo...). */
    part?: { index: number; count: number; onBack: () => void; onNext: () => void };
    /** Shown when the merchant isn't on the step's page or screen. */
    onGo?: () => void;
    /** A stop that only explains: the merchant moves on with this button. */
    next?: { label: string; onClick: () => void; busy?: boolean };
    onMinimize: () => void;
    children?: ReactNode;
}

export function GuideCoachCard({
    heading,
    voice,
    soundOn,
    onToggleSound,
    checkText,
    box,
    dockLeft,
    part,
    onGo,
    next,
    onMinimize,
    children,
}: GuideCoachCardProps) {
    const { t } = useLanguage();
    const dir = useTextDir();
    const ref = useRef<HTMLDivElement>(null);

    useLayoutEffect(() => {
        const card = ref.current;
        if (!card) return;
        placeCard(card, box, dockLeft);
        // Glide only between places, never in from the corner on first show.
        card.dataset.placed = "true";
        const onResize = (): void => placeCard(card, box, dockLeft);
        window.addEventListener("resize", onResize);
        return () => window.removeEventListener("resize", onResize);
    });

    return (
        <div
            ref={ref}
            role="dialog"
            aria-live="polite"
            aria-label={heading}
            data-testid="merchant-guide-card"
            className="merchant-guide-card fixed z-[46] grid w-[min(360px,calc(100vw-32px))] gap-3 rounded-2xl bg-neutral-900 p-4 text-white shadow-[0_18px_40px_-16px_rgba(0,0,0,0.6)]"
        >
            <div className="flex items-center justify-between gap-2 text-xs text-neutral-400">
                <span dir={dir}>{heading}</span>
                <div className="flex items-center gap-1">
                    <GuideSoundButton soundOn={soundOn} speaking={voice.speaking} onToggle={onToggleSound} />
                    <button
                        type="button"
                        onClick={onMinimize}
                        aria-label={t("guide.minimize")}
                        title={t("guide.minimize")}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-full text-neutral-400 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#EFFF00]"
                    >
                        <Minus className="h-4 w-4" aria-hidden="true" />
                    </button>
                </div>
            </div>

            <GuideCaption voice={voice} className="text-[15px] font-semibold" />

            {children}

            <div className="flex items-start gap-2 text-xs text-neutral-400">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#EFFF00]" aria-hidden="true" />
                <span dir={dir} className="text-left">{checkText}</span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
                {onGo ? (
                    <button
                        type="button"
                        onClick={onGo}
                        data-testid="merchant-guide-go"
                        className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[#EFFF00] px-4 text-sm font-bold text-neutral-900 hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                    >
                        {t("guide.takeMeThere")}
                        <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </button>
                ) : next ? (
                    <button
                        type="button"
                        onClick={next.onClick}
                        disabled={next.busy}
                        data-testid="merchant-guide-next"
                        className="inline-flex h-9 items-center gap-1 rounded-full bg-[#EFFF00] px-4 text-sm font-bold text-neutral-900 hover:opacity-90 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                    >
                        {next.label}
                        <ChevronRight className="h-4 w-4" aria-hidden="true" />
                    </button>
                ) : part && part.count > 1 ? (
                    <>
                        <button
                            type="button"
                            onClick={part.onBack}
                            disabled={part.index === 0}
                            aria-label={t("guide.back")}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/20 hover:bg-white/10 disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#EFFF00]"
                        >
                            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                        </button>
                        <button
                            type="button"
                            onClick={part.onNext}
                            disabled={part.index >= part.count - 1}
                            data-testid="merchant-guide-next"
                            className={cn(
                                "inline-flex h-9 items-center gap-1 rounded-full bg-[#EFFF00] px-4 text-sm font-bold text-neutral-900 hover:opacity-90 disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white",
                            )}
                        >
                            {t("guide.next")}
                            <ChevronRight className="h-4 w-4" aria-hidden="true" />
                        </button>
                        <span className="text-xs tabular-nums text-neutral-500">
                            {part.index + 1}/{part.count}
                        </span>
                    </>
                ) : (
                    <span className="text-xs text-neutral-500">{t("guide.waiting")}</span>
                )}
            </div>
        </div>
    );
}
