"use client";

import { useCallback, useRef } from "react";
import { Mic, Square } from "lucide-react";
import { useLanguage } from "@/components/providers/language-provider";
import { toast } from "@/hooks/use-toast";
import { useSpeechToText } from "@/hooks/use-speech-to-text";
import { appendSpoken, heardText, SPEECH_LANG, type HeardPiece, type SpeechFailure } from "@/lib/voice/speech-text";
import { cn } from "@/lib/utils";

const FAILURE_KEY: Record<SpeechFailure, string> = {
    blocked: "voice.blocked",
    "no-mic": "voice.noMic",
    "no-speech": "voice.noSpeech",
    offline: "voice.offline",
    failed: "voice.failed",
};

/**
 * The small mic at the edge of a text box. Press, talk, and the words are
 * written into the box while you talk, after whatever is already typed.
 * Hidden where the browser has no speech service (Firefox).
 *
 * Place it inside a `relative` wrapper next to the box, and give the box
 * end padding (`pr-10`) so text never runs under it.
 */
export function VoiceMicButton({ value, onValueChange, maxLength, disabled = false, className }: {
    value: string;
    onValueChange: (value: string) => void;
    maxLength?: number;
    disabled?: boolean;
    className?: string;
}) {
    const { t, language } = useLanguage();
    // What was in the box when the merchant pressed the mic.
    const typedRef = useRef(value);

    const onHeard = useCallback(
        (pieces: HeardPiece[]) => onValueChange(appendSpoken(typedRef.current, heardText(pieces), maxLength)),
        [onValueChange, maxLength],
    );
    const onFailure = useCallback((failure: SpeechFailure) => toast.error(t(FAILURE_KEY[failure])), [t]);

    const { supported, listening, start, stop } = useSpeechToText({ lang: SPEECH_LANG[language], onHeard, onFailure });

    if (!supported) return null;

    const label = listening ? t("voice.stop") : t("voice.start");
    return (
        <button
            type="button"
            onClick={() => {
                if (listening) {
                    stop();
                    return;
                }
                typedRef.current = value;
                start();
            }}
            disabled={disabled}
            aria-label={label}
            aria-pressed={listening}
            title={label}
            className={cn(
                "absolute z-[1] flex h-7 w-7 items-center justify-center rounded-lg transition-colors",
                "disabled:cursor-not-allowed disabled:opacity-40",
                listening
                    ? "bg-red-600 text-white shadow-[0_0_0_4px_rgba(220,38,38,0.15)] motion-safe:animate-pulse"
                    : "text-muted hover:bg-foreground/5 hover:text-foreground",
                className,
            )}
        >
            {listening ? <Square className="h-3 w-3 fill-current" /> : <Mic className="h-4 w-4" />}
        </button>
    );
}
