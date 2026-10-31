"use client";

import { useState } from "react";
import { Check, Plus, Trash2 } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";
import { GOAL_METRICS, GOAL_PERIODS, type Goal, type GoalMetric, type GoalPeriod, type NewGoal } from "@/lib/team-goals";
import { cn } from "@/lib/utils";

export interface GoalRow {
    goal: Goal;
    name: string;
    /** Count so far in the goal's window; null while loading or when it could not be counted. */
    current: number | null;
}

interface GoalBoardProps {
    rows: GoalRow[];
    employees: { userId: string; name: string }[];
    loading: boolean;
    goalsFailed: boolean;
    progressFailed: boolean;
    onAdd: (goal: NewGoal) => Promise<boolean>;
    onDelete: (id: string) => void;
}

const METRIC_KEYS: Record<GoalMetric, string> = {
    totalActions: "team.goals.totalActions",
    ordersCreated: "team.goals.ordersCreated",
    statusChanges: "team.goals.statusChanges",
    ordersPrinted: "team.goals.ordersPrinted",
};

const PERIOD_KEYS: Record<GoalPeriod, string> = {
    daily: "team.goals.daily",
    weekly: "team.goals.weekly",
    monthly: "team.goals.monthly",
};

const fieldClass =
    "h-10 w-full px-3 rounded-xl bg-white dark:bg-[#1A1A1A] border border-[#E8E4DC] dark:border-white/10 text-sm font-medium text-[#1E1E1E] dark:text-white outline-none focus-visible:ring-2 focus-visible:ring-[#1E1E1E]/20 dark:focus-visible:ring-white/30";

const inkButton =
    "inline-flex h-10 items-center justify-center gap-2 px-4 rounded-xl bg-[#1E1E1E] dark:bg-white text-white dark:text-[#1E1E1E] text-sm font-semibold hover:bg-black dark:hover:bg-white/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors";

const quietButton =
    "inline-flex h-10 items-center justify-center px-4 rounded-xl text-sm font-semibold text-[#6B6B6B] dark:text-gray-400 hover:bg-[#F5F2EC] dark:hover:bg-white/5 transition-colors";

