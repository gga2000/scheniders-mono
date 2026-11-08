"use client";

import { Check } from "lucide-react";
import { useTextDir } from "@/hooks/use-language";
import { lineText, type GuideLineId, type GuideLocale } from "@/lib/merchant-guide/script";
import { GuideCaption } from "./guide-caption";
import { GuideSoundButton } from "./guide-sound-button";
import { useGuideVoice } from "./use-guide-voice";

/** A small card docked beside the pill: an offer, a finish or an end note, with one or two buttons. */
export function GuideNote({
    line,
    title,
    body,
    locale,
    soundOn,
    onToggleSound,
    pillLeft,
    primary,
    secondary,
    testId = "merchant-guide-first-order",
}: {
    line: GuideLineId;
    title: string;
    body?: string;
    locale: GuideLocale;
    soundOn: boolean;
    onToggleSound: () => void;
    pillLeft: number;
    primary: { label: string; onClick: () => void; busy?: boolean };
    secondary?: { label: string; onClick: () => void };
    testId?: string;
}) {
    const dir = useTextDir();
    const voice = useGuideVoice(line, lineText(line, locale), locale, soundOn);
    return (
        <div
            role="dialog"
            aria-label={title}
            data-testid={testId}
            style={{ left: pillLeft }}
            className="merchant-guide-card fixed bottom-6 z-[46] grid w-[min(380px,calc(100vw-32px))] gap-3 rounded-2xl bg-neutral-900 p-4 text-white shadow-[0_18px_40px_-16px_rgba(0,0,0,0.6)]"
        >
            <div className="flex items-center justify-between gap-2">
                <span dir={dir} className="inline-flex items-center gap-2 text-sm font-bold">
                    <span className="grid h-7 w-7 place-items-center rounded-full bg-[#EFFF00] text-neutral-900">
                        <Check className="h-4 w-4" aria-hidden="true" />
                    </span>
                    {title}
                </span>
                <GuideSoundButton soundOn={soundOn} speaking={voice.speaking} onToggle={onToggleSound} />
            </div>
            <GuideCaption voice={voice} className="text-[15px] font-semibold" />
            {body && (
                <p dir={dir} className="text-xs leading-relaxed text-neutral-400">
                    {body}
                </p>
            )}
            <div className="flex flex-wrap items-center gap-2">
                <button
                    type="button"
                    onClick={primary.onClick}
                    disabled={primary.busy}
                    data-testid={`${testId}-go`}
                    className="inline-flex h-9 items-center rounded-full bg-[#EFFF00] px-5 text-sm font-bold text-neutral-900 hover:opacity-90 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                >
                    {primary.label}
                </button>
                {secondary && (
                    <button
                        type="button"
                        onClick={secondary.onClick}
                        className="inline-flex h-9 items-center rounded-full border border-white/20 px-4 text-sm text-neutral-200 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#EFFF00]"
                    >
                        {secondary.label}
                    </button>
                )}
            </div>
        </div>
    );
}
