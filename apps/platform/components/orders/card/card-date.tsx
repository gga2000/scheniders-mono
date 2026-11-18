"use client";

import { useTextDir } from "@/hooks/use-language";
import { formatBaghdadShortDate } from "@/lib/customer-format";

/**
 * The day an order arrived, on its card: the month by name («18 تشرين الثاني»),
 * as the order window and the Prime line write it (Ali, 2026-11-19). Kept on
 * one line, and in an isolate so the day reads first in Arabic.
 */
export function CardDate({ iso, language }: { iso: string; language: "ar" | "en" }) {
    const dir = useTextDir();
    return (
        <span className="font-semibold text-muted whitespace-nowrap" data-card-date>
            <bdi dir={dir}>{formatBaghdadShortDate(iso, language)}</bdi>
        </span>
    );
}
