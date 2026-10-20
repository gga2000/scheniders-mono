import { Order } from "@/lib/supabase";
import { extractGovernorate } from "@/lib/address-validator";
import { mergeOrderItems } from "@/lib/merge-order-items";
import type { Locale } from "@/lib/i18n";
import { addDaysToDayKey, baghdadDayKey, baghdadDayStart, toBaghdadDayKey } from "@/lib/order-window";

/**
 * Merchant-facing dates and times are Baghdad's, not the viewer's.
 *
 * I18N-5. `formatShortDate` produced month/day, the American order, which reads
 * as the wrong date entirely in Iraq: 9/3 is the 9th of March here, not the 3rd
 * of September. Neither formatter pinned a time zone either, so both rendered in
 * whatever zone the browser happened to be in — a merchant travelling, or a
 * server render, could show a different calendar day from the one the order
 * actually belongs to. Revenue is now bucketed on Baghdad days (see
 * lib/order-revenue), and what is displayed has to agree with it.
 */
const BAGHDAD_TIME_ZONE = "Asia/Baghdad";

const baghdadDayMonth = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "numeric",
    timeZone: BAGHDAD_TIME_ZONE,
});

// `hourCycle`, not `hour12`. Asking for `hour12: true` on `en-GB` lets ICU
// pick the cycle, and it picks h11 — where midnight is hour 0 — so 00:30 UTC+3
// renders as the nonsense "00:30 am" instead of "12:30 am". Which cycle a
// runtime picks varies by ICU version, so the same order read differently on a
// developer's machine, the CI runner and the server. `h12` pins 1-12 with
// midnight and noon as 12 everywhere. Note the two options cannot be combined:
// per spec `hour12` overrides `hourCycle`, so it has to be gone, not adjusted.
const baghdadTime = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h12" as const,
    timeZone: BAGHDAD_TIME_ZONE,
});

export const formatShortDate = (dateStr: string | Date | undefined | null) => {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return "";
    // en-GB gives day/month, which is how Iraq writes it.
    return baghdadDayMonth.format(date);
};

export const formatTime = (dateStr: string | Date | undefined | null) => {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return "";
    return baghdadTime.format(date).replace(/\s/g, "");
};

/**
 * How long ago an order arrived, in the reader's language.
 *
 * I18N-5: the four strings here were hardcoded English — "5m ago" on an
 * otherwise-Arabic card, for every merchant, since Arabic is the default
 * locale. `Intl.RelativeTimeFormat` in narrow style produces exactly the same
 * English text ("5m ago", "3h ago", "1d ago", "12d ago"), so nothing changes
 * for an English reader; an Arabic one now reads Arabic.
 *
 * Locale defaults to "ar" to match the app default. Components should pass the
 * active one.
 */
const relativeTimeFormatters: Record<Locale, Intl.RelativeTimeFormat> = {
    en: new Intl.RelativeTimeFormat("en", { numeric: "always", style: "narrow" }),
    // Latin digits, to match formatIQD and the order numbers beside it.
    ar: new Intl.RelativeTimeFormat("ar-u-nu-latn", { numeric: "always", style: "narrow" }),
};

export const getOrderAge = (
    dateStr: string | Date | undefined | null,
    locale: Locale = "ar",
) => {
    if (!dateStr) return "";
    const now = new Date();
    const orderDate = new Date(dateStr);
    if (isNaN(orderDate.getTime())) return "";
    const diffMs = now.getTime() - orderDate.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    const format = relativeTimeFormatters[locale] ?? relativeTimeFormatters.ar;
    if (diffMins < 60) return format.format(-diffMins, "minute");
    if (diffHours < 24) return format.format(-diffHours, "hour");
    return format.format(-diffDays, "day");
};

/**
 * A full order timestamp: day, month, year and time, in Baghdad.
 *
 * I18N-5: the order detail modal rendered this with `en-US` and 2-digit month
 * and day, i.e. MM/DD/YYYY — so an order placed on 3 September read as 09/03,
 * which in Iraq is 9 March. It also pinned no time zone, so the calendar day
 * could disagree with the Baghdad day the order is bucketed into everywhere
 * else.
 */
