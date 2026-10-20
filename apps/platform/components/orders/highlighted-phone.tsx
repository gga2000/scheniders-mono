"use client";

import React from "react";
import { formatPhoneGrouped } from "@/lib/order-utils";

interface HighlightedPhoneProps {
    phone: string | null | undefined;
    query: string;
    className?: string;
}

/**
 * Phone rendered in 4-3-4 groups ("0780 123 4567") with the search query still
 * highlighted. The query is matched against the digits only, then mapped back onto
 * the spaced string, so a search for "07801234567" still lights up the grouped text.
 */
export function HighlightedPhone({ phone, query, className }: HighlightedPhoneProps) {
    const formatted = formatPhoneGrouped(phone);
    if (!formatted) return null;

    const queryDigits = (query || "").replace(/\D/g, "");
    const plain = <span className={className} dir="ltr">{formatted}</span>;
    if (!queryDigits) return plain;

    // Map each digit's position in `formatted` so a digit-space match can be re-anchored.
    const positions: number[] = [];
    let digits = "";
    for (let i = 0; i < formatted.length; i++) {
        const char = formatted[i];
        if (char >= "0" && char <= "9") {
            positions.push(i);
            digits += char;
        }
    }

    // The stored number and the query may disagree on the leading zero (see normalizePhoneForSearch).
    const needle = digits.includes(queryDigits) ? queryDigits : queryDigits.replace(/^0+/, "");
    const matchStart = needle ? digits.indexOf(needle) : -1;
    if (matchStart === -1) return plain;

    const from = positions[matchStart];
    const to = positions[matchStart + needle.length - 1] + 1;

    return (
        <span className={className} dir="ltr">
            {formatted.slice(0, from)}
            <mark className="bg-yellow-200 text-yellow-900 dark:bg-yellow-500/30 dark:text-yellow-200">
                {formatted.slice(from, to)}
            </mark>
            {formatted.slice(to)}
        </span>
    );
}
