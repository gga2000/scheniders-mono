"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { Order } from "@/lib/supabase";
import { OrderDetailsModal } from "@/components/orders/order-details-modal";
import { OrderCard } from "@/components/dashboard/order-card"; // Import the new Card

interface OrdersTableProps {
    orders: Order[];
    onUpdateStatus: (orderId: string, status: Order["status"], rejectionReason?: string) => Promise<{ success: boolean; error?: string }>;
    onUpdateOrder: (orderId: string, updates: Partial<Order>) => Promise<{ success: boolean; error?: string }>;
}

export function OrdersTable({ orders, onUpdateStatus, onUpdateOrder }: OrdersTableProps) {
    const [filter, setFilter] = useState<Order["status"] | "all">("all");
    const [searchQuery, setSearchQuery] = useState("");
    const [loading, setLoading] = useState<string | null>(null);
    const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);

    const filteredOrders = orders.filter((order) => {
        const matchesFilter = filter === "all" || order.status === filter;
        const matchesSearch =
            order.customer_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            order.phone.includes(searchQuery);
        return matchesFilter && matchesSearch;
    });

    const handleStatusUpdate = async (
        orderId: string,
        status: Order["status"]
    ) => {
        setLoading(orderId);

        let rejectionReason: string | undefined;

        if (status === "rejected") {
            const promptResult = prompt("سبب الرفض (اختياري):");
            rejectionReason = promptResult !== null ? promptResult : undefined;
        }

        const result = await onUpdateStatus(orderId, status, rejectionReason);

        if (!result.success) {
            alert(`فشل تحديث الحالة: ${result.error}`);
        }

        setLoading(null);
    };

    return (
        <>
            <div className="space-y-6">
                {/* Header with filters */}
                <div className="glass-card p-6 flex flex-col gap-6">
                    <div className="flex items-center justify-between">
                        <h2 className="text-2xl font-bold bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent">
                            الطلبات
                        </h2>
                        <div className="text-sm font-mono text-zinc-400">
                            {filteredOrders.length} / {orders.length}
                        </div>
                    </div>

                    {/* Search and Filters */}
                    <div className="flex flex-col xl:flex-row gap-4">
                        <input
                            type="text"
                            placeholder="بحث بالاسم أو رقم الهاتف..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="flex-1 px-4 py-2.5 bg-black/20 border border-white/10 rounded-lg text-foreground placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 transition-all"
                        />

                        <div className="flex gap-2 overflow-x-auto pb-2 xl:pb-0 scrollbar-hide">
                            {[
                                { id: "all", label: "الكل" },
                                { id: "new", label: "جديد" },
                                { id: "contacted", label: "تم الاتصال" },
                                { id: "confirmed", label: "مؤكد" },
                                { id: "delivered", label: "تم التوصيل" },
                                { id: "rejected", label: "مرفوض" },
                            ].map((item) => (
                                <button
                                    key={item.id}
                                    onClick={() => setFilter(item.id as Order["status"] | "all")}
                                    className={`
                                        px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-all
                                        ${filter === item.id
                                            ? "bg-white/10 text-white shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1)] border border-white/10"
                                            : "text-zinc-500 hover:text-zinc-200 hover:bg-white/5"}
                                    `}
                                >
                                    {item.label}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Orders Grid/List */}
                <div className="flex flex-col gap-4">
                    {filteredOrders.length === 0 ? (
                        <div className="glass-card p-12 text-center text-zinc-500">
                            لا توجد طلبات تطابق بحثك
                        </div>
                    ) : (
                        filteredOrders.map((order) => (
                            <OrderCard
                                key={order.id}
                                order={order}
                                loadingId={loading}
                                onStatusUpdate={handleStatusUpdate}
                                onViewDetails={(o) => {
                                    setSelectedOrder(o);
                                    setIsModalOpen(true);
                                }}
                            />
                        ))
                    )}
                </div>
            </div>

            {/* Order Details Modal */}
            <OrderDetailsModal
                order={selectedOrder}
                open={isModalOpen}
                onClose={() => {
                    setIsModalOpen(false);
                    setSelectedOrder(null);
                }}
                onUpdate={onUpdateOrder}
            />
        </>
    );
}
