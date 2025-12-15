"use client";

import { useOrders } from "@/hooks/use-orders";
import { useAnalytics } from "@/hooks/use-analytics";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RevenueChart } from "@/components/analytics/revenue-chart";
import { StatusChart } from "@/components/analytics/status-chart";
import { TopCitiesChart } from "@/components/analytics/top-cities-chart";
import { ProductsTable } from "@/components/analytics/products-table";
import { formatIQD } from "@/lib/utils";
import { ArrowLeft, TrendingUp, DollarSign, ShoppingCart } from "lucide-react";
import Link from "next/link";

export default function AnalyticsPage() {
    const { orders, loading } = useOrders();
    const analytics = useAnalytics(orders);

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
                    <p className="text-zinc-400">جاري تحميل التحليلات...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen p-4 md:p-8">
            <div className="max-w-7xl mx-auto space-y-8">
                {/* Header */}
                <header className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold">التحليلات</h1>
                        <p className="text-zinc-400">رؤى ومؤشرات الأداء</p>
                    </div>

                    <Link href="/">
                        <Button variant="outline" className="gap-2">
                            <ArrowLeft className="h-4 w-4" />
                            العودة للوحة التحكم
                        </Button>
                    </Link>
                </header>

                {/* Key Metrics */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Card className="p-6">
                        <div className="flex items-center gap-4">
                            <div className="p-3 rounded-xl bg-primary/10">
                                <DollarSign className="h-6 w-6 text-primary" />
                            </div>
                            <div>
                                <p className="text-sm text-zinc-400">إجمالي الإيرادات</p>
                                <p className="text-2xl font-mono font-bold text-financial">
                                    {formatIQD(analytics.totalRevenue)}
                                </p>
                            </div>
                        </div>
                    </Card>

                    <Card className="p-6">
                        <div className="flex items-center gap-4">
                            <div className="p-3 rounded-xl bg-emerald-500/10">
                                <TrendingUp className="h-6 w-6 text-emerald-500" />
                            </div>
                            <div>
                                <p className="text-sm text-zinc-400">الإيرادات المؤكدة</p>
                                <p className="text-2xl font-mono font-bold text-emerald-500">
                                    {formatIQD(analytics.confirmedRevenue)}
                                </p>
                            </div>
                        </div>
                    </Card>

                    <Card className="p-6">
                        <div className="flex items-center gap-4">
                            <div className="p-3 rounded-xl bg-blue-500/10">
                                <ShoppingCart className="h-6 w-6 text-blue-500" />
                            </div>
                            <div>
                                <p className="text-sm text-zinc-400">متوسط قيمة الطلب</p>
                                <p className="text-2xl font-mono font-bold text-blue-500">
                                    {formatIQD(analytics.averageOrderValue)}
                                </p>
                            </div>
                        </div>
                    </Card>
                </div>

                {/* Revenue Charts */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <RevenueChart
                        data={analytics.dailyRevenue}
                        title="الإيرادات اليومية (آخر 30 يوم)"
                    />
                    <StatusChart data={analytics.statusDistribution} />
                </div>

                {/* Geographic & Products */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <TopCitiesChart data={analytics.topCities} />
                    <ProductsTable data={analytics.topProducts} />
                </div>
            </div>
        </div>
    );
}
