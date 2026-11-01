"use client";

import { Settings } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";
import { cn } from "@/lib/utils";
import type { EffectiveSalaryRate } from "@/types/salary";

export interface PendingPayItem {
    id: string;
    kind: "advance" | "penalty" | "bonus";
    amount: number;
    reason: string | null;
}

function fmtNumber(n: number): string {
    return new Intl.NumberFormat("en-US").format(Math.round(n));
}

const SOURCE_KEYS: Record<EffectiveSalaryRate["source"], string> = {
    employee_config: "team.salary.source.employee",
    role_default: "team.salary.source.role",
    none: "team.salary.source.none",
};

const KIND_KEYS: Record<PendingPayItem["kind"], string> = {
    advance: "payroll.ded.advance",
    penalty: "team.salary.penalty",
    bonus: "payroll.ded.bonus",
};

/** Pay terms and not-yet-paid items for one member. Presentational. */
export function EmployeeSalarySummary({ rate, pending, onEdit }: {
    rate: EffectiveSalaryRate;
    pending: PendingPayItem[];
    onEdit: () => void;
}) {
    const { t } = useLanguage();
    // Same currency label as /salaries ("IQD" / "د.ع"), isolated so the sign and digits stay put in Arabic.
    const iqd = (n: number, sign = "") => <bdi>{sign}{fmtNumber(n)} {t("common.iqd")}</bdi>;
    return (
        <div className="space-y-6">
            <dl className="divide-y divide-[#F0ECE4] dark:divide-white/5 rounded-2xl border border-[#E8E4DC] dark:border-white/10">
                <div className="flex items-center justify-between px-4 py-3">
                    <dt className="text-sm text-[#6B6B6B] dark:text-gray-400">{t("team.salary.monthly")}</dt>
                    <dd className="text-sm font-semibold tabular-nums text-[#1E1E1E] dark:text-white">{iqd(rate.baseMonthlySalary)}</dd>
                </div>
                <div className="flex items-center justify-between px-4 py-3">
                    <dt className="text-sm text-[#6B6B6B] dark:text-gray-400">{t("team.salary.perOrder")}</dt>
                    <dd className="text-sm font-semibold tabular-nums text-[#1E1E1E] dark:text-white">{iqd(rate.perOrderBonus)}</dd>
                </div>
                <div className="flex items-center justify-between px-4 py-3">
                    <dt className="text-sm text-[#6B6B6B] dark:text-gray-400">{t("team.salary.sourceLabel")}</dt>
                    <dd className="text-xs font-medium px-2 py-0.5 rounded-md bg-[#F5F0E8] dark:bg-white/10 text-[#4A4A4A] dark:text-gray-300">{t(SOURCE_KEYS[rate.source])}</dd>
                </div>
            </dl>
            <button
                type="button"
                onClick={onEdit}
                className="w-full px-4 py-2.5 rounded-xl border border-[#E8E4DC] dark:border-white/10 text-sm font-semibold text-[#1E1E1E] dark:text-white hover:border-[#1E1E1E]/30 transition-colors flex items-center justify-center gap-2"
            >
                <Settings className="w-4 h-4" aria-hidden="true" />
                {t("team.salary.edit")}
            </button>

            <section>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-[#9A9A9A] dark:text-gray-500 mb-2">{t("team.salary.pending")}</h3>
                {pending.length === 0 ? (
                    <p className="text-sm text-[#6B6B6B] dark:text-gray-400 py-3">{t("team.salary.noPending")}</p>
                ) : (
                    <ul className="divide-y divide-[#F0ECE4] dark:divide-white/5">
                        {pending.map((item) => (
                            <li key={`${item.kind}-${item.id}`} className="flex items-center justify-between gap-3 py-2.5">
                                <div className="min-w-0">
                                    <p className="text-sm text-[#1E1E1E] dark:text-gray-100 truncate">{item.reason || t(KIND_KEYS[item.kind])}</p>
                                    {item.reason && <p className="text-xs text-[#9A9A9A] dark:text-gray-500">{t(KIND_KEYS[item.kind])}</p>}
                                </div>
                                <p className={cn("text-sm font-semibold tabular-nums shrink-0", item.kind === "bonus" ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400")}>
                                    {iqd(item.amount, item.kind === "bonus" ? "+" : "−")}
                                </p>
                            </li>
                        ))}
                    </ul>
                )}
            </section>
        </div>
    );
}
