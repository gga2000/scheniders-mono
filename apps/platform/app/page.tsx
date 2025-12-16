"use client"; // Force recompile

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
        {/* Page Title Section */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-zinc-900 to-zinc-600 bg-clip-text text-transparent">
              Good morning, Dr. Ali
            </h1>
            <p className="text-zinc-500 font-medium mt-1">
              Here is what's happening today.
            </p>
          </div>

          {/* Quick Action - Create Order is still useful here */}
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="flex items-center gap-2 px-6 py-3 rounded-full bg-zinc-900 text-white shadow-lg shadow-zinc-900/10 hover:bg-zinc-800 hover:scale-105 transition-all font-medium"
          >
            <Plus className="h-4 w-4" />
            New Order
          </button>
        </div>

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
