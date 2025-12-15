"use client";

import { useState } from "react";
import { StatsGrid } from "@/components/dashboard/stats-grid";
import { OrdersTable } from "@/components/dashboard/orders-table";
import { CreateOrderModal } from "@/components/orders/create-order-modal";
import { useOrders } from "@/hooks/use-orders";
import { useStats } from "@/hooks/use-stats";
import { Package, Plus, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function Home() {
  const { orders, loading, error, updateOrderStatus, updateOrder, createOrder } = useOrders();
  const stats = useStats(orders);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
          <p className="text-zinc-400">جاري تحميل البيانات...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="glass-card p-8 max-w-md text-center">
          <h2 className="text-xl font-bold text-destructive mb-2">خطأ في التحميل</h2>
          <p className="text-zinc-400">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <header className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="glass-card p-3 rounded-xl">
              <Package className="h-8 w-8 text-primary" />
            </div>
            <div>
              <h1 className="text-3xl font-bold">Schenider Team</h1>
              <p className="text-zinc-400">لوحة تحكم إدارة الطلبات</p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-3">
            <Link href="/analytics">
              <Button
                size="lg"
                variant="outline"
                className="gap-2"
              >
                <BarChart3 className="h-5 w-5" />
                التحليلات
              </Button>
            </Link>

            <Button
              size="lg"
              variant="primary"
              onClick={() => setIsCreateModalOpen(true)}
              className="gap-2 shadow-lg shadow-primary/20"
            >
              <Plus className="h-5 w-5" />
              طلب جديد
            </Button>
          </div>
        </header>

        {/* Stats Grid */}
        <StatsGrid stats={stats} />

        {/* Orders Table */}
        <OrdersTable
          orders={orders}
          onUpdateStatus={updateOrderStatus}
          onUpdateOrder={updateOrder}
        />

        {/* Create Order Modal */}
        <CreateOrderModal
          open={isCreateModalOpen}
          onClose={() => setIsCreateModalOpen(false)}
          onCreate={createOrder}
        />
      </div>
    </div>
  );
}
