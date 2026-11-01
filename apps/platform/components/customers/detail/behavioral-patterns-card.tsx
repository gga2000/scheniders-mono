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
    Users,
    ShieldCheck,
    Sparkles,
} from "lucide-react";
import { governorateLabel } from "@scheniders/shared";
import { useLanguage } from "@/hooks/use-language";
import { formatPhoneDisplay } from "@/lib/customer-format";
import { useCustomerLinks } from "@/hooks/use-customer-links";
import type { TrustTier } from "@/types/customer";

type Order = { created_at: string; status: string };

interface BehavioralPatternsCardProps {
    orders: Order[];
    firstOrderDate?: string | null;
    city?: string | null;
    governorate?: string | null;
    phone: string;
    trustTier: TrustTier;
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

function trustSignalKey(tier: TrustTier, orderCount: number): string {
    if (tier === "watch") return "customers.snapshot.trustWatch";
    if (tier === "risky" || tier === "critical" || tier === "blocked")
        return "customers.snapshot.trustRisky";
    if (tier === "platinum" || tier === "gold") return "customers.snapshot.trustHigh";
    if (orderCount === 0 || tier === "new") return "customers.snapshot.trustNew";
    return "customers.snapshot.trustNew";
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BehavioralPatternsCard({
    orders,
    firstOrderDate,
    city,
    governorate,
    phone,
    trustTier,
}: BehavioralPatternsCardProps) {
    const { t, language } = useLanguage();
    const { data: links = [] } = useCustomerLinks(phone);

    const mode: "patterns" | "snapshot" = orders.length >= 3 ? "patterns" : "snapshot";

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
        const statusMix = (Object.keys(counts) as (keyof typeof counts)[])
            .filter((k) => k === "delivered" || counts[k] > 0)
            .map((k) => t(`customers.behavioral.mix.${k}`, { pct: Math.round((counts[k] / total) * 100).toString() }))
            .join(" · ");

        return {
            timeLabel: preferredTime ? t(TIME_KEY[preferredTime]) : null,
            dayLabel: activeDay !== null ? t(DAY_KEYS[activeDay]) : null,
            cadenceLabel,
            statusMix,
        };
    }, [mode, orders, t]);

    // ----- Snapshot computations -----
    const snapshot = useMemo(() => {
        if (mode !== "snapshot") return null;

        const joinedDays = firstOrderDate
            ? Math.max(0, Math.floor((Date.now() - new Date(firstOrderDate).getTime()) / 86_400_000))
            : null;

        const joinedLabel =
            joinedDays === null
                ? t("customers.snapshot.joinedNew")
                : joinedDays === 0
                ? t("customers.snapshot.joinedToday")
                : joinedDays === 1
                ? t("customers.snapshot.joinedYesterday")
                : t("customers.snapshot.joined", { days: joinedDays.toString() });

        // The governorate is stored as a code ("BG"): shown by its name, like the list and the drawer.
        const govName = governorate ? governorateLabel(governorate, language) || governorate : null;
        const locationLabel =
            city || govName
                ? [city, govName].filter(Boolean).join(language === "ar" ? "، " : ", ")
                : t("customers.snapshot.locationUnknown");

        const phoneValid = isValidIraqiMobile(phone);

        const linkCount = links.length;
        const linksLabel =
            linkCount === 0
                ? t("customers.snapshot.linksNone")
                : linkCount === 1
                ? t("customers.snapshot.linksOne")
                : t("customers.snapshot.linksMany", { count: linkCount.toString() });

        const trustLabel = t(trustSignalKey(trustTier, orders.length));

        return { joinedLabel, locationLabel, phoneValid, linksLabel, trustLabel };
    }, [mode, firstOrderDate, city, governorate, phone, trustTier, orders.length, links, t, language]);

    return (
        <div className="bg-(--card-bg) rounded-2xl p-6 border border-(--card-border) shadow-[0_1px_3px_rgba(0,0,0,0.04)] h-full">
            <div className="flex items-center gap-2.5 mb-5">
                {mode === "patterns" ? (
                    <BrainCircuit className="w-5 h-5 text-purple-500 shrink-0" />
                ) : (
                    <Sparkles className="w-5 h-5 text-blue-500 shrink-0" />
                )}
                <h3 className="font-headline font-extrabold text-lg leading-none">
                    {mode === "patterns"
                        ? t("customers.behavioral.title")
                        : t("customers.snapshot.title")}
                </h3>
            </div>

            {mode === "patterns" && patterns ? (
                <div className="space-y-4">
                    {patterns.timeLabel && (
                        <Row
                            icon={<Clock className="w-4.5 h-4.5" />}
                            iconBg="bg-blue-50 text-blue-500"
                            title={t("customers.behavioral.deliveryTime")}
                            value={patterns.timeLabel}
                        />
                    )}
                    {patterns.dayLabel && (
                        <Row
                            icon={<Calendar className="w-4.5 h-4.5" />}
                            iconBg="bg-amber-50 text-amber-500"
                            title={t("customers.behavioral.activeDay")}
                            value={patterns.dayLabel}
                        />
                    )}
                    <Row
                        icon={<Repeat className="w-4.5 h-4.5" />}
                        iconBg="bg-pink-50 text-pink-500"
                        title={t("customers.behavioral.cadence")}
                        value={patterns.cadenceLabel}
                    />
                    <Row
                        icon={<PieChart className="w-4.5 h-4.5" />}
                        iconBg="bg-green-50 text-green-500"
                        title={t("customers.behavioral.statusMix")}
                        value={patterns.statusMix}
                    />
                </div>
            ) : snapshot ? (
                <div className="space-y-4">
                    <Row
                        icon={<Calendar className="w-4.5 h-4.5" />}
                        iconBg="bg-blue-50 text-blue-500"
                        title={t("customers.snapshot.customerSince")}
                        value={snapshot.joinedLabel}
                    />
                    <Row
                        icon={<MapPin className="w-4.5 h-4.5" />}
                        iconBg="bg-pink-50 text-pink-500"
                        title={t("customers.snapshot.location")}
                        value={snapshot.locationLabel}
                    />
                    <Row
                        icon={<Phone className="w-4.5 h-4.5" />}
                        iconBg={
                            snapshot.phoneValid
                                ? "bg-emerald-50 text-emerald-500"
                                : "bg-amber-50 text-amber-500"
                        }
                        title={
                            snapshot.phoneValid
                                ? t("customers.snapshot.phoneValid")
                                : t("customers.snapshot.phoneInvalid")
                        }
                        value={formatPhoneDisplay(phone)}
                    />
                    <Row
                        icon={<Users className="w-4.5 h-4.5" />}
                        iconBg="bg-purple-50 text-purple-500"
                        title={snapshot.linksLabel}
                        value=""
                    />
                    <Row
                        icon={<ShieldCheck className="w-4.5 h-4.5" />}
                        iconBg="bg-green-50 text-green-500"
                        title={snapshot.trustLabel}
                        value=""
                    />
                </div>
            ) : null}
        </div>
    );
}

function Row({
    icon,
    iconBg,
    title,
    value,
}: {
    icon: React.ReactNode;
    iconBg: string;
    title: string;
    value: string;
}) {
    return (
        <div className="flex items-start gap-4">
            <div
                className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 dark:bg-white/10 ${iconBg}`}
            >
                {icon}
            </div>
            <div className="min-w-0 flex-1">
                <p className="font-semibold text-sm leading-snug truncate">{title}</p>
                {value && (
                    <p className="text-[13px] text-muted-foreground leading-relaxed mt-0.5 wrap-break-word">
                        {value}
                    </p>
                )}
            </div>
        </div>
    );
}
