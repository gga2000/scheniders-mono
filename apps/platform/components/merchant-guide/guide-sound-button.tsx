"use client";

import { Volume2, VolumeX } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";
import { cn } from "@/lib/utils";

/** Voice on/off, with a small wave that moves while the line is spoken. */
export function GuideSoundButton({
    soundOn,
    speaking,
    onToggle,
    tone = "dark",
}: {
    soundOn: boolean;
    speaking: boolean;
    onToggle: () => void;
    tone?: "dark" | "light";
}) {
    const { t } = useLanguage();
    const label = soundOn ? t("guide.soundOff") : t("guide.soundOn");
    const Icon = soundOn ? Volume2 : VolumeX;
    return (
        <button
            type="button"
            onClick={onToggle}
            aria-label={label}
            aria-pressed={soundOn}
            title={label}
            className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-full border px-2.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#EFFF00]",
                tone === "dark"
                    ? "border-white/20 text-white hover:bg-white/10"
                    : "border-[var(--card-border)] text-foreground hover:bg-[var(--background)]",
            )}
        >
            <Icon className="h-4 w-4" aria-hidden="true" />
            <span className="merchant-guide-wave inline-flex h-3.5 items-center gap-[2px]" data-speaking={speaking} aria-hidden="true">
                <i /><i /><i /><i />
            </span>
        </button>
    );
}
