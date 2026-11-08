"use client";

// Speaks one guide line and lights its caption word by word.
//
// With a recorded clip (and the voice on), the words follow the clip's
// playhead. Without one (not recorded yet, voice off, English, or the
// browser refused to play before the merchant touched the page), the words
// light at a steady reading pace, so the caption works the same either way.

import { useCallback, useEffect, useState } from "react";
import {
    RECORDED_LINES,
    guideVoiceSrc,
    type GuideLineId,
    type GuideLocale,
} from "@/lib/merchant-guide/script";

/** Reading pace for captions without a clip. */
const MS_PER_WORD = 230;
const START_DELAY_MS = 300;

export interface GuideVoice {
    words: string[];
    lit: number;
    speaking: boolean;
    replay: () => void;
}

function prefersReducedMotion(): boolean {
    return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function useGuideVoice(
    line: GuideLineId,
    text: string,
    locale: GuideLocale,
    soundOn: boolean,
): GuideVoice {
    const words = text.split(/\s+/).filter(Boolean);
    const total = words.length;
    const [lit, setLit] = useState(0);
    const [speaking, setSpeaking] = useState(false);
    const [take, setTake] = useState(0);

    useEffect(() => {
        let cancelled = false;
        let timer: ReturnType<typeof setInterval> | undefined;
        let audio: HTMLAudioElement | undefined;

        const show = (n: number): void => {
            if (!cancelled) setLit(Math.min(total, n));
        };
        const finish = (): void => {
            if (cancelled) return;
            setLit(total);
            setSpeaking(false);
        };
        const readAlong = (): void => {
            let n = 0;
            setSpeaking(true);
            timer = setInterval(() => {
                n += 1;
                show(n);
                if (n >= total) {
                    if (timer) clearInterval(timer);
                    finish();
                }
            }, MS_PER_WORD);
        };

        const start = setTimeout(() => {
            if (cancelled) return;
            if (prefersReducedMotion()) {
                finish();
                return;
            }
            show(0);
            const hasClip = soundOn && locale === "ar" && RECORDED_LINES.has(line);
            if (!hasClip) {
                readAlong();
                return;
            }
            audio = new Audio(guideVoiceSrc(line));
            audio.addEventListener("timeupdate", () => {
                if (audio && audio.duration > 0) show(Math.ceil((audio.currentTime / audio.duration) * total));
            });
            audio.addEventListener("ended", finish);
            setSpeaking(true);
            // A browser blocks sound until the person has touched the page;
            // the caption then reads along on its own instead.
            audio.play().catch(() => {
                if (!cancelled) readAlong();
            });
        }, START_DELAY_MS);

        return () => {
            cancelled = true;
            clearTimeout(start);
            if (timer) clearInterval(timer);
            if (audio) {
                audio.pause();
                audio.src = "";
            }
        };
    }, [line, total, locale, soundOn, take]);

    const replay = useCallback(() => setTake((n) => n + 1), []);
    return { words, lit, speaking, replay };
}
