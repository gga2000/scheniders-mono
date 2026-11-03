"use client";

import { useEffect, useState } from "react";
import NumberFlow, { type Format } from "@number-flow/react";

interface NumberTickerProps {
    value: number;
    /** Intl.NumberFormat options: currency, percent, decimals. Locale is always en-US (LTR digits). */
    format?: Format;
    className?: string;
}

/**
 * A number that rolls digit by digit (NumberFlow). It mounts at zero and rolls up to its value, then rolls between
 * values as they change. Reduced-motion users get the final number with no roll (NumberFlow's own preference check).
 */
export function NumberTicker({ value, format, className }: NumberTickerProps) {
    const [shown, setShown] = useState(0);
    useEffect(() => {
        // One frame at zero so the first paint has something to roll from.
        const id = requestAnimationFrame(() => setShown(value));
        return () => cancelAnimationFrame(id);
    }, [value]);
    return <NumberFlow value={shown} locales="en-US" format={format} className={className} />;
}