const baghdadDateTime = new Intl.DateTimeFormat("en-GB", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h12" as const,
    timeZone: BAGHDAD_TIME_ZONE,
});

const baghdadDayMonthTime = new Intl.DateTimeFormat("en-GB", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h12" as const,
    timeZone: BAGHDAD_TIME_ZONE,
});

/** Day, month, year and time — day first, Baghdad. */
export const formatOrderDateTime = (dateStr: string | Date | undefined | null) => {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return "";
    return baghdadDateTime.format(date);
};

/** Day, month and time, no year — day first, Baghdad. */
export const formatOrderDayMonthTime = (dateStr: string | Date | undefined | null) => {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return "";
    return baghdadDayMonthTime.format(date);
};

/**
 * A named-month date for reports: "9 Sep 2026", in Baghdad.
 *
 * The month name is unambiguous, but the reports pinned no time zone, so an
 * order placed late in the Baghdad evening could be reported on the previous
 * day when the report was generated from a machine west of Baghdad.
 */
const baghdadNamedDate = new Intl.DateTimeFormat("en-GB", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: BAGHDAD_TIME_ZONE,
});

const baghdadNamedDayMonth = new Intl.DateTimeFormat("en-GB", {
    month: "short",
    day: "numeric",
    timeZone: BAGHDAD_TIME_ZONE,
});

export const formatOrderNamedDate = (dateStr: string | Date | undefined | null) => {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return "";
    return baghdadNamedDate.format(date);
};

export const formatOrderNamedDayMonth = (dateStr: string | Date | undefined | null) => {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return "";
    return baghdadNamedDayMonth.format(date);
};

// =============================================
// SCHEDULING (postpone to a day)
// =============================================
//
// `created_at` is when the order arrived — a fact, guarded in the database
// against future values. `scheduled_date` (a date-only column) is the day the
// merchant intends to work it. Every comparison below is on Baghdad calendar
// days as "YYYY-MM-DD" strings, the same days the date filter and the fetch
// window use, so no device time zone can move an order to a neighbouring day.

export type ScheduledState = "future" | "due";

/**
 * Where an order sits relative to the day it was scheduled for:
 * `future` = parked for a later day, `due` = its day has arrived or passed,
 * `null` = never scheduled (or an unusable value).
 */
export const getScheduledState = (
    scheduledDate: string | null | undefined,
    now: number = Date.now(),
): ScheduledState | null => {
    const key = toBaghdadDayKey(scheduledDate);
    if (!key) return null;
    return key > baghdadDayKey(now) ? "future" : "due";
};

/** True when the order is scheduled for the current Baghdad day. */
export const isScheduledToday = (scheduledDate: string | null | undefined, now: number = Date.now()) => {
    const key = toBaghdadDayKey(scheduledDate);
    return key !== null && key === baghdadDayKey(now);
};

/** Statuses where the order is finished and is no longer anyone's queue. */
const SETTLED_STATUSES = new Set<Order["status"]>([
    "completed",
    "delivered",
    "rejected",
    "cancelled",
    "refund_delivered",
]);

/**
 * An order whose scheduled day has arrived (or passed) and that still needs
 * work — the "due today" queue of orders that were parked and have come round.
 */
export const isScheduleDue = (
    status: Order["status"],
    scheduledDate: string | null | undefined,
    now: number = Date.now(),
) => getScheduledState(scheduledDate, now) === "due" && !SETTLED_STATUSES.has(status);

/**
 * The day key `days` calendar days after today in Baghdad — what the
 * "Tomorrow" / "In 3 days" shortcuts write to `scheduled_date`.
 */
export const scheduleDayFromToday = (days: number, now: number = Date.now()) =>
    addDaysToDayKey(baghdadDayKey(now), days);

