"use client";

import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { HourlyCount } from "@/lib/analytics/dashboard-calculations";
import { Clock } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";

interface OrdersPerHourProps {
    data: HourlyCount[];
}

export function OrdersPerHour({ data }: OrdersPerHourProps) {
    const now = new Date();
    const currentHour = now.getHours();
    const total = data.reduce((s, d) => s + d.count, 0);
    const peak = data.length > 0 ? data.reduce((best, d) => (d.count > best.count ? d : best), data[0]) : null;
    const { t } = useLanguage();

    // Show only every 4th label to avoid clutter
    const tickData = data.map((d, i) => ({
        ...d,
        displayLabel: i % 4 === 0 ? d.label : '',
    }));

    return (
        <div className="pastel-card p-5 flex flex-col gap-3">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-[var(--pastel-mint)]/40 flex items-center justify-center">
                        <Clock className="w-4 h-4 text-teal-700" />
                    </div>
                    <div>
                        <h3 className="text-xs font-bold text-foreground uppercase tracking-wider">{t("dashboard.hourly.title")}</h3>
                        <p className="text-[10px] text-muted">{total} {t("dashboard.hourly.orders")} · {t("dashboard.hourly.peakAt")} {peak && peak.count > 0 ? peak.label : '—'}</p>
                    </div>
                </div>
            </div>

            <div className="h-28">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={tickData} margin={{ top: 2, right: 2, left: -30, bottom: 0 }} barCategoryGap="20%">
                        <XAxis
                            dataKey="displayLabel"
                            tick={{ fontSize: 9, fill: 'var(--foreground-subtle)' }}
                            axisLine={false}
                            tickLine={false}
                            interval={0}
                        />
                        <Tooltip
                            content={({ active, payload }) => {
                                if (!active || !payload?.length) return null;
                                const d = data[payload[0]?.payload?.hour ?? 0];
                                return (
                                    <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl px-2 py-1 text-xs shadow-lg">
                                        <span className="font-semibold">{d?.label}: {d?.count} {t("dashboard.hourly.orders")}</span>
                                    </div>
                                );
                            }}
                            cursor={{ fill: 'var(--card-border)', opacity: 0.5 }}
                        />
                        <Bar dataKey="count" radius={[3, 3, 0, 0]} maxBarSize={20}>
                            {tickData.map((entry) => (
                                <Cell
                                    key={entry.hour}
                                    fill={
                                        peak && entry.hour === peak.hour && peak.count > 0
                                            ? 'var(--pastel-green)'
                                            : entry.hour === currentHour
                                            ? 'var(--pastel-yellow)'
                                            : 'var(--pastel-mint)'
                                    }
                                />
                            ))}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}
