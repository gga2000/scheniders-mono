"use client";

import { WowMetric } from "@/lib/analytics/dashboard-calculations";
import { TrendingUp, TrendingDown, Minus, ArrowRight } from "lucide-react";
import { FinancialValue } from "@/components/ui/financial-value";
import { useLanguage } from "@/hooks/use-language";

interface WeekOverWeekProps {
    metrics: WowMetric[];
}

// Map original English labels to i18n keys
const LABEL_KEYS: Record<string, string> = {
    'Orders': 'dashboard.wow.orders',
    'Delivery Rate': 'dashboard.wow.deliveryRate',
    'Revenue': 'dashboard.wow.revenue',
};

function DeltaPill({ delta, deltaPct, unit }: { delta: number; deltaPct: number | null; unit?: string }) {
    const { t } = useLanguage();
    if (delta === 0) return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 text-gray-500">
            <Minus className="w-2.5 h-2.5" /> {t("dashboard.wow.same")}
        </span>
    );
    const up = delta > 0;
    const label = deltaPct !== null
        ? `${up ? '+' : ''}${deltaPct}%`
        : `${up ? '+' : ''}${Math.abs(delta)}${unit ?? ''}pp`;
    return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${up ? 'bg-green-100 text-green-700' : 'bg-rose-100 text-rose-700'}`}>
            {up ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
            {label}
        </span>
    );
}

export function WeekOverWeek({ metrics }: WeekOverWeekProps) {
    const { t } = useLanguage();

    return (
        <div className="pastel-card pastel-card-blue p-5 md:p-6 h-full flex flex-col">
            <div className="mb-4">
                <h3 className="text-sm font-bold text-blue-950">{t("dashboard.wow.title")}</h3>
                <p className="text-xs text-blue-900/50">{t("dashboard.wow.subtitle")}</p>
            </div>

            <div className="flex flex-col gap-4 flex-1 justify-center">
                {metrics.map((m) => {
                    const translatedLabel = LABEL_KEYS[m.label] ? t(LABEL_KEYS[m.label]) : m.label;
                    const fmtPlain = (n: number) => m.unit === '%' ? `${n}%` : n.toLocaleString();

                    return (
                        <div key={m.label} className="flex items-center justify-between gap-3">
                            <div className="flex-1 min-w-0">
                                <p className="text-[10px] font-bold text-blue-900/60 uppercase tracking-wider mb-0.5">{translatedLabel}</p>
                                <div className="flex items-center gap-2 flex-wrap">
                                    {m.isFinancial
                                        ? <FinancialValue amount={m.current} className="text-xl font-bold text-blue-950 leading-none" iconSize={14} />
                                        : <span className="text-xl font-bold text-blue-950 leading-none">{fmtPlain(m.current)}</span>}
                                    <DeltaPill delta={m.delta} deltaPct={m.deltaPct} unit={m.unit} />
                                </div>
                                <div className="flex items-center gap-1 mt-1 text-[10px] text-blue-900/40">
                                    <span>{t("dashboard.wow.prev")}</span>
                                    {m.isFinancial
                                        ? <FinancialValue amount={m.previous} hideToggle className="text-[10px] text-blue-900/40" />
                                        : <span>{fmtPlain(m.previous)}</span>}
                                    <ArrowRight className="w-2.5 h-2.5" />
                                    {m.isFinancial
                                        ? <FinancialValue amount={m.current} hideToggle className="text-[10px] text-blue-900/40" />
                                        : <span>{fmtPlain(m.current)}</span>}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