// The day key is already a calendar day; format it in UTC so the label cannot
// shift to the neighbouring day in any viewer's zone.
const scheduledDayLabel = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

/** "8 Sept" — the label for the scheduled-date badge. */
export const formatScheduledDate = (scheduledDate: string | null | undefined) => {
    const key = toBaghdadDayKey(scheduledDate);
    if (!key) return "";
    return scheduledDayLabel.format(new Date(`${key}T00:00:00.000Z`));
};

/**
 * Colour band for the age badge.
 *
 * An order parked for a future day is `scheduled`, not overdue — nobody is
 * late on it. Once its day arrives the clock starts from that day rather than
 * from placement, so a postponed order is not stale the moment it becomes
 * actionable.
 */
export const getAgeUrgency = (
    status: Order["status"],
    dateStr: string | Date | undefined | null,
    scheduledDate?: string | null,
) => {
    if (status === "delivered" || status === "rejected") return "none";
    if (!dateStr) return "none";

    const now = Date.now();
    const orderDate = new Date(dateStr);
    if (isNaN(orderDate.getTime())) return "none";

    const scheduled = getScheduledState(scheduledDate, now);
    if (scheduled === "future") return "scheduled";

    let clockStart = orderDate.getTime();
    const scheduledKey = scheduled === "due" ? toBaghdadDayKey(scheduledDate) : null;
    if (scheduledKey) clockStart = Math.max(clockStart, baghdadDayStart(scheduledKey));

    const diffHours = (now - clockStart) / 3600000;

    if (diffHours < 2) return "fresh";      // Green - just arrived
    if (diffHours < 4) return "normal";     // Default - normal processing
    if (diffHours < 8) return "attention";  // Yellow - needs attention
    if (diffHours < 24) return "urgent";    // Orange - getting old
    return "stale";                         // Red - very old
};

/**
 * Card-ready item lines. Lines stored once per unit (historical LightFunnels
 * orders) are collapsed into one line with the summed quantity — see
 * merge-order-items.ts.
 */
export const getItemsDisplay = (items: Array<{ name: string; quantity: number; image_url?: string; tag_color?: string | null; is_open_box?: boolean; is_ai_extracted?: boolean }>) => {
    if (!items || items.length === 0) return [];
    return mergeOrderItems(items).map(item => ({
        name: item.name,
        quantity: item.quantity,
        image_url: item.image_url,
        tag_color: item.tag_color,
        is_open_box: item.is_open_box,
        is_ai_extracted: item.is_ai_extracted,
    }));
};

export const getFullAddress = (city?: string | null, addressDetails?: string | null) => {
    const parts = [];
    if (city) parts.push(city);
    if (addressDetails && addressDetails.trim().length > 0) {
        parts.push(addressDetails);
    }
    return parts.join(' • ');
};

export const cleanSystemNotes = (text?: string | null) => {
    if (!text) return '';
    return text
        .replace(/\[Partial Return\] Items split to return order\.?/g, '')
        .replace(/\[Partial Return\] Items returned from original order\.?/g, '')
        .replace(/Split from order (LF-\d+-\d+|\d+|(?:RTN|CLN-LF)-\d+(?:-\d+)?)/gi, '')
        .replace(/استرجاع:.*?(\||$)/g, '')
        .replace(/خصم التوصيل:.*?(\||$)/g, '')
        .replace(/الطلب الأصلي:.*?(\||$)/g, '')
        .replace(/\|/g, '') // Remove any remaining pipes
        .replace(/\s{2,}/g, ' ') // Collapse multiple spaces
        .replace(/^\s+|\s+$/g, '') // Trim
        .trim();
};

export const getActualNotes = (notes?: string | null) => {
    return cleanSystemNotes(notes);
};