function GoalForm({ employees, onAdd, onCancel }: {
    employees: GoalBoardProps["employees"];
    onAdd: GoalBoardProps["onAdd"];
    onCancel: () => void;
}) {
    const { t } = useLanguage();
    const [employeeId, setEmployeeId] = useState("");
    const [type, setType] = useState<GoalPeriod>("daily");
    const [metric, setMetric] = useState<GoalMetric>("totalActions");
    const [target, setTarget] = useState("20");
    const [saving, setSaving] = useState(false);
    const targetNumber = Number(target);
    const valid = employeeId !== "" && Number.isInteger(targetNumber) && targetNumber >= 1;

    return (
        <form
            className="grid grid-cols-[1.4fr_1fr_1.2fr_120px_auto] items-end gap-3 rounded-2xl border border-[#E8E4DC] dark:border-white/10 bg-[#FAF8F5] dark:bg-white/[0.03] p-4"
            onSubmit={async (e) => {
                e.preventDefault();
                if (!valid) return;
                setSaving(true);
                const saved = await onAdd({ employeeId, type, metric, target: targetNumber });
                setSaving(false);
                if (saved) onCancel();
            }}
        >
            <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-[#6B6B6B] dark:text-gray-400">{t("team.goals.employee")}</span>
                <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className={fieldClass}>
                    <option value="">{t("team.goals.selectEmployee")}</option>
                    {employees.map((emp) => <option key={emp.userId} value={emp.userId}>{emp.name}</option>)}
                </select>
            </label>
            <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-[#6B6B6B] dark:text-gray-400">{t("team.goals.frequency")}</span>
                <select value={type} onChange={(e) => setType(GOAL_PERIODS.find((p) => p === e.target.value) ?? "daily")} className={fieldClass}>
                    {GOAL_PERIODS.map((p) => <option key={p} value={p}>{`${t(PERIOD_KEYS[p])} · ${t(`team.goals.window.${p}`)}`}</option>)}
                </select>
            </label>
            <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-[#6B6B6B] dark:text-gray-400">{t("team.goals.actionType")}</span>
                <select value={metric} onChange={(e) => setMetric(GOAL_METRICS.find((m) => m === e.target.value) ?? "totalActions")} className={fieldClass}>
                    {GOAL_METRICS.map((m) => <option key={m} value={m}>{t(METRIC_KEYS[m])}</option>)}
                </select>
            </label>
            <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-[#6B6B6B] dark:text-gray-400">{t("team.goals.targetValue")}</span>
                <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    step={1}
                    value={target}
                    onChange={(e) => setTarget(e.target.value)}
                    className={cn(fieldClass, "tabular-nums")}
                    aria-invalid={target !== "" && !valid && employeeId !== ""}
                />
            </label>
            <div className="flex items-center gap-1">
                <button type="submit" disabled={!valid || saving} className={inkButton}>
                    <Check className="w-4 h-4" aria-hidden="true" />
                    {t("team.goals.saveGoal")}
                </button>
                <button type="button" onClick={onCancel} className={quietButton}>{t("team.goals.cancel")}</button>
            </div>
        </form>
    );
}

function ProgressBar({ value, target }: { value: number | null; target: number }) {
    const pct = value === null ? 0 : Math.min(100, Math.round((value / target) * 100));
    const met = value !== null && value >= target;
    return (
        <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={target}
            aria-valuenow={value ?? undefined}
            className="h-2 w-full rounded-full bg-[#F0ECE4] dark:bg-white/10 overflow-hidden"
        >
            <span
                className={cn("block h-full rounded-full transition-[width] duration-500", met ? "bg-emerald-600 dark:bg-emerald-400" : "bg-[#1E1E1E] dark:bg-white")}
                style={{ width: `${pct}%` }}
            />
        </div>
    );
}

function GoalLine({ row, onDelete }: { row: GoalRow; onDelete: () => void }) {
    const { t } = useLanguage();
    const [confirming, setConfirming] = useState(false);
    const { goal, current } = row;
    const met = current !== null && current >= goal.target;
    const pct = current === null ? null : Math.round((current / goal.target) * 100);

    return (
        <li className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,2fr)_120px_88px_auto] items-center gap-4 py-3">
            <bdi className="truncate text-left text-sm font-semibold text-[#1E1E1E] dark:text-white">{row.name}</bdi>
            <span className="truncate text-sm text-[#6B6B6B] dark:text-gray-400">{t(METRIC_KEYS[goal.metric])}</span>
            <ProgressBar value={current} target={goal.target} />
            <span className="text-sm tabular-nums text-[#6B6B6B] dark:text-gray-400" dir="ltr">
                <span className="font-semibold text-[#1E1E1E] dark:text-white">{current === null ? "–" : current.toLocaleString("en-US")}</span>
                {" / "}
                {goal.target.toLocaleString("en-US")}
            </span>
            <span className={cn("text-sm font-semibold tabular-nums", met ? "text-emerald-700 dark:text-emerald-400" : "text-[#6B6B6B] dark:text-gray-400")}>
                {met ? t("team.goals.met") : pct === null ? "" : `${pct}%`}
            </span>
            {confirming ? (
                <span className="flex items-center gap-1">
                    <button
                        type="button"
                        onClick={() => { setConfirming(false); onDelete(); }}
                        className="h-8 px-3 rounded-lg bg-rose-600 text-white text-xs font-semibold hover:bg-rose-700 transition-colors"
                    >
                        {t("team.goals.delete")}
                    </button>
                    <button type="button" onClick={() => setConfirming(false)} className="h-8 px-3 rounded-lg text-xs font-semibold text-[#6B6B6B] dark:text-gray-400 hover:bg-[#F5F2EC] dark:hover:bg-white/5">
                        {t("team.goals.cancel")}
                    </button>
                </span>
            ) : (
                <button
                    type="button"
                    onClick={() => setConfirming(true)}
                    aria-label={t("team.goals.delete")}
                    className="justify-self-end p-2 rounded-lg text-[#9A9A9A] hover:text-rose-600 hover:bg-[#F5F2EC] dark:hover:bg-white/5 transition-colors"
                >
                    <Trash2 className="w-4 h-4" aria-hidden="true" />
                </button>
            )}
        </li>
    );
}

/** Goals grouped by window (today, last 7 days, last 30 days), one line each. */
export function GoalBoard({ rows, employees, loading, goalsFailed, progressFailed, onAdd, onDelete }: GoalBoardProps) {
    const { t } = useLanguage();
    const [adding, setAdding] = useState(false);
    const met = rows.filter((r) => r.current !== null && r.current >= r.goal.target).length;

    return (
        <section className="bg-white dark:bg-[#1A1A1A] border border-[#E8E4DC] dark:border-white/10 rounded-3xl p-6 space-y-5">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h2 className="text-lg font-bold text-[#1E1E1E] dark:text-white">{t("team.goals.title")}</h2>
                    <p className="text-sm text-[#6B6B6B] dark:text-gray-400 mt-0.5">{t("team.goals.subtitle")}</p>
                </div>
                <div className="flex items-center gap-4">
                    {rows.length > 0 && (
                        <span className="text-sm text-[#6B6B6B] dark:text-gray-400">
                            {t("team.goals.summary", { met: met.toLocaleString("en-US"), total: rows.length.toLocaleString("en-US") })}
                        </span>
                    )}
                    {!adding && (
                        <button type="button" onClick={() => setAdding(true)} className={inkButton}>
                            <Plus className="w-4 h-4" aria-hidden="true" />
                            {t("team.goals.newBtn")}
                        </button>
                    )}
                </div>
            </div>

            {adding && <GoalForm employees={employees} onAdd={onAdd} onCancel={() => setAdding(false)} />}

            {goalsFailed && <p role="alert" className="text-sm font-medium text-rose-700 dark:text-rose-400">{t("team.goals.loadFailed")}</p>}
            {progressFailed && <p role="alert" className="text-sm font-medium text-rose-700 dark:text-rose-400">{t("team.goals.progressFailed")}</p>}

            {loading ? (
                <div className="space-y-3" aria-busy="true">
                    {[0, 1, 2].map((i) => <div key={i} className="h-10 rounded-xl bg-[#F5F2EC] dark:bg-white/5 animate-pulse" />)}
                </div>
            ) : rows.length === 0 ? (
                !adding && !goalsFailed && (
                    <div className="py-12 text-center">
                        <p className="text-base font-semibold text-[#1E1E1E] dark:text-white">{t("team.goals.emptyTitle")}</p>
                        <p className="mt-1 text-sm text-[#6B6B6B] dark:text-gray-400">{t("team.goals.emptySubtitle")}</p>
                    </div>
                )
            ) : (
                GOAL_PERIODS.map((period) => {
                    const group = rows.filter((r) => r.goal.type === period);
                    if (group.length === 0) return null;
                    return (
                        <div key={period}>
                            <h3 className="flex items-baseline gap-2 border-b border-[#F0ECE4] dark:border-white/5 pb-2 text-sm font-semibold text-[#1E1E1E] dark:text-white">
                                {t(PERIOD_KEYS[period])}
                                <span className="text-xs font-medium text-[#9A9A9A]">{t(`team.goals.window.${period}`)}</span>
                            </h3>
                            <ul className="divide-y divide-[#F0ECE4] dark:divide-white/5">
                                {group.map((row) => <GoalLine key={row.goal.id} row={row} onDelete={() => onDelete(row.goal.id)} />)}
                            </ul>
                        </div>
                    );
                })
            )}
        </section>
    );
}
