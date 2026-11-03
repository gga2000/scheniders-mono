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