export const getOrderReasonInfo = (order: Partial<Order>, isReturn: boolean = false) => {
    const hasReason = order.rejection_reason;
    const isRejected = order.status === 'rejected';
    const isCancelled = order.status === 'cancelled';
    const isNoResponse = order.status === 'no_response';

    // Determine delivery deduction for return orders
    let deliveryDeduction = 0;
    if (isReturn) {
        deliveryDeduction = order.delivery_fee || 0;
    }

    // 1. Use structured rejection_reason field if available
    if (hasReason) {
        return {
            reason: order.rejection_reason!,
            deliveryDeduction,
            type: isReturn ? 'return' as const
                : isRejected ? 'rejected' as const
                    : isCancelled ? 'cancelled' as const
                        : isNoResponse ? 'no_response' as const
                            : 'other' as const,
        };
    }

    // 2. Fallback for return orders: Parse from legacy notes string
    if (isReturn) {
        const notesStr = order.notes || "";
        const reasonMatch = notesStr.match(/استرجاع:\s*([^|]+)/);
        const deliveryMatch = notesStr.match(/خصم التوصيل:\s*([\d,]+)/);

        if (reasonMatch || deliveryMatch) {
            return {
                reason: reasonMatch ? reasonMatch[1].trim() : null,
                deliveryDeduction: deliveryMatch ? parseInt(deliveryMatch[1].replace(/,/g, "")) : deliveryDeduction,
                type: 'return' as const,
            };
        }
    }

    // 3. No reason found
    if (isReturn && deliveryDeduction > 0) {
        return { reason: null, deliveryDeduction, type: 'return' as const };
    }

    return null;
};

export const getGovernorateCode = (order: Partial<Order>) => {
    if (order.validated_governorate_code) return order.validated_governorate_code;
    if (order.governorate_code) return order.governorate_code;

    if (order.city) {
        const { governorate } = extractGovernorate(order.city, undefined, order.address_details || undefined);
        return governorate?.code || '';
    }
    return '';
};

export const getStatusColor = (status: Order["status"], isReturn: boolean = false) => {
    if (isReturn || status === 'rejected') return "bg-red-400 dark:bg-[#FF3333]"; // Neon Red
    switch (status) {
        case "new": return "bg-orange-300 dark:bg-[#FF6A00]"; // Neon Orange
        case "contacted": return "bg-[var(--pastel-yellow)] dark:bg-[#EFFF00]"; // App Primary Neon Green/Yellow
        case "confirmed": return "bg-[var(--pastel-green)] dark:bg-[#39FF14]"; // Neon Green
        case "in_transit": return "bg-blue-200 dark:bg-[#00FFAA]"; // Neon Teal/Blue
        case "delivered": return "bg-[var(--pastel-mint)] dark:bg-[#00E5FF]"; // Neon Cyan
        case "no_response": return "bg-slate-200 dark:bg-[#B800FF]"; // Neon Purple
        case "return_pending": return "bg-rose-400 dark:bg-[#FF007F]"; // Neon Pink
        case "cancelled": return "bg-red-300 dark:bg-[#FF3333]"; // Neon Red
        case "pending_checkout": return "bg-[#E2725B] dark:bg-[#FF8C69]"; // Deep Terracotta
        default: return "bg-[var(--card-border)] dark:bg-[#555555]";
    }
};

export const getStatusBadgeStyle = (status: Order["status"]) => {
    switch (status) {
        case "new": return "bg-orange-200 text-orange-900";
        case "contacted": return "bg-[var(--pastel-yellow)] text-amber-900";
        case "confirmed": return "bg-[var(--pastel-green)] text-green-900";
        case "cancelled": return "bg-red-200 text-red-900";
        case "in_transit": return "bg-blue-200 text-blue-900";
        case "delivered": return "bg-[var(--pastel-mint)] text-teal-900";
        case "rejected": return "bg-rose-100 text-rose-700 border border-rose-200";
        case "completed": return "bg-emerald-200 text-emerald-900 ring-2 ring-emerald-400/50 shadow-[0_0_10px_rgba(16,185,129,0.3)]";
        case "no_response": return "bg-slate-200 text-slate-600";
        case "return_pending": return "bg-rose-200 text-rose-900 ring-2 ring-rose-400/50";
        // Abandoned checkout — uses unique terracotta theme to distinguish from other statuses
        case "pending_checkout": return "bg-[#FFEBEE] text-[#D84315] dark:bg-[#D84315]/25 dark:text-[#FFAB91]";
        default: return "bg-gray-100 text-gray-700";
    }
};

