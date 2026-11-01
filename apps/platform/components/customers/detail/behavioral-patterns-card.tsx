"use client";

import { useMemo } from "react";
import {
    BrainCircuit,
    Clock,
    Calendar,
    Repeat,
    PieChart,
    MapPin,
    Phone,
    Sparkles,
} from "lucide-react";
import { useLanguage } from "@/hooks/use-language";
import { cn } from "@/lib/utils";
import { CustomerPlace } from "@/components/customers/customer-place";

type Order = { created_at: string; status: string };

/** Buying patterns need this many orders; below it the card is a one-line snapshot. */
export const PATTERNS_FROM_ORDERS = 3;

interface BehavioralPatternsCardProps {
    orders: Order[];
    city?: string | null;
    governorate?: string | null;
    phone: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function timeBucket(hour: number): "mornings" | "afternoons" | "evenings" | "nights" {
    if (hour >= 6 && hour < 12) return "mornings";
    if (hour >= 12 && hour < 17) return "afternoons";
    if (hour >= 17 && hour < 21) return "evenings";
    return "nights";
}

const DAY_KEYS = [
    "customers.behavioral.daySunday",
    "customers.behavioral.dayMonday",
    "customers.behavioral.dayTuesday",
    "customers.behavioral.dayWednesday",
    "customers.behavioral.dayThursday",
    "customers.behavioral.dayFriday",
    "customers.behavioral.daySaturday",
] as const;

const TIME_KEY: Record<ReturnType<typeof timeBucket>, string> = {
    mornings: "customers.behavioral.timeMornings",
    afternoons: "customers.behavioral.timeAfternoons",
    evenings: "customers.behavioral.timeEvenings",
    nights: "customers.behavioral.timeNights",
};

function modeIndex<T extends string | number>(values: T[]): T | null {
    if (values.length === 0) return null;
    const counts = new Map<T, number>();
    let best: T = values[0];
    let bestCount = 0;
    for (const v of values) {
        const c = (counts.get(v) || 0) + 1;
        counts.set(v, c);
        if (c > bestCount) {
            best = v;
            bestCount = c;
        }
    }
    return best;
}

function median(nums: number[]): number {
    if (nums.length === 0) return 0;
    const sorted = [...nums].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// Iraqi mobile: canonical carrier prefixes are 77/78/79. Accept any of the stored
// formats the app normalizes through: 10-digit (7XXXXXXXXX), 11-digit with leading
// 0 (07XXXXXXXXX), or 13-digit with country code (9647XXXXXXXXX / +9647XXXXXXXXX).
function isValidIraqiMobile(phone: string): boolean {
    const digits = phone.replace(/\D/g, "");
    return /^7[789]\d{8}$/.test(digits) || /^07[789]\d{8}$/.test(digits) || /^9647[789]\d{8}$/.test(digits);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BehavioralPatternsCard({
    orders,
    city,
    governorate,
    phone,
}: BehavioralPatternsCardProps) {
    const { t, language } = useLanguage();

    const mode: "patterns" | "snapshot" = orders.length >= PATTERNS_FROM_ORDERS ? "patterns" : "snapshot";

    // ----- Pattern computations (only meaningful when mode === "patterns") -----
    const patterns = useMemo(() => {
        if (mode !== "patterns") return null;

        const dates = orders.map((o) => new Date(o.created_at));
        const hourBuckets = dates.map((d) => timeBucket(d.getHours()));
        const weekdays = dates.map((d) => d.getDay());

        const preferredTime = modeIndex(hourBuckets);

        const activeDay = modeIndex(weekdays);

        // Cadence — sort dates ascending, compute deltas in days
        const sorted = [...dates].sort((a, b) => a.getTime() - b.getTime());
        const deltas: number[] = [];
        for (let i = 1; i < sorted.length; i++) {
            deltas.push((sorted[i].getTime() - sorted[i - 1].getTime()) / (1000 * 60 * 60 * 24));
        }
        const med = median(deltas);
        const variance =
            deltas.length > 1
                ? deltas.reduce((acc, d) => acc + (d - med) ** 2, 0) / deltas.length
                : 0;
        const stdDev = Math.sqrt(variance);
        let cadenceLabel: string;
        if (deltas.length === 0) {
            cadenceLabel = t("customers.behavioral.cadenceSporadic");
        } else if (med < 1.5) {
            cadenceLabel = t("customers.behavioral.cadenceDaily");
        } else if (stdDev > med * 1.2) {
            cadenceLabel = t("customers.behavioral.cadenceSporadic");
        } else {
            cadenceLabel = t("customers.behavioral.cadenceWeekly", {
                days: Math.round(med).toString(),
            });
        }

        // Status mix: a return came back after delivery, a rejection was refused
        // at the door, no answer is its own outcome; COD decisions need them apart.
        // Only the outcomes that happened are listed.
        const counts = { delivered: 0, returned: 0, rejected: 0, noResponse: 0, cancelled: 0 };
        for (const o of orders) {
            const s = o.status?.toLowerCase();
            if (s === "delivered" || s === "completed") counts.delivered++;
            else if (s === "returned" || s === "refunded" || s === "refund_delivered" || s === "return_pending") counts.returned++;
            else if (s === "rejected") counts.rejected++;
            else if (s === "no_response") counts.noResponse++;
            else if (s === "cancelled" || s === "canceled") counts.cancelled++;
        }
        const total = orders.length || 1;
        // One segment per outcome, never joined into one string: an Arabic segment
        // starts with its number ("93% وصلت"), and a joined line lets the number of
        // the first segment drift away from its word. OutcomeMix isolates each one.
        const statusMix = (Object.keys(counts) as (keyof typeof counts)[])
            .filter((k) => k === "delivered" || counts[k] > 0)
            .map((k) => ({ key: k, label: t(`customers.behavioral.mix.${k}`, { pct: Math.round((counts[k] / total) * 100).toString() }) }));

        return {
            // Refusals at the door are the one pattern worth colour: the outcomes tile turns rose.
            hasRefusals: counts.rejected + counts.noResponse > 0,
            timeLabel: preferredTime ? t(TIME_KEY[preferredTime]) : null,
            dayLabel: activeDay !== null ? t(DAY_KEYS[activeDay]) : null,
            cadenceLabel,
            statusMix,
        };
    }, [mode, orders, t]);

    // ----- Snapshot computations -----
    const snapshot = useMemo(() => {
        if (mode !== "snapshot") return null;

        // The same place line as the hero and the drawer: governorate, then the neighbourhood.
        const locationLabel = city || governorate
            ? <CustomerPlace governorate={governorate} city={city} locale={language} />
            : t("customers.snapshot.locationUnknown");

        const phoneValid = isValidIraqiMobile(phone);

        return { locationLabel, phoneValid };
    }, [mode, city, governorate, phone, t, language]);

    // Too few orders for patterns: one line, like the Ratings and Link strips. Linked
    // customers are the Link strip's to show, so the snapshot does not repeat them.
    if (snapshot) {
        return (
            <div className="bg-(--card-bg) rounded-2xl border border-(--card-border) px-5 min-h-14 py-2 flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
                <Sparkles className="w-4 h-4 text-foreground shrink-0" />
                <span className="font-semibold text-sm text-foreground whitespace-nowrap">{t("customers.snapshot.title")}</span>
                <span className="text-sm text-muted-foreground" aria-hidden>·</span>
                <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground min-w-0">
                    <MapPin className="w-3.5 h-3.5 shrink-0" aria-label={t("customers.snapshot.location")} />
                    {snapshot.locationLabel}
                </span>
                {/* A valid number is the norm and says nothing; only a bad one earns a mark, in caution amber. */}
                {!snapshot.phoneValid && (
                    <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
                        <Phone className="w-3.5 h-3.5" />
                        {t("customers.snapshot.phoneInvalid")}
                    </span>
                )}
            </div>
        );
    }

    return (
        <div className="bg-(--card-bg) rounded-2xl p-6 border border-(--card-border) shadow-[0_1px_3px_rgba(0,0,0,0.04)] h-full">
            <div className="flex items-center gap-2.5 mb-5">
                <BrainCircuit className="w-5 h-5 text-foreground shrink-0" />
                <h3 className="font-headline font-extrabold text-lg leading-none">
                    {t("customers.behavioral.title")}
                </h3>
            </div>

            {patterns && (
                <div className="space-y-4">
                    {patterns.timeLabel && (
                        <Row
                            icon={<Clock className="w-4.5 h-4.5" />}
                            title={t("customers.behavioral.deliveryTime")}
                            value={patterns.timeLabel}
                        />
                    )}
                    {patterns.dayLabel && (
                        <Row
                            icon={<Calendar className="w-4.5 h-4.5" />}
                            title={t("customers.behavioral.activeDay")}
                            value={patterns.dayLabel}
                        />
                    )}
                    <Row
                        icon={<Repeat className="w-4.5 h-4.5" />}
                        title={t("customers.behavioral.cadence")}
                        value={patterns.cadenceLabel}
                    />
                    <Row
                        icon={<PieChart className="w-4.5 h-4.5" />}
                        tone={patterns.hasRefusals ? "bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300" : undefined}
                        title={t("customers.behavioral.statusMix")}
                        value={<OutcomeMix segments={patterns.statusMix} />}
                    />
                </div>
            )}
        </div>
    );
}

/**
 * The outcome mix, "93% delivered · 7% returned". Each segment is its own
 * bidi-isolated run, so an Arabic number stays beside its word. The runs are
 * spans with unicode-bidi: isolate rather than <bdi>: the row's dir="auto"
 * skips <bdi> text, and it needs the first segment's word to set the reading
 * direction, so Arabic segments run right to left like the outcome flags.
 */
function OutcomeMix({ segments }: { segments: { key: string; label: string }[] }) {
    return (
        <>
            {segments.map((s, i) => (
                <span key={s.key}>
                    {i > 0 && <span aria-hidden> · </span>}
                    <span className="[unicode-bidi:isolate] whitespace-nowrap">{s.label}</span>
                </span>
            ))}
        </>
    );
}

/** Neutral icon tiles; colour only where the row means something (refusals, a bad number). */
const NEUTRAL_TILE = "bg-muted text-foreground dark:bg-white/10";

function Row({
    icon,
    tone,
    title,
    value,
}: {
    icon: React.ReactNode;
    /** Tile colours when the row carries a meaning; neutral otherwise. */
    tone?: string;
    title: string;
    value: React.ReactNode;
}) {
    return (
        <div className="flex items-start gap-4">
            <div
                className={cn("w-9 h-9 rounded-full flex items-center justify-center shrink-0", tone ?? NEUTRAL_TILE)}
            >
                {icon}
            </div>
            <div className="min-w-0 flex-1">
                <p className="font-semibold text-sm leading-snug truncate">{title}</p>
                {value && (
                    // dir="auto": an Arabic value (cadence, day, outcome mix) reads in its own order;
                    // text-left keeps it on the left edge of the LTR page like every other row.
                    <p dir="auto" className="text-[13px] text-muted-foreground leading-relaxed mt-0.5 wrap-break-word text-left">
                        {value}
                    </p>
                )}
            </div>
        </div>
    );
}
