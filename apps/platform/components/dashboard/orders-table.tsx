"use client";

import { useState } from "react";
import type { Order } from "@/lib/supabase";
import { OrderDetailsModal } from "@/components/orders/order-details-modal";
import { SwipeableOrderCard } from "@/components/dashboard/swipeable-order-card";
import { normalizePhoneForSearch } from "@/lib/order-utils";
import { Search, Filter } from "lucide-react";
import { motion, AnimatePresence, LayoutGroup } from "framer-motion";
import { usePrompt } from "@scheniders/ui/prompt-dialog";

interface OrdersTableProps {
    orders: Order[];
    onUpdateStatus: (orderId: string, status: Order["status"], rejectionReason?: string) => Promise<{ success: boolean; error?: string }>;
    onUpdateOrder: (orderId: string, updates: Partial<Order>) => Promise<{ success: boolean; error?: string }>;
}

export function OrdersTable({ orders, onUpdateStatus, onUpdateOrder }: OrdersTableProps) {
    const [filter, setFilter] = useState<Order["status"] | "all">("all");
    const [searchQuery, setSearchQuery] = useState("");
    const [loading, setLoading] = useState<string | null>(null);
    const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const { promptUser, PromptComponent } = usePrompt();

    // Derive the freshest order object from the live orders array
    const selectedOrder = orders.find(o => o.id === selectedOrderId) || null;

    const filteredOrders = orders.filter((order) => {
        const matchesFilter = filter === "all" || order.status === filter;
        const matchesSearch =
            order.customer_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            normalizePhoneForSearch(order.phone).includes(normalizePhoneForSearch(searchQuery));
        return matchesFilter && matchesSearch;
    });

    const handleStatusUpdate = async (
        orderId: string,
        status: Order["status"]
    ) => {
        setLoading(orderId);

        let rejectionReason: string | undefined;

        if (status === "rejected") {
            const promptResult = await promptUser({
                title: "تأكيد الرفض",
                description: "يرجى كتابة سبب الرفض (اختياري)",
                placeholder: "سبب الرفض..."
            });
            
            if (promptResult === null) {
                // User cancelled the prompt
                setLoading(null);
                return;
            }
            
            rejectionReason = promptResult || undefined;
        }

        const result = await onUpdateStatus(orderId, status, rejectionReason);

        if (!result.success) {
            alert(`فشل تحديث الحالة: ${result.error}`);
        }

        setLoading(null);
    };

    const filterOptions = [
        { id: "all", label: "الكل", labelEn: "All" },
        { id: "new", label: "جديد", labelEn: "New" },
        { id: "contacted", label: "تم الاتصال", labelEn: "Contacted" },
        { id: "confirmed", label: "مؤكد", labelEn: "Confirmed" },
        { id: "delivered", label: "تم التوصيل", labelEn: "Delivered" },
        { id: "rejected", label: "مرفوض", labelEn: "Rejected" },
        { id: "suspended", label: "طلب معلق", labelEn: "Suspended" },
    ];

    return (
        <>
            <div className="space-y-6">
                {/* Header Card - Pastel White */}
                <div className="pastel-card p-6">
                    {/* Title Row */}
                    <div className="flex items-center justify-between mb-6">
                        <div>
                            <h2 className="text-2xl font-bold text-foreground tracking-tight">
                                الطلبات
                            </h2>
                            <p className="text-sm text-muted mt-1">
                                Manage and track all orders
                            </p>
                        </div>
                        <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-[var(--background)] border border-[var(--card-border)]">
                            <span className="text-lg font-bold text-foreground">{filteredOrders.length}</span>
                            <span className="text-sm text-subtle">/</span>
                            <span className="text-sm text-subtle">{orders.length}</span>
                        </div>
                    </div>

                    {/* Search and Filters */}
                    <div className="flex flex-col xl:flex-row gap-4">
                        {/* Search Input */}
                        <div className="relative flex-1">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-[var(--foreground-subtle)]" />
                            <input
                                type="text"
                                placeholder="بحث بالاسم أو رقم الهاتف..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full pl-12 pr-4 py-3 bg-[var(--background)] border border-[var(--card-border)] rounded-2xl text-foreground placeholder:text-[var(--foreground-subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] focus:border-transparent transition-all"
                            />
                        </div>

                        {/* Filter Pills */}
                        <div className="flex gap-2 overflow-x-auto pb-2 xl:pb-0 scrollbar-hide">
                            {filterOptions.map((item) => (
                                <button
                                    key={item.id}
                                    onClick={() => setFilter(item.id as Order["status"] | "all")}
                                    className={`
                                        px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all
                                        ${filter === item.id
                                            ? "bg-[var(--ink)] text-white shadow-md"
                                            : "bg-[var(--background)] text-[var(--foreground-muted)] hover:bg-[var(--card-border)] border border-[var(--card-border)]"
                                        }
                                    `}
                                >
                                    {item.label}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Orders List */}
                <LayoutGroup>
                    <motion.div layout className="flex flex-col gap-4">
                        <AnimatePresence mode="popLayout" initial={false}>
                            {filteredOrders.length === 0 ? (
                                <motion.div
                                    initial={{ opacity: 0, scale: 0.95 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.95 }}
                                    className="pastel-card p-12 text-center"
                                >
                                    <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[var(--background)] flex items-center justify-center">
                                        <Filter className="h-8 w-8 text-[var(--foreground-subtle)]" />
                                    </div>
                                    <p className="text-lg font-medium text-foreground mb-1">لا توجد طلبات</p>
                                    <p className="text-sm text-muted">لا توجد طلبات تطابق بحثك</p>
                                </motion.div>
                            ) : (
                                filteredOrders.map((order) => (
                                    <motion.div
                                        layout
                                        key={order.id}
                                        initial={{ opacity: 0, y: 20 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, x: -100, transition: { duration: 0.2 } }}
                                        transition={{
                                            layout: { type: "spring", stiffness: 300, damping: 30 },
                                            opacity: { duration: 0.2 }
                                        }}
                                    >
                                        <SwipeableOrderCard
                                            order={order}
                                            loadingId={loading}
                                            onStatusUpdate={handleStatusUpdate}
                                            onViewDetails={(o) => {
                                                setSelectedOrderId(o.id);
                                                setIsModalOpen(true);
                                            }}
                                        />
                                    </motion.div>
                                ))
                            )}
                        </AnimatePresence>
                    </motion.div>
                </LayoutGroup>
            </div>

            {/* Order Details Modal */}
            <OrderDetailsModal
                order={selectedOrder}
                open={isModalOpen}
                onClose={() => {
                    setIsModalOpen(false);
                    setSelectedOrderId(null);
                }}
                onUpdate={onUpdateOrder}
                onStatusUpdate={onUpdateStatus}
            />
            
            <PromptComponent />
        </>
    );
}
