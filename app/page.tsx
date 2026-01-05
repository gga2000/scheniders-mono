"use client";

import { useState } from "react";
import { StatsGrid } from "@/components/dashboard/stats-grid";
import { OrdersTable } from "@/components/dashboard/orders-table";
import { LiveFeed } from "@/components/dashboard/live-feed";
import { CreateOrderModal } from "@/components/orders/create-order-modal";
import { useOrders } from "@/hooks/use-orders";
import { useStats } from "@/hooks/use-stats";
import { Plus, Search, Bell, User } from "lucide-react";
import { PageGuard } from "@/components/auth/role-guard";

export default function Home() {
  const { orders, loading, error, updateOrderStatus, updateOrder, createOrder } = useOrders();
  const stats = useStats(orders);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--background)]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-full border-4 border-[var(--pastel-yellow)] border-t-transparent animate-spin"></div>
          <p className="text-muted font-medium">جاري تحميل البيانات...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--background)]">
        <div className="pastel-card pastel-card-pink p-8 max-w-md text-center">
          <h2 className="text-xl font-bold text-rose-900 mb-2">خطأ في التحميل</h2>
          <p className="text-rose-700">{error}</p>
        </div>
      </div>
    );
  }

  // Get current greeting based on time
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  };

  return (
    <PageGuard requiredPermission="system.analytics.view">
      <div className="min-h-screen p-6 md:p-8 bg-[var(--background)]">
        <div className="max-w-[1800px] mx-auto space-y-8">

          {/* Top Header Bar */}
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
            {/* Left: Greeting */}
            <div>
              <h1 className="text-3xl md:text-4xl font-bold text-foreground tracking-tight">
                {getGreeting()}, Dr. Ali
              </h1>
              <p className="text-muted mt-2 text-lg">
                Here is what's happening today.
              </p>
            </div>

            {/* Right: Actions */}
            <div className="flex items-center gap-3">
              {/* Search Button */}
              <button className="w-12 h-12 rounded-2xl bg-[var(--card-bg)] border border-[var(--card-border)] flex items-center justify-center text-foreground hover:bg-[var(--background)] transition-all shadow-sm">
                <Search className="w-5 h-5" />
              </button>

              {/* Notifications */}
              <button className="relative w-12 h-12 rounded-2xl bg-[var(--card-bg)] border border-[var(--card-border)] flex items-center justify-center text-foreground hover:bg-[var(--background)] transition-all shadow-sm">
                <Bell className="w-5 h-5" />
                <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-[var(--pastel-pink)] text-[10px] font-bold text-rose-900 flex items-center justify-center">
                  3
                </span>
              </button>

              {/* New Order Button */}
              <button
                onClick={() => setIsCreateModalOpen(true)}
                className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-[var(--button-success)] text-white shadow-lg shadow-green-500/20 hover:bg-[var(--button-success-hover)] hover:shadow-green-500/30 hover:scale-[1.02] transition-all font-semibold"
              >
                <Plus className="h-5 w-5" />
                <span>New Order</span>
              </button>
            </div>
          </div>

          {/* Stats Grid */}
          <StatsGrid stats={stats} />

          {/* Main Content: Orders + Live Feed */}
          <div className="grid grid-cols-1 xl:grid-cols-[1fr_400px] gap-8">
            {/* Orders Table */}
            <OrdersTable
              orders={orders}
              onUpdateStatus={updateOrderStatus}
              onUpdateOrder={updateOrder}
            />

            {/* Live Feed Sidebar - Hidden on mobile, shown on xl+ */}
            <div className="hidden xl:block">
              <LiveFeed />
            </div>
          </div>

          {/* Create Order Modal */}
          <CreateOrderModal
            open={isCreateModalOpen}
            onClose={() => setIsCreateModalOpen(false)}
            onCreate={createOrder}
          />
        </div>
      </div>
    </PageGuard>
  );
}
