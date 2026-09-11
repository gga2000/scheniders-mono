"use client";

import { useMemo } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
    Printer, Package, Truck, ArrowRight, Clock, MapPin,
    AlertTriangle, CheckCircle2, FileText, ExternalLink,
} from "lucide-react";
import { useOrdersContext } from "@/components/providers/orders-provider";
import { SectionCard } from "@/components/finances/hub/primitives/section-card";
import { FinanceValue } from "@/components/finances/hub/primitives/finance-value";
import { Sparkline } from "@/components/finances/hub/primitives/sparkline";
import { cn } from "@/lib/utils";

export function PrintShipTab() {
    const { orders } = useOrdersContext();

    const stats = useMemo(() => {
        const confirmed = orders.filter((o) => o.status === "confirmed");
        const inTransit = orders.filter((o) => o.status === "in_transit");
        const printedNotShipped = confirmed.filter((o) => (o as any).print_count > 0);
        const unprinted = confirmed.filter((o) => !(o as any).print_count);

        const queueValue = confirmed.reduce((s, o) => s + (o.price || 0), 0);
        const inTransitValue = inTransit.reduce((s, o) => s + (o.price || 0), 0);
        const unprintedValue = unprinted.reduce((s, o) => s + (o.price || 0), 0);

        const today = new Date();
        const sevenDays = Array.from({ length: 7 }).map((_, i) => {
            const d = new Date(today);
            d.setDate(d.getDate() - (6 - i));
            const ds = d.toISOString().slice(0, 10);
            const printed = orders.filter(
                (o) =>
                    (o as any).printed_at &&
                    String((o as any).printed_at).slice(0, 10) === ds
            ).length;
            return printed;
        });

        const cityMap = new Map<string, { count: number; value: number }>();
        for (const o of confirmed) {
            const city = (o as any).city || "Unknown";
            const cur = cityMap.get(city) || { count: 0, value: 0 };
            cur.count += 1;
            cur.value += o.price || 0;
            cityMap.set(city, cur);
        }
        const topCities = Array.from(cityMap.entries())
            .map(([city, v]) => ({ city, ...v }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 5);

        const oldestUnprinted = unprinted.reduce<Date | null>((acc, o) => {
            const created = (o as any).created_at ? new Date((o as any).created_at) : null;
            if (!created) return acc;
            if (!acc || created < acc) return created;
            return acc;
        }, null);

        const ageHours = oldestUnprinted
            ? Math.floor((today.getTime() - oldestUnprinted.getTime()) / (1000 * 60 * 60))
            : 0;

        return {
            queueCount: confirmed.length,
            queueValue,
            unprintedCount: unprinted.length,
            unprintedValue,
            printedNotShippedCount: printedNotShipped.length,
            inTransitCount: inTransit.length,
            inTransitValue,
            sevenDays,
            topCities,
            ageHours,
        };
    }, [orders]);

    const tiles = [
        {
            id: "queue_value",
            label: "In Print Queue",
            sublabel: `${stats.queueCount} confirmed orders`,
            value: stats.queueValue,
            Icon: Printer,
            accent: "amber" as const,
        },
        {
            id: "unprinted",
            label: "Awaiting Label",
            sublabel: `${stats.unprintedCount} not yet printed`,
            value: stats.unprintedValue,
            Icon: AlertTriangle,
            accent: stats.ageHours > 24 ? ("rose" as const) : ("amber" as const),
        },
        {
            id: "ready_to_ship",
            label: "Printed · Awaiting Pickup",
            sublabel: `${stats.printedNotShippedCount} ready for courier`,
            value: 0,
            displayCount: stats.printedNotShippedCount,
            Icon: Package,
            accent: "violet" as const,
        },
        {
            id: "in_transit",
            label: "In Transit",
            sublabel: `${stats.inTransitCount} out for delivery`,
            value: stats.inTransitValue,
            Icon: Truck,
            accent: "cyan" as const,
        },
    ];

    return (
        <div className="space-y-5">
            {/* Hero strip */}
            <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3"
            >
                {tiles.map((t) => (
                    <div
                        key={t.id}
                        className="rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] p-4"
                    >
                        <div className="flex items-start justify-between mb-3">
                            <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center", accentBg(t.accent))}>
                                <t.Icon className={cn("w-4 h-4", accentText(t.accent))} />
                            </div>
                        </div>
                        <div className="text-[11px] font-semibold text-muted uppercase tracking-wider">
                            {t.label}
                        </div>
                        <div className="mt-1">
                            {t.displayCount !== undefined ? (
                                <span className="text-[22px] font-bold tabular-nums text-foreground">
                                    {t.displayCount}
                                </span>
                            ) : (
                                <FinanceValue
                                    value={t.value}
                                    currency="IQD"
                                    abbreviate
                                    className="text-[22px] leading-none text-foreground"
                                />
                            )}
                        </div>
                        <div className="text-[11px] text-muted mt-1 truncate">{t.sublabel}</div>
                    </div>
                ))}
            </motion.div>

            {/* Action banner: deep link to full workflow */}
            <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 }}
                className="rounded-2xl border border-[var(--card-border)] bg-gradient-to-br from-[var(--card-bg)] to-[var(--card-bg)] p-5"
            >
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div className="flex items-start gap-3">
                        <div className="w-11 h-11 rounded-2xl bg-[var(--ink)] text-white flex items-center justify-center shrink-0">
                            <Printer className="w-5 h-5" />
                        </div>
                        <div>
                            <h3 className="text-[15px] font-semibold text-foreground">
                                Print queue ready
                            </h3>
                            <p className="text-[13px] text-muted mt-0.5">
                                {stats.queueCount > 0
                                    ? `${stats.queueCount} orders worth `
                                    : "All caught up — "}
                                {stats.queueCount > 0 && (
                                    <FinanceValue
                                        value={stats.queueValue}
                                        currency="IQD"
                                        abbreviate
                                        className="text-foreground"
                                    />
                                )}
                                {stats.queueCount > 0 ? " waiting to ship." : "no orders waiting to print."}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <Link
                            href="/printing"
                            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--ink)] text-white text-[13px] font-medium hover:opacity-90 transition-opacity"
                        >
                            Open Print Queue
                            <ArrowRight className="w-4 h-4" />
                        </Link>
                    </div>
                </div>
            </motion.div>

            {/* Two-column: 7-day print volume + Top cities */}
            <div className="grid grid-cols-1 xl:grid-cols-5 gap-5">
                <div className="xl:col-span-2">
                    <SectionCard
                        title="Last 7 days · printed labels"
                        subtitle="Daily print throughput"
                        icon={FileText}
                        accent="violet"
                    >
                        <div className="text-violet-600 dark:text-violet-400">
                            <Sparkline
                                data={stats.sevenDays}
                                width={420}
                                height={80}
                                stroke="currentColor"
                                fill="rgba(139,92,246,0.14)"
                                showDot
                            />
                        </div>
                        <div className="mt-3 grid grid-cols-7 gap-1 text-[10px] text-muted text-center tabular-nums">
                            {stats.sevenDays.map((n, i) => (
                                <div key={i}>{n}</div>
                            ))}
                        </div>
                    </SectionCard>
                </div>
                <div className="xl:col-span-3">
                    <SectionCard
                        title="Queue by city"
                        subtitle="Top 5 cities by IQD value in queue"
                        icon={MapPin}
                        accent="cyan"
                        action={
                            <Link
                                href="/finances?tab=cash"
                                className="text-[12px] text-muted hover:text-foreground inline-flex items-center gap-1"
                            >
                                Cash view <ArrowRight className="w-3 h-3" />
                            </Link>
                        }
                    >
                        {stats.topCities.length === 0 ? (
                            <EmptyRow message="No orders in print queue" icon={CheckCircle2} />
                        ) : (
                            <div className="divide-y divide-[var(--card-border)]">
                                {stats.topCities.map((c) => {
                                    const pct =
                                        stats.queueValue > 0 ? (c.value / stats.queueValue) * 100 : 0;
                                    return (
                                        <div
                                            key={c.city}
                                            className="flex items-center justify-between gap-3 py-2.5"
                                        >
                                            <div className="flex items-center gap-2 min-w-0">
                                                <div className="w-6 h-6 rounded-md bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 flex items-center justify-center shrink-0">
                                                    <MapPin className="w-3 h-3" />
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="text-[13px] font-medium text-foreground truncate">
                                                        {c.city}
                                                    </div>
                                                    <div className="text-[11px] text-muted">
                                                        {c.count} {c.count === 1 ? "order" : "orders"} · {pct.toFixed(0)}% of queue
                                                    </div>
                                                </div>
                                            </div>
                                            <FinanceValue
                                                value={c.value}
                                                currency="IQD"
                                                abbreviate
                                                className="text-[13px] text-foreground"
                                            />
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </SectionCard>
                </div>
            </div>

            {/* Quick actions row */}
            <SectionCard
                title="Quick actions"
                subtitle="Jump straight into common workflows"
                icon={ExternalLink}
                accent="slate"
            >
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <QuickActionLink
                        href="/printing"
                        title="Print labels"
                        sub={`${stats.unprintedCount} unprinted orders`}
                        icon={Printer}
                        accent="amber"
                    />
                    <QuickActionLink
                        href="/printing"
                        title="Submit to courier"
                        sub={`${stats.printedNotShippedCount} printed, ready`}
                        icon={Truck}
                        accent="violet"
                    />
                    <QuickActionLink
                        href="/finances?tab=cash"
                        title="Track in-transit cash"
                        sub={`${stats.inTransitCount} orders out for delivery`}
                        icon={Clock}
                        accent="cyan"
                    />
                </div>
            </SectionCard>

            {stats.ageHours > 24 && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-4 flex items-start gap-3"
                >
                    <AlertTriangle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                    <div className="text-[13px]">
                        <span className="font-semibold text-rose-700 dark:text-rose-300">
                            Oldest unprinted order is {stats.ageHours}h old.
                        </span>{" "}
                        <span className="text-muted">
                            Customer satisfaction drops sharply after 48h. Print now to keep delivery promises.
                        </span>
                    </div>
                </motion.div>
            )}
        </div>
    );
}

function QuickActionLink({
    href,
    title,
    sub,
    icon: Icon,
    accent,
}: {
    href: string;
    title: string;
    sub: string;
    icon: typeof Printer;
    accent: "emerald" | "rose" | "amber" | "violet" | "cyan" | "slate";
}) {
    return (
        <Link
            href={href}
            className="group flex items-center gap-3 rounded-xl border border-[var(--card-border)] bg-[var(--background)] p-3.5 hover:border-[var(--ink)] transition-colors"
        >
            <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center shrink-0", accentBg(accent))}>
                <Icon className={cn("w-4 h-4", accentText(accent))} />
            </div>
            <div className="min-w-0 flex-1">
                <div className="text-[13px] font-semibold text-foreground truncate">{title}</div>
                <div className="text-[11px] text-muted truncate">{sub}</div>
            </div>
            <ArrowRight className="w-4 h-4 text-muted group-hover:text-foreground transition-colors shrink-0" />
        </Link>
    );
}

function EmptyRow({
    message,
    icon: Icon,
}: {
    message: string;
    icon: typeof CheckCircle2;
}) {
    return (
        <div className="py-8 flex flex-col items-center justify-center text-center">
            <Icon className="w-7 h-7 text-emerald-500 mb-2" />
            <div className="text-[13px] text-muted">{message}</div>
        </div>
    );
}

function accentBg(a: string): string {
    switch (a) {
        case "emerald":
            return "bg-emerald-500/10";
        case "rose":
            return "bg-rose-500/10";
        case "amber":
            return "bg-amber-500/10";
        case "violet":
            return "bg-violet-500/10";
        case "cyan":
            return "bg-cyan-500/10";
        default:
            return "bg-slate-500/10";
    }
}
function accentText(a: string): string {
    switch (a) {
        case "emerald":
            return "text-emerald-600 dark:text-emerald-400";
        case "rose":
            return "text-rose-600 dark:text-rose-400";
        case "amber":
            return "text-amber-600 dark:text-amber-400";
        case "violet":
            return "text-violet-600 dark:text-violet-400";
        case "cyan":
            return "text-cyan-600 dark:text-cyan-400";
        default:
            return "text-slate-600 dark:text-slate-400";
    }
}
