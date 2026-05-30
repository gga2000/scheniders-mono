"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Landmark, ArrowRight, AlertTriangle } from "lucide-react";
import { SectionCard } from "../primitives/section-card";
import { FinanceValue } from "../primitives/finance-value";
import { cn } from "@/lib/utils";
import type { CashPositionResult } from "@/hooks/use-cash-position";

interface Props {
    data: CashPositionResult;
}

export function CashHealthCard({ data }: Props) {
    const totalFloat = data.aging.reduce((s, b) => s + b.value, 0);
    const hasRisk = data.stuckCount > 0;

    return (
        <SectionCard
            title="Cash Health"
            subtitle={hasRisk ? `${data.stuckCount} stuck orders need attention` : "COD pipeline is healthy"}
            icon={Landmark}
            accent={hasRisk ? "rose" : "emerald"}
            action={
                <Link
                    href="/finances?tab=cash"
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-muted hover:text-foreground transition-colors"
                >
                    Open Cash <ArrowRight className="w-3 h-3" />
                </Link>
            }
            dense
        >
            <div className="grid grid-cols-2 gap-3 mb-4">
                <Tile
                    label="Collected"
                    value={data.cashCollected}
                    accent="emerald"
                />
                <Tile
                    label="At Risk"
                    value={data.cashAtRisk}
                    accent="rose"
                    sublabel={data.stuckCount > 0 ? `${data.stuckCount} orders ≥15d` : "No stuck orders"}
                />
            </div>

            {totalFloat > 0 && (
                <div>
                    <div className="text-[10px] uppercase tracking-wider text-muted font-semibold mb-2">
                        In-transit aging
                    </div>
                    <AgingBar buckets={data.aging} />
                    <div className="mt-2 flex items-center justify-between text-[10px] text-muted tabular-nums">
                        {data.aging.map((b) => (
                            <span key={b.id} className={cn(toneText(b.tone))}>
                                {b.count} · {b.range}
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {hasRisk && (
                <motion.div
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-4 px-3 py-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20 flex items-start gap-2"
                >
                    <AlertTriangle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                    <p className="text-[11px] text-rose-700 dark:text-rose-300 leading-relaxed">
                        <span className="font-semibold">
                            <FinanceValue value={data.cashAtRisk} currency="IQD" abbreviate className="text-inherit" />
                        </span>{" "}
                        stuck in transit 15+ days. Check with your delivery partner.
                    </p>
                </motion.div>
            )}
        </SectionCard>
    );
}

function Tile({ label, value, accent, sublabel }: { label: string; value: number; accent: "emerald" | "rose"; sublabel?: string }) {
    return (
        <div className="rounded-xl border border-[var(--card-border)] bg-[var(--background)] p-3">
            <div className="text-[10px] uppercase tracking-wider text-muted font-semibold">{label}</div>
            <FinanceValue
                value={value}
                currency="IQD"
                abbreviate
                className={cn(
                    "text-lg block mt-0.5",
                    accent === "emerald" ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
                )}
            />
            {sublabel && <div className="text-[10px] text-muted mt-0.5">{sublabel}</div>}
        </div>
    );
}

function AgingBar({ buckets }: { buckets: CashPositionResult["aging"] }) {
    const total = buckets.reduce((s, b) => s + b.value, 0);
    if (total === 0) {
        return <div className="h-2 rounded-full bg-[var(--background)]" />;
    }
    return (
        <div className="h-2.5 rounded-full bg-[var(--background)] overflow-hidden flex">
            {buckets.map((b) => {
                const pct = (b.value / total) * 100;
                if (pct === 0) return null;
                return (
                    <motion.div
                        key={b.id}
                        initial={{ width: 0 }}
                        animate={{ width: `${pct}%` }}
                        transition={{ duration: 0.5, ease: "easeOut" }}
                        className={cn("h-full", toneBar(b.tone))}
                        title={`${b.label}: ${b.count} orders`}
                    />
                );
            })}
        </div>
    );
}

function toneText(t: CashPositionResult["aging"][number]["tone"]): string {
    switch (t) {
        case "emerald": return "text-emerald-600 dark:text-emerald-400";
        case "amber": return "text-amber-600 dark:text-amber-400";
        case "orange": return "text-orange-600 dark:text-orange-400";
        case "rose": return "text-rose-600 dark:text-rose-400";
    }
}

function toneBar(t: CashPositionResult["aging"][number]["tone"]): string {
    switch (t) {
        case "emerald": return "bg-emerald-500/70";
        case "amber": return "bg-amber-500/70";
        case "orange": return "bg-orange-500/70";
        case "rose": return "bg-rose-500/70";
    }
}
