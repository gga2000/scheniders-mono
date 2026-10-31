"use client";

import { useMemo, useState } from "react";
import { useLanguage } from "@/hooks/use-language";
import { cn } from "@/lib/utils";

interface EmployeeData {
    userId: string;
    email: string;
    displayName: string | null;
    totalActions: number;
    ordersCreated: number;
    statusChanges: number;
    ordersPrinted: number;
}

type MetricKey = "totalActions" | "ordersCreated" | "statusChanges" | "ordersPrinted";

const METRICS: { key: MetricKey; labelKey: string }[] = [
    { key: "totalActions", labelKey: "team.stats.totalActions" },
    { key: "ordersCreated", labelKey: "team.stats.newOrders" },
    { key: "statusChanges", labelKey: "team.stats.statusChanges" },
    { key: "ordersPrinted", labelKey: "team.stats.printOps" },
];

function nameOf(e: EmployeeData): string {
    return e.displayName || e.email.split("@")[0];
}

function PersonSelect({ employees, value, onChange, label }: {
    employees: EmployeeData[];
    value: string;
    onChange: (id: string) => void;
    label: string;
}) {
    return (
        <select
            aria-label={label}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="min-w-0 flex-1 px-3 py-2 rounded-xl bg-white dark:bg-[#1A1A1A] border border-[#E8E4DC] dark:border-white/10 text-sm font-semibold text-[#1E1E1E] dark:text-white outline-none focus-visible:ring-2 focus-visible:ring-[#1E1E1E]/20"
        >
            {employees.map((emp) => (
                <option key={emp.userId} value={emp.userId}>{nameOf(emp)}</option>
            ))}
        </select>
    );
}

/** Bar that grows toward the centre line: left person's bars grow leftward, right person's rightward. */
function Bar({ value, max, side, leads }: { value: number; max: number; side: "left" | "right"; leads: boolean }) {
    const pct = max > 0 ? Math.round((value / max) * 100) : 0;
    return (
        <div className={cn("flex items-center gap-3", side === "left" ? "flex-row-reverse" : "flex-row")}>
            <div className={cn("h-2 flex-1 rounded-full bg-[#F0ECE4] dark:bg-white/10 overflow-hidden flex", side === "left" && "justify-end")}>
                <span
                    className={cn("block h-full rounded-full", leads ? "bg-[#1E1E1E] dark:bg-white" : "bg-[#C9C3B8] dark:bg-white/30")}
                    style={{ width: `${pct}%` }}
                />
            </div>
            <span className={cn("w-14 tabular-nums text-sm", side === "left" ? "text-right" : "text-left", leads ? "font-bold text-[#1E1E1E] dark:text-white" : "text-[#6B6B6B] dark:text-gray-400")}>
                {value.toLocaleString("en-US")}
            </span>
        </div>
    );
}

/** Two members side by side on the same window's counts. */
export function EmployeeComparison({ employees, className }: { employees: EmployeeData[]; className?: string }) {
    const { t } = useLanguage();
    const [leftId, setLeftId] = useState(employees[0]?.userId ?? "");
    const [rightId, setRightId] = useState(employees[1]?.userId ?? "");

    const left = useMemo(() => employees.find((e) => e.userId === leftId), [employees, leftId]);
    const right = useMemo(() => employees.find((e) => e.userId === rightId), [employees, rightId]);

    return (
        <section className={cn("bg-white dark:bg-[#1A1A1A] border border-[#E8E4DC] dark:border-white/10 rounded-3xl p-6", className)}>
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                <div>
                    <h2 className="text-lg font-bold text-[#1E1E1E] dark:text-white">{t("team.compare.title")}</h2>
                    <p className="text-sm text-[#6B6B6B] dark:text-gray-400 mt-0.5">{t("team.compare.subtitle")}</p>
                </div>
                <div className="flex items-center gap-2 md:w-[420px]">
                    <PersonSelect employees={employees.filter((e) => e.userId !== rightId)} value={leftId} onChange={setLeftId} label={t("team.compare.selectEmployee")} />
                    <span className="text-xs font-semibold text-[#9A9A9A]">{t("team.compare.and")}</span>
                    <PersonSelect employees={employees.filter((e) => e.userId !== leftId)} value={rightId} onChange={setRightId} label={t("team.compare.selectEmployee")} />
                </div>
            </div>

            {left && right ? (
                <div className="divide-y divide-[#F0ECE4] dark:divide-white/5">
                    <div className="grid grid-cols-[1fr_160px_1fr] gap-4 pb-3 text-sm font-semibold text-[#1E1E1E] dark:text-white">
                        <bdi className="text-right truncate">{nameOf(left)}</bdi>
                        <span />
                        <bdi className="text-left truncate">{nameOf(right)}</bdi>
                    </div>
                    {METRICS.map((m) => {
                        const a = left[m.key];
                        const b = right[m.key];
                        const max = Math.max(a, b);
                        return (
                            <div key={m.key} className="grid grid-cols-[1fr_160px_1fr] items-center gap-4 py-3">
                                <Bar value={a} max={max} side="left" leads={a > b} />
                                <span className="text-center text-xs font-medium text-[#6B6B6B] dark:text-gray-400">{t(m.labelKey)}</span>
                                <Bar value={b} max={max} side="right" leads={b > a} />
                            </div>
                        );
                    })}
                </div>
            ) : (
                <p className="py-10 text-center text-sm text-[#6B6B6B] dark:text-gray-400">{t("team.comparison.notEnough")}</p>
            )}
        </section>
    );
}
