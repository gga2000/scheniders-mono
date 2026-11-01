"use client";

import { useEffect, useRef } from "react";
import { useReducedMotion } from "framer-motion";
import { easeOutCubic } from "./chart-geometry";

const defaultFormat = (n: number) => Math.round(n).toLocaleString("en-US");

interface CountUpProps {
    value: number;
    format?: (n: number) => string;
    durationMs?: number;
}

/**
 * A number that counts from where it was to `value`. Writes text straight to the
 * DOM each frame, so a count-up never re-renders the card it sits in. The first
 * paint already shows the final value for crawlers and reduced-motion users.
 */
export function CountUp({ value, format = defaultFormat, durationMs = 1100 }: CountUpProps) {
    const ref = useRef<HTMLSpanElement>(null);
    const from = useRef<number | null>(null);
    const reduce = useReducedMotion();

    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const start = from.current ?? 0;
        if (reduce || start === value) {
            el.textContent = format(value);
            from.current = value;
            return;
        }
        const t0 = performance.now();
        let raf = 0;
        const step = (now: number) => {
            const t = Math.min(1, (now - t0) / durationMs);
            const v = start + (value - start) * easeOutCubic(t);
            el.textContent = format(v);
            from.current = v;
            if (t < 1) raf = requestAnimationFrame(step);
        };
        raf = requestAnimationFrame(step);
        return () => cancelAnimationFrame(raf);
    }, [value, format, durationMs, reduce]);

    return <span ref={ref}>{format(value)}</span>;
}
