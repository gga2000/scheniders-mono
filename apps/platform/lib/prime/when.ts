import { formatShortDate, formatTime } from "@/lib/order-format-utils";
import { addDaysToDayKey, baghdadDayKey, toBaghdadDayKey } from "@/lib/order-window";

type Translate = (key: string, vars?: Record<string, string | number>) => string;

/** A Prime moment as the band and the panel say it, in Baghdad: "Today 10:42am", "Yesterday 4:40pm", "1/11 · 7:30pm". */
export function primeWhen(iso: string, t: Translate, now: number = Date.now()): string {
    const day = toBaghdadDayKey(iso);
    const time = formatTime(iso);
    if (!day || !time) return "";
    const today = baghdadDayKey(now);
    if (day === today) return t("orders.prime.when.today", { time });
    if (day === addDaysToDayKey(today, -1)) return t("orders.prime.when.yesterday", { time });
    return `${formatShortDate(iso)} · ${time}`;
}

/** Prime's reason as one line under the parcel: "Prime: customer not answering", "Prime: travelling · put off to 2026-11-06". */
export function primeReasonText(note: { reason: string | null; until: string | null } | null, t: Translate): string | null {
    if (!note) return null;
    const parts = [note.reason, note.until ? t("orders.prime.postponedUntil", { date: note.until }) : null].filter((p): p is string => p !== null);
    return parts.length > 0 ? t("orders.prime.primeSays", { reason: parts.join(" · ") }) : null;
}
