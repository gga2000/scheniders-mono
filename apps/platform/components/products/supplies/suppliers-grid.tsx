"use client";

import { useMemo } from "react";
import {
    Clock,
    FileText,
    Mail,
    Package,
    Phone,
    TrendingUp,
    Truck,
    Users,
} from "lucide-react";
import { cn, formatIQD } from "@/lib/utils";
import type { AggregatedSupplier } from "@/lib/utils/suppliers-aggregate";
import { SupplierInitialsBadge } from "./supplier-initials-badge";
import { useLanguage } from "@/hooks/use-language";

interface SuppliersGridProps {
    suppliers: AggregatedSupplier[];
    onSelect?: (supplier: AggregatedSupplier) => void;
    searchQuery?: string;
}

function relativeDate(iso: string | null, t: (key: string, vars?: Record<string, string | number>) => string): string {
    if (!iso) return "—";
    const then = new Date(iso).getTime();
    if (Number.isNaN(then)) return "—";
    const days = Math.round((Date.now() - then) / (1000 * 60 * 60 * 24));
    if (days < 1) return t("supplies.rel.today");
    if (days === 1) return t("supplies.rel.oneDay");
    if (days < 30) return t("supplies.rel.days", { count: days });
    if (days < 365) return t("supplies.rel.months", { count: Math.round(days / 30) });
    return t("supplies.rel.years", { count: Math.round(days / 365) });
}

export function SuppliersGrid({ suppliers, onSelect, searchQuery = "" }: SuppliersGridProps) {
    const { t } = useLanguage();
    const filtered = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        if (!q) return suppliers;
        return suppliers.filter(
            (s) =>
                s.name.toLowerCase().includes(q) ||
                s.email.toLowerCase().includes(q) ||
                s.contact.toLowerCase().includes(q)
        );
    }, [suppliers, searchQuery]);

    if (filtered.length === 0) {
        return (
            <div className="pastel-card p-12 text-center">
                <Users className="h-12 w-12 text-muted mx-auto mb-4" />
                <p className="text-lg font-medium">
                    {searchQuery ? t("supplies.suppliers.noMatch") : t("supplies.suppliers.none")}
                </p>
                <p className="text-sm text-muted mt-1">
                    {searchQuery
                        ? t("supplies.suppliers.tryOther")
                        : t("supplies.suppliers.noneHint")}
                </p>
            </div>
        );
    }

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map((s) => (
                <SupplierCard key={s.key} supplier={s} onSelect={onSelect} />
            ))}
        </div>
    );
}

interface SupplierCardProps {
    supplier: AggregatedSupplier;
    onSelect?: (supplier: AggregatedSupplier) => void;
}

function SupplierCard({ supplier, onSelect }: SupplierCardProps) {
    const { t } = useLanguage();
    const handleClick = onSelect ? () => onSelect(supplier) : undefined;

    return (
        <button
            type="button"
            onClick={handleClick}
            className={cn(
                "group relative text-left overflow-hidden rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] p-4 shadow-sm transition-all duration-200",
                "hover:-translate-y-0.5 hover:border-teal-200 hover:shadow-lg hover:shadow-teal-500/5"
            )}
        >
            <div
                className="pointer-events-none absolute inset-x-0 top-0 h-px"
                style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.6), transparent)" }}
            />

            <div className="flex items-start gap-3">
                <SupplierInitialsBadge name={supplier.name} size="md" />
                <div className="min-w-0 flex-1">
                    <h3 className="font-semibold text-[15px] leading-tight truncate">{supplier.name}</h3>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
                        {supplier.email && (
                            <span className="inline-flex items-center gap-1">
                                <Mail className="w-3 h-3" />
                                <span className="truncate max-w-[160px]">{supplier.email}</span>
                            </span>
                        )}
                        {supplier.contact && (
                            <span className="inline-flex items-center gap-1">
                                <Phone className="w-3 h-3" />
                                <span className="truncate max-w-[120px]">{supplier.contact}</span>
                            </span>
                        )}
                    </div>
                </div>
                {supplier.openPoCount > 0 && (
                    <span className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 ring-1 ring-sky-200 text-[10px] font-medium">
                        <Truck className="w-2.5 h-2.5" />
                        {t("supplies.suppliers.openCount", { count: supplier.openPoCount })}
                    </span>
                )}
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 text-left">
                <Stat
                    icon={Package}
                    label={t("supplies.suppliers.stat.supplies")}
                    value={supplier.supplies.length.toString()}
                />
                <Stat
                    icon={Clock}
                    label={t("supplies.suppliers.stat.leadTime")}
                    value={
                        supplier.avgLeadTimeDays != null
                            ? t("supplies.sp.leadDays", { n: supplier.avgLeadTimeDays })
                            : "—"
                    }
                />
                <Stat
                    icon={FileText}
                    label={t("supplies.suppliers.stat.lastOrder")}
                    value={relativeDate(supplier.lastOrderAt, t)}
                />
                <Stat
                    icon={TrendingUp}
                    label={t("supplies.suppliers.stat.ytd")}
                    value={formatIQD(supplier.ytdSpend || 0)}
                />
            </div>
        </button>
    );
}

function Stat({
    icon: Icon,
    label,
    value,
}: {
    icon: typeof Package;
    label: string;
    value: string;
}) {
    return (
        <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 shrink-0 rounded-lg bg-teal-50 text-teal-600 flex items-center justify-center">
                <Icon className="w-3.5 h-3.5" />
            </div>
            <div className="min-w-0">
                <p className="text-[10px] text-muted uppercase tracking-wide leading-none">{label}</p>
                <p className="font-semibold text-sm truncate tabular-nums">{value}</p>
            </div>
        </div>
    );
}
