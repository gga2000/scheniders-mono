"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";
import { ArrowRight, Check, ChevronLeft, ChevronRight, Minus } from "lucide-react";
import { useLanguage, useTextDir } from "@/hooks/use-language";
import { cn } from "@/lib/utils";
import { GuideCaption } from "./guide-caption";
import { useGuidePillBottom } from "./guide-setup-store";
import { GuideSoundButton } from "./guide-sound-button";
import { useGlide } from "./use-glide";
import type { GuideVoice } from "./use-guide-voice";
import { GUIDE_PHONE_MAX_WIDTH, usePhoneTyping } from "./use-phone-typing";
import type { TargetBox } from "./use-target-rect";

const GAP = 18;
const EDGE = 16;
/** The pill's band under the card: the pill (44px) and a 16px gap. */
const PILL_BAND = 60;

/**
 * Next to the element when there's room: below, else above, right, left.
 * Always clear of the pill's band. On a phone there is no room beside
 * anything, so the card rests at the bottom above the pill and the light
 * alone shows the element.
 */
function placeCard(card: HTMLElement, box: TargetBox | null, dockLeft: number, pillBottom: number): void {
    const w = card.offsetWidth;
    const h = card.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const dockBottom = pillBottom + PILL_BAND;
    let left: number;
    let top: number;
    if (!box || vw < GUIDE_PHONE_MAX_WIDTH) {
        left = dockLeft;
        top = vh - dockBottom - h;
    } else if (box.top + box.height + GAP + h <= vh - dockBottom) {
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
    card.style.top = `${Math.max(EDGE, Math.min(vh - h - dockBottom, top))}px`;
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
    part?: { index: number; count: number; onNext: () => void };
    /** The step or field before this one. Null shows the arrow switched off (the very first one); left out, there is none. */
    onBack?: (() => void) | null;
    /** Shown when the merchant isn't on the step's page or screen. */
    onGo?: () => void;
    /** A stop that only explains: the merchant moves on with this button. */
    next?: { label: string; onClick: () => void; busy?: boolean };
    /** A way to put the step off for now, shown while the card waits («بعدين» on the logo). */
    later?: { label: string; onClick: () => void };
    /** What the card waits for when it has no button: the step to tick, or the merchant's click on the light. */
    waitingFor?: "step" | "click";
    /** The last resort when the thing to click can't be found: a small link that goes there. */
    onLost?: () => void;
    /** A finished step the merchant came back to. */
    done?: boolean;
    /** The light is on something in the sidebar, the phone menu or a sheet: the card sits above them too. */
    raised?: boolean;
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
    onBack,
    onGo,
    next,
    later,
    waitingFor = "step",
    onLost,
    done = false,
    raised = false,
    onMinimize,
    children,
}: GuideCoachCardProps) {
    const { t } = useLanguage();
    const dir = useTextDir();
    const ref = useRef<HTMLDivElement>(null);
    const pillBottom = useGuidePillBottom();
    const typing = usePhoneTyping();
    // Glides when the light moves to another element or the card docks; it
    // follows a scrolling element without lagging behind it.
    const glide = useGlide(box?.of ?? null);

    useLayoutEffect(() => {
        const card = ref.current;
        if (!card || typing) return;
        placeCard(card, box, dockLeft, pillBottom);
        const onResize = (): void => placeCard(card, box, dockLeft, pillBottom);
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
            data-glide={glide ? "true" : undefined}
            className={cn(
                "merchant-guide-card fixed grid w-[min(360px,calc(100vw-32px))] gap-3 rounded-2xl bg-neutral-900 p-4 text-white shadow-[0_18px_40px_-16px_rgba(0,0,0,0.6)]",
                raised ? "z-[63]" : "z-[46]",
                // Out of the keyboard's way while the merchant types on a phone.
                typing && "hidden",
            )}
        >
            <div className="flex items-center justify-between gap-2 text-xs text-neutral-400">
                <span dir={dir} className="inline-flex flex-wrap items-center gap-x-2">
                    {heading}
                    {done && (
                        <span data-testid="merchant-guide-step-done" className="inline-flex items-center gap-1 font-semibold text-[#EFFF00]">
                            <Check className="h-3.5 w-3.5" aria-hidden="true" />
                            {t("guide.stepDone")}
                        </span>
                    )}
                </span>
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
                {onBack !== undefined && (
                    <button
                        type="button"
                        onClick={onBack ?? undefined}
                        disabled={onBack === null}
                        aria-label={t("guide.back")}
                        title={t("guide.back")}
                        data-testid="merchant-guide-back"
                        className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/20 hover:bg-white/10 disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#EFFF00]"
                    >
                        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                    </button>
                )}
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
                            onClick={part.onNext}
                            disabled={part.index >= part.count - 1}
                            data-testid="merchant-guide-next"
                            className="inline-flex h-9 items-center gap-1 rounded-full bg-[#EFFF00] px-4 text-sm font-bold text-neutral-900 hover:opacity-90 disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                        >
                            {t("guide.next")}
                            <ChevronRight className="h-4 w-4" aria-hidden="true" />
                        </button>
                        <span className="text-xs tabular-nums text-neutral-500">
                            {part.index + 1}/{part.count}
                        </span>
                    </>
                ) : later ? (
                    <button
                        type="button"
                        onClick={later.onClick}
                        data-testid="merchant-guide-later"
                        className="inline-flex h-9 items-center rounded-full border border-white/20 px-4 text-sm hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#EFFF00]"
                    >
                        <span dir={dir}>{later.label}</span>
                    </button>
                ) : (
                    <span dir={dir} className="text-xs text-neutral-500">
                        {t(waitingFor === "click" ? "guide.route.waiting" : "guide.waiting")}
                    </span>
                )}
                {onLost && (
                    <button
                        type="button"
                        onClick={onLost}
                        data-testid="merchant-guide-lost"
                        className="ml-auto text-xs text-neutral-400 underline-offset-2 hover:text-white hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#EFFF00]"
                    >
                        <span dir={dir}>{t("guide.route.lost")}</span>
                    </button>
                )}
            </div>
        </div>
    );
}
