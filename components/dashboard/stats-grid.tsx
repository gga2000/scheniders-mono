"use client";

import { StatsCard } from "./stats-card";
import { formatIQD } from "@/lib/utils";
import {
    ShoppingCart,
    DollarSign,
    CheckCircle2,
    XCircle,
    Clock,
    TrendingUp,
} from "lucide-react";

interface StatsGridProps {
    stats: {
        totalOrders: number;
        totalRevenue: number;
        confirmedRevenue: number;
        todayOrders: number;
        newOrders: number;
        contactedOrders: number;
        confirmedOrders: number;
        rejectedOrders: number;
        deliveredOrders: number;
    };
}

export function StatsGrid({ stats }: StatsGridProps) {
    return (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <StatsCard
                title="إجمالي الطلبات"
                value={stats.totalOrders}
                icon={ShoppingCart}
                description="جميع الطلبات"
            />

            <StatsCard
                title="الإيرادات المؤكدة"
                value={formatIQD(stats.confirmedRevenue)}
                icon={DollarSign}
                variant="financial"
                description="من الطلبات المؤكدة والمسلمة"
            />

            <StatsCard
                title="طلبات جديدة"
                value={stats.newOrders}
                icon={Clock}
                description="تحتاج إلى اتصال"
            />

            <StatsCard
                title="طلبات اليوم"
                value={stats.todayOrders}
                icon={TrendingUp}
                description="الطلبات المستلمة اليوم"
            />

            <StatsCard
                title="تم التواصل"
                value={stats.contactedOrders}
                icon={Clock}
                description="في انتظار التأكيد"
            />

            <StatsCard
                title="مؤكد"
                value={stats.confirmedOrders}
                icon={CheckCircle2}
                description="تم التأكيد"
            />

            <StatsCard
                title="مرفوض"
                value={stats.rejectedOrders}
                icon={XCircle}
                description="طلبات ملغية"
            />

            <StatsCard
                title="تم التوصيل"
                value={stats.deliveredOrders}
                icon={CheckCircle2}
                description="طلبات مكتملة"
            />
        </div>
    );
}
