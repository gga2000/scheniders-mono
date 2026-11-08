"use client";

import { useTextDir } from "@/hooks/use-language";
import { cn } from "@/lib/utils";
import type { GuideVoice } from "./use-guide-voice";

/** The spoken line, written out, its words lighting as they are said. */
export function GuideCaption({ voice, className }: { voice: GuideVoice; className?: string }) {
    const dir = useTextDir();
    return (
        <p dir={dir} className={cn("text-left leading-relaxed", className)}>
            {voice.words.map((word, i) => (
                <span key={`${i}-${word}`} className="merchant-guide-word" data-lit={i < voice.lit}>
                    {word}
                    {i < voice.words.length - 1 ? " " : ""}
                </span>
            ))}
        </p>
    );
}