export const getDropdownItemStyle = (status: Order["status"]) => {
    switch (status) {
        case "new": return "bg-orange-100 text-orange-900 border border-transparent dark:bg-orange-500/10 dark:text-orange-400 dark:border-orange-500/20 data-[highlighted]:bg-orange-200 dark:data-[highlighted]:bg-orange-500/20";
        case "contacted": return "bg-[var(--pastel-yellow-light)] text-amber-900 border border-transparent dark:bg-[#1E1E1E] dark:text-[#EFFF00] dark:border-[rgba(239,255,0,0.3)] data-[highlighted]:bg-[var(--pastel-yellow)] dark:data-[highlighted]:bg-[rgba(239,255,0,0.1)]";
        case "confirmed": return "bg-[var(--pastel-green-light)] text-green-900 border border-transparent dark:bg-[rgba(0,255,100,0.1)] dark:text-emerald-400 dark:border-[rgba(0,255,100,0.2)] data-[highlighted]:bg-[var(--pastel-green)] dark:data-[highlighted]:bg-[rgba(0,255,100,0.2)]";
        case "cancelled": return "bg-[var(--pastel-pink-light)] text-rose-800 border border-transparent dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20 data-[highlighted]:bg-[var(--pastel-pink)] dark:data-[highlighted]:bg-rose-500/20";
        case "in_transit": return "bg-blue-100 text-blue-900 border border-transparent dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20 data-[highlighted]:bg-blue-200 dark:data-[highlighted]:bg-blue-500/20";
        case "delivered": return "bg-[var(--pastel-mint)] text-teal-900 border border-transparent dark:bg-teal-500/10 dark:text-teal-400 dark:border-teal-500/20 data-[highlighted]:bg-teal-200 dark:data-[highlighted]:bg-teal-500/20";
        case "rejected": return "bg-rose-100 text-rose-800 border border-transparent dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20 data-[highlighted]:bg-rose-200 dark:data-[highlighted]:bg-red-500/20";
        case "completed": return "bg-emerald-100 text-emerald-900 border border-transparent dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20 data-[highlighted]:bg-emerald-200 dark:data-[highlighted]:bg-emerald-500/20";
        case "no_response": return "bg-slate-100 text-slate-700 border border-transparent dark:bg-slate-500/10 dark:text-slate-400 dark:border-slate-500/20 data-[highlighted]:bg-slate-200 dark:data-[highlighted]:bg-slate-500/20";
        case "return_pending": return "bg-rose-100 text-rose-900 border border-transparent dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20 data-[highlighted]:bg-rose-200 dark:data-[highlighted]:bg-rose-500/20";
        case "pending_checkout": return "bg-[#FFF5F2] text-[#B24C3D] border border-[#F4B4A6]/50 dark:bg-[#B24C3D]/10 dark:text-[#FF8C69] dark:border-[#B24C3D]/20 data-[highlighted]:bg-[#F4B4A6] dark:data-[highlighted]:bg-[#B24C3D]/30";
        default: return "bg-gray-100 text-gray-700 border border-transparent dark:bg-gray-500/10 dark:text-gray-400 dark:border-gray-500/20 data-[highlighted]:bg-gray-200 dark:data-[highlighted]:bg-gray-500/20";
    }
};

export const getDisplayOrderId = (orderId: string) => {
    if (!orderId) return "";

    // Check for LF mapping format
    const lfMatch = orderId.match(/LF-(\d+)-\d+$/);
    if (lfMatch) return lfMatch[1];

    // Strip CHK- prefix for abandoned checkouts
    if (orderId.startsWith('CHK-')) {
        return orderId.substring(4);
    }

    return orderId;
};
