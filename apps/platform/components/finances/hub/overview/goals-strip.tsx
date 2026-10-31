"use client";

import { useEffect, useMemo, useState } from "react";
import { Target, Pencil, Check, X } from "lucide-react";
import { SectionCard } from "../primitives/section-card";
import { FinanceValue } from "../primitives/finance-value";
import { useLanguage } from "@/hooks/use-language";
import { cn } from "@/lib/utils";
import type { FinanceOverviewResult } from "@/hooks/use-finance-overview";
import type { PresetKey } from "@/hooks/use-finance-period";

interface GoalsStripProps {
    data: FinanceOverviewResult;
    presetKey: PresetKey;
}

type GoalKey = "revenue" | "profit" | "orders";

// v2 keys per preset; v1 was global and applied incorrectly across periods.
const STORAGE_KEY = "schneiders_finance_goals_v2";

interface Goals {
    revenue: number;
    profit: number;
    orders: number;
}

type GoalsByPeriod = Partial<Record<PresetKey, Goals>>;

const DEFAULTS: Goals = { revenue: 0, profit: 0, orders: 0 };

export function GoalsStrip({ data, presetKey }: GoalsStripProps) {
    const { t } = useLanguage();
    const [allGoals, setAllGoals] = useState<GoalsByPeriod>({});
    const [editing, setEditing] = useState<GoalKey | null>(null);
    const [draft, setDraft] = useState<string>("");

    useEffect(() => {
        if (typeof window === "undefined") return;
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) setAllGoals(JSON.parse(raw) as GoalsByPeriod);
        } catch { /* ignore */ }
    }, []);

    const goals: Goals = { ...DEFAULTS, ...(allGoals[presetKey] ?? {}) };

    const save = (key: GoalKey, v: number) => {
        const nextForPeriod = { ...goals, [key]: v };
        const next = { ...allGoals, [presetKey]: nextForPeriod };
        setAllGoals(next);
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        } catch { /* ignore */ }
    };

    const items = useMemo(() => [
        { key: "revenue" as const, label: t("finances.overview.goals.revenue"), actual: data.gross_revenue, goal: goals.revenue, currency: "IQD" as const },
        { key: "profit" as const, label: t("finances.overview.goals.profit"), actual: data.net_profit, goal: goals.profit, currency: "IQD" as const },
        { key: "orders" as const, label: t("finances.overview.goals.orders"), actual: data.orders_count, goal: goals.orders, currency: "none" as const },
    ], [data, goals, t]);

    return (
        <SectionCard
            title={t("finances.overview.goals.title")}
            subtitle={t("finances.overview.goals.sub", { period: t(`finances.overview.goals.p.${presetKey}`) })}
            icon={Target}
            accent="cyan"
        >
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {items.map((it) => {
                    const pct = it.goal > 0 ? Math.min(100, (it.actual / it.goal) * 100) : 0;
                    const hasGoal = it.goal > 0;
                    const done = pct >= 100;
                    const isEditing = editing === it.key;

                    return (
                        <div
                            key={it.key}
                            className="rounded-xl p-3 border bg-[var(--background)] border-[var(--card-border)]"
                        >
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-[11px] uppercase tracking-wider text-muted font-semibold">{it.label}</span>
                                {!isEditing ? (
                                    <button
                                        onClick={() => { setEditing(it.key); setDraft(it.goal ? String(it.goal) : ""); }}
                                        className="text-muted hover:text-foreground text-[11px] flex items-center gap-1"
                                    >
                                        <Pencil className="w-3 h-3" />
                                        {hasGoal ? t("finances.overview.goals.edit") : t("finances.overview.goals.set")}
                                    </button>
                                ) : (
                                    <div className="flex items-center gap-1">
                                        <button
                                            onClick={() => {
                                                const n = Number(draft.replace(/[^\d.-]/g, ""));
                                                save(it.key, isFinite(n) ? Math.max(0, n) : 0);
                                                setEditing(null);
                                            }}
                                            className="w-5 h-5 rounded flex items-center justify-center bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500/25"
                                        >
                                            <Check className="w-3 h-3" />
                                        </button>
                                        <button
                                            onClick={() => setEditing(null)}
                                            className="w-5 h-5 rounded flex items-center justify-center bg-rose-500/15 text-rose-600 hover:bg-rose-500/25"
                                        >
                                            <X className="w-3 h-3" />
                                        </button>
                                    </div>
                                )}
                            </div>

                            <div className="flex items-baseline gap-2">
                                <FinanceValue
                                    value={it.actual}
                                    currency={it.currency}
                                    abbreviate
                                    className="text-xl text-foreground"
                                />
                                {hasGoal && (
                                    <span className="text-[11px] text-muted tabular-nums">
                                        {t("finances.overview.goals.ofGoal")} <FinanceValue value={it.goal} currency={it.currency} abbreviate className="font-semibold" />
                                    </span>
                                )}
                            </div>

                            <div className="mt-2 h-1.5 rounded-full bg-[var(--card-border)] overflow-hidden">
                                <div
                                    className={cn(
                                        "h-full rounded-full transition-all",
                                        !hasGoal ? "bg-[var(--card-border)]" : done ? "bg-emerald-500" : "bg-cyan-500"
                                    )}
                                    style={{ width: `${hasGoal ? Math.min(100, pct) : 0}%` }}
                                />
                            </div>
                            <div className="flex items-center justify-between mt-1 text-[11px]">
                                <span className="text-muted">
                                    {hasGoal ? t("finances.overview.goals.pct", { pct: pct.toFixed(0) }) : t("finances.overview.goals.none")}
                                </span>
                                {hasGoal && done && <span className="text-emerald-600 font-semibold">{t("finances.overview.goals.hit")}</span>}
                            </div>

                            {isEditing && (
                                <input
                                    autoFocus
                                    value={draft}
                                    onChange={(e) => setDraft(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") {
                                            const n = Number(draft.replace(/[^\d.-]/g, ""));
                                            save(it.key, isFinite(n) ? Math.max(0, n) : 0);
                                            setEditing(null);
                                        }
                                        if (e.key === "Escape") setEditing(null);
                                    }}
                                    placeholder={it.currency === "none" ? t("finances.overview.goals.targetOrders") : t("finances.overview.goals.targetIqd")}
                                    className="mt-2 w-full px-2 py-1 rounded bg-[var(--card-bg)] border border-[var(--card-border)] text-[13px] text-foreground tabular-nums outline-none focus:border-[var(--ink)]"
                                />
                            )}
                        </div>
                    );
                })}
            </div>
        </SectionCard>
    );
}
