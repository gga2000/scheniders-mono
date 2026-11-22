"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";

interface InfoTipProps {
    /** The explanation, shown on hover or tap. */
    text: string;
    textDir: "rtl" | "ltr";
    /** Which edge of the icon the panel lines up with: "start" grows right, "end" grows left (for icons near a card's right edge). */
    align?: "start" | "end";
    className?: string;
    testId?: string;
}

/**
 * A small info icon that holds a sentence the page does not need to show up front:
 * the card keeps its number and a short name, and the why sits one hover or tap away.
 * The sentence stays in the page (hidden until opened), so it is still read out and searchable.
 */
export function InfoTip({ text, textDir, align = "start", className, testId }: InfoTipProps) {
    const { t } = useLanguage();
    const [pinned, setPinned] = useState(false);
    const [hover, setHover] = useState(false);
    const open = pinned || hover;
    const box = useRef<HTMLSpanElement>(null);
    const panelId = useId();

    // A tap pins it open; a tap anywhere else closes it.
    useEffect(() => {
        if (!pinned) return;
        const close = (event: PointerEvent) => {
            if (box.current && !box.current.contains(event.target as Node)) setPinned(false);
        };
        document.addEventListener("pointerdown", close);
        return () => document.removeEventListener("pointerdown", close);
    }, [pinned]);

    return (
        <span
            ref={box}
            className={cn("relative inline-flex align-middle", className)}
            onMouseEnter={() => setHover(true)}
            onMouseLeave={() => setHover(false)}
        >
            <button
                type="button"
                className="inline-flex size-5 items-center justify-center rounded-full text-muted transition-colors hover:text-foreground"
                aria-label={t("fin.info")}
                aria-expanded={open}
                aria-describedby={panelId}
                onClick={() => setPinned((was) => !was)}
                data-testid={testId}
            >
                <Info className="size-3.5" aria-hidden="true" />
            </button>
            <span
                id={panelId}
                role="tooltip"
                hidden={!open}
                className={cn(
                    "absolute top-full z-30 mt-1.5 block w-[280px] rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] p-3 text-left text-[12.5px] font-normal leading-relaxed text-foreground shadow-lg",
                    align === "start" ? "left-0" : "right-0",
                )}
                dir={textDir}
            >
                {text}
            </span>
        </span>
    );
}
