"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
    Package,
    AlertTriangle,
    XCircle,
    Clock,
    Truck,
    Activity,
} from "lucide-react";
import { cn, formatIQD } from "@/lib/utils";
import { supabase, Product } from "@/lib/supabase";
import { useAuth } from "@/components/auth/auth-provider";
import { fetchPurchaseOrderCosts } from "@/lib/repositories/purchase-costs";

interface SuppliesKpiStripProps {
    supplies: Product[];
}

function MiniSparkline({
    data,
    color = "currentColor",
    width = 54,
    height = 20,
}: {
    data: number[];
    color?: string;
    width?: number;
    height?: number;
}) {
    if (data.length < 2) return null;
    const max = Math.max(...data);
    const min = Math.min(...data);
    const range = max - min || 1;
    const points = data
        .map((v, i) => {
            const x = (i / (data.length - 1)) * width;
            const y = height - ((v - min) / range) * (height - 2) - 1;
            return `${x},${y}`;
        })
        .join(" ");
    return (
        <svg
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            className="shrink-0 opacity-80"
        >
            <polyline
                points={points}
                fill="none"
                stroke={color}
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}

function MiniBars({
    data,
    color = "currentColor",
    width = 54,
    height = 20,
}: {
    data: number[];
    color?: string;
    width?: number;
    height?: number;
}) {
    if (data.length === 0) return null;
    const max = Math.max(...data, 1);
    const gap = 1.5;
    const barWidth = Math.max(1, (width - gap * (data.length - 1)) / data.length);
    return (
        <svg
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            className="shrink-0 opacity-80"
        >
            {data.map((v, i) => {
                const h = Math.max(1, (v / max) * (height - 1));
                const x = i * (barWidth + gap);
                const y = height - h;
                return (
                    <rect
                        key={i}
                        x={x}
                        y={y}
                        width={barWidth}
                        height={h}
                        rx={0.75}
                        fill={color}
                    />
                );
            })}
        </svg>
    );
}

interface TileProps {
    label: string;
    value: string;
    sub?: string;
    icon: React.ElementType;
    iconBg: string;
    iconColor: string;
    tileClass: string;
    sparkline?: React.ReactNode;
    emphasis?: boolean;
}

function Tile({
    label,
    value,
    sub,
    icon: Icon,
    iconBg,
    iconColor,
    tileClass,
    sparkline,
    emphasis,
}: TileProps) {
    return (
        <div
            className={cn(
                "relative rounded-2xl border p-4 transition-all duration-200",
                "hover:shadow-md",
                tileClass,
                emphasis && "ring-1 ring-rose-200"
            )}
        >
            <div className="flex items-start justify-between">
                <div
                    className={cn(
                        "w-9 h-9 rounded-xl flex items-center justify-center",
                        iconBg
                    )}
                >
                    <Icon className={cn("w-4.5 h-4.5", iconColor)} />
                </div>
                {sparkline}
            </div>
            <p className="text-2xl font-bold mt-3 leading-none">{value}</p>
            <p className="text-[11px] uppercase tracking-wide text-muted mt-2 font-medium">
                {label}
            </p>
            {sub && <p className="text-[11px] text-muted mt-1">{sub}</p>}
        </div>
    );
}

function daysOfSupplyFor(p: Product): number | null {
    if (p.stock_quantity <= 0) return null;
    const timesSold = p.times_sold_30d ?? 0;
    if (timesSold <= 0) return null;
    const daily = timesSold / 30;
    if (daily <= 0) return null;
    const available = Math.max(0, p.stock_quantity - (p.reserved_quantity || 0));
    return Math.round(available / daily);
}

export function SuppliesKpiStrip({ supplies }: SuppliesKpiStripProps) {
    const { tenantId } = useAuth();

    const stats = useMemo(() => {
        let inventoryValue = 0;
        let atRisk = 0;
        let outOfStock = 0;
        let daysSum = 0;
        let daysDenom = 0;
        const valueBuckets = new Array(7).fill(0);
        const atRiskBuckets = new Array(7).fill(0);
        const daysBuckets = new Array(7).fill(0);

        supplies.forEach((p, i) => {
            const stock = p.stock_quantity ?? 0;
            const cost = p.cost ?? 0;
            const threshold = p.reorder_point ?? p.low_stock_threshold ?? 5;
            const value = stock * cost;
            inventoryValue += value;

            if (stock === 0) outOfStock++;
            else if (stock <= threshold) atRisk++;

            const days = daysOfSupplyFor(p);
            const rate = (p.times_sold_30d ?? 0) / 30;
            if (days !== null && rate > 0) {
                daysSum += days * rate;
                daysDenom += rate;
            }

            const b = i % 7;
            valueBuckets[b] += value;
            if (stock <= threshold && stock > 0) atRiskBuckets[b] += 1;
            if (days !== null) daysBuckets[b] += days;
        });

        const avgDays = daysDenom > 0 ? Math.round(daysSum / daysDenom) : null;

        return {
            inventoryValue,
            atRisk,
            outOfStock,
            avgDays,
            valueBuckets,
            atRiskBuckets,
            daysBuckets,
        };
    }, [supplies]);

    // Open POs: count drafts/sent; also sum total_cost for subtitle.
    const { data: poData } = useQuery({
        queryKey: ["supplies-open-pos", tenantId],
        queryFn: async () => {
            if (!tenantId) return { count: 0, totalCost: null };
            const { data, error } = await supabase
                .from("purchase_orders")
                .select("id,status")
                .eq("tenant_id", tenantId)
                .in("status", ["draft", "sent", "partial"]);
            if (error) throw error;
            const list = data ?? [];
            // total_cost is not a readable column. A member who may not see
            // cost gets no totals back, which must read as unknown, not 0.
            const costs = await fetchPurchaseOrderCosts(tenantId);
            const known = list.filter((po) => costs.get(po.id) != null);
            return {
                count: list.length,
                totalCost: known.length > 0 ? known.reduce((sum, po) => sum + (costs.get(po.id) ?? 0), 0) : null,
            };
        },
        enabled: !!tenantId,
        staleTime: 60_000,
    });

    // Consumption this week: sum |quantity_change| for sales on supplies (last 7d).
    const supplyIds = useMemo(() => supplies.map((s) => s.id), [supplies]);
    const { data: consumption } = useQuery({
        queryKey: ["supplies-consumption-7d", tenantId, supplyIds.length],
        queryFn: async () => {
            if (!tenantId || supplyIds.length === 0) return { total: 0, days: [0, 0, 0, 0, 0, 0, 0] };
            const since = new Date();
            since.setDate(since.getDate() - 6);
            since.setHours(0, 0, 0, 0);
            const { data, error } = await supabase
                .from("inventory_history")
                .select("quantity_change,change_type,created_at,product_id")
                .in("product_id", supplyIds)
                .eq("change_type", "sale")
                .gte("created_at", since.toISOString());
            if (error) throw error;
            const rows =
                (data as { quantity_change: number; created_at: string }[]) ?? [];
            const days = new Array(7).fill(0);
            const startDay = new Date(since).getTime();
            let total = 0;
            for (const r of rows) {
                const units = Math.abs(r.quantity_change ?? 0);
                total += units;
                const d = Math.floor((new Date(r.created_at).getTime() - startDay) / 86400000);
                if (d >= 0 && d < 7) days[d] += units;
            }
            return { total, days };
        },
        enabled: !!tenantId,
        staleTime: 60_000,
    });

    return (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
            <Tile
                label="On-hand value"
                value={formatIQD(stats.inventoryValue)}
                sub={`${supplies.length} ${supplies.length === 1 ? "supply" : "supplies"}`}
                icon={Package}
                iconBg="bg-teal-500/15"
                iconColor="text-teal-600"
                tileClass="bg-gradient-to-br from-teal-50 to-white border-teal-100"
                sparkline={<MiniSparkline data={stats.valueBuckets} color="#0d9488" />}
            />

            <Tile
                label="At risk"
                value={stats.atRisk.toString()}
                sub="At or below reorder point"
                icon={AlertTriangle}
                iconBg="bg-amber-500/15"
                iconColor="text-amber-600"
                tileClass="bg-gradient-to-br from-amber-50 to-white border-amber-100"
                sparkline={<MiniBars data={stats.atRiskBuckets} color="#d97706" />}
            />

            <Tile
                label="Out of stock"
                value={stats.outOfStock.toString()}
                sub={stats.outOfStock > 0 ? "Needs immediate attention" : "All stocked"}
                icon={XCircle}
                iconBg="bg-rose-500/15"
                iconColor="text-rose-600"
                tileClass="bg-gradient-to-br from-rose-50 to-white border-rose-100"
                emphasis={stats.outOfStock > 0}
            />

            <Tile
                label="Days of coverage"
                value={stats.avgDays !== null ? `${stats.avgDays}d` : "—"}
                sub={stats.avgDays !== null ? "Weighted by consumption" : "No sales data yet"}
                icon={Clock}
                iconBg="bg-sky-500/15"
                iconColor="text-sky-600"
                tileClass="bg-gradient-to-br from-sky-50 to-white border-sky-100"
                sparkline={<MiniSparkline data={stats.daysBuckets} color="#0284c7" />}
            />

            <Tile
                label="Open POs"
                value={(poData?.count ?? 0).toString()}
                sub={poData && poData.totalCost !== null && poData.totalCost > 0 ? formatIQD(poData.totalCost) : poData && poData.count > 0 ? undefined : "No open orders"}
                icon={Truck}
                iconBg="bg-indigo-500/15"
                iconColor="text-indigo-600"
                tileClass="bg-gradient-to-br from-indigo-50 to-white border-indigo-100"
            />

            <Tile
                label="Consumed / 7d"
                value={(consumption?.total ?? 0).toLocaleString()}
                sub="Units deducted last 7 days"
                icon={Activity}
                iconBg="bg-violet-500/15"
                iconColor="text-violet-600"
                tileClass="bg-gradient-to-br from-violet-50 to-white border-violet-100"
                sparkline={<MiniBars data={consumption?.days ?? []} color="#7c3aed" />}
            />
        </div>
    );
}
