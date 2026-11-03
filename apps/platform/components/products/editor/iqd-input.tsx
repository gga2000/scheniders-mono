"use client";

import { useState } from "react";
import { formatCount, parseWholeNumber } from "@/lib/utils";

interface IqdInputProps {
    value: number;
    onChange: (value: number) => void;
    className?: string;
    "aria-label"?: string;
}

/**
 * Whole dinars. Reads "95,000" while not being edited and plain digits while
 * typing, so a long price is easy to check at a glance.
 */
export function IqdInput({ value, onChange, className, "aria-label": ariaLabel }: IqdInputProps) {
    const [focused, setFocused] = useState(false);
    const shown = value ? (focused ? String(value) : formatCount(value)) : "";
    return (
        <input
            type="text"
            inputMode="numeric"
            dir="ltr"
            value={shown}
            placeholder="0"
            aria-label={ariaLabel}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onChange={(e) => onChange(parseWholeNumber(e.target.value) ?? 0)}
            className={className}
        />
    );
}
