"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import NumberFlow, { type Format } from "@number-flow/react";

/** Milliseconds a ticker waits before its first roll; a parent sets it to stagger a row of figures. */
export const NumberTickerDelay = createContext(0);

/** A slow start and a long, soft landing: the roll settles instead of stopping. */
const EASE_OUT = "cubic-bezier(0.16, 1, 0.3, 1)";
const SPIN = { duration: 1400, easing: EASE_OUT };
const TRANSFORM = { duration: 900, easing: EASE_OUT };
const OPACITY = { duration: 450, easing: "ease-out" };

/**
 * Where the first roll starts: about a third of the value, kept to the same number of digits so every digit spins
 * (a jump from 0 would only grow digits in). Small whole counts start from 0.
 */
export function rollStart(value: number): number {
    if (value <= 0) return 0;
    if (value < 10) return 0;
    const magnitude = 10 ** Math.floor(Math.log10(value));
    const start = value * 0.35;
    const floored = start < magnitude ? magnitude : start;
    return Number.isInteger(value) ? Math.round(floored) : Math.round(floored * 100) / 100;
}

interface NumberTickerProps {
    value: number;
    /** Intl.NumberFormat options: currency, percent, decimals. Locale is always en-US (LTR digits). */
    format?: Format;
    className?: string;
}

/**
 * A number that rolls digit by digit (NumberFlow). It mounts below its value and, after the delay set by
 * NumberTickerDelay, counts up to it; later changes roll straight to the new value. Reduced-motion users get the
 * final number with no roll (NumberFlow's own preference check).
 */
export function NumberTicker({ value, format, className }: NumberTickerProps) {
    const delay = useContext(NumberTickerDelay);
    const [shown, setShown] = useState(() => rollStart(value));
    const landed = useRef(false);
    useEffect(() => {
        if (landed.current) {
            setShown(value);
            return;
        }
        const id = window.setTimeout(() => {
            landed.current = true;
            setShown(value);
        }, delay);
        return () => window.clearTimeout(id);
    }, [value, delay]);
    return (
        <NumberFlow
            value={shown}
            locales="en-US"
            format={format}
            className={className}
            spinTiming={SPIN}
            transformTiming={TRANSFORM}
            opacityTiming={OPACITY}
            willChange
        />
    );
}
