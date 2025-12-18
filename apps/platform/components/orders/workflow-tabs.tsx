"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Phone, Package, Truck, CheckCircle, XCircle, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Order } from "@/lib/supabase";

// Import tab components (will be created)
import { ConfirmTab } from "./workflow/confirm-tab";
import { FulfillTab } from "./workflow/fulfill-tab";
import { DeliveryTab } from "./workflow/delivery-tab";

interface WorkflowTabsProps {
    orders: Order[];
    onStatusUpdate: (orderId: string, status: Order["status"], reason?: string) => Promise<{ success: boolean; error?: string }>;
    onUpdate: (orderId: string, updates: Partial<Order>) => Promise<{ success: boolean; error?: string }>;
    onViewDetails: (order: Order) => void;
    isBlacklisted: (phone: string) => boolean;
}

type WorkflowTab = "confirm" | "fulfill" | "delivery";

const tabConfig: Record<WorkflowTab, {
    label: string;
    labelAr: string;
    icon: typeof Phone;
    color: string;
    bgColor: string;
    description: string;
}> = {
    confirm: {
        label: "Confirm",
        labelAr: "تأكيد",
        icon: Phone,
        color: "text-blue-600",
        bgColor: "bg-blue-100",
        description: "Contact customers & confirm orders",
    },
    fulfill: {
        label: "Fulfill",
        labelAr: "تجهيز",
        icon: Package,
        color: "text-purple-600",
        bgColor: "bg-purple-100",
        description: "Pack orders & prepare for shipping",
    },
    delivery: {
        label: "Delivery",
        labelAr: "توصيل",
        icon: Truck,
        color: "text-teal-600",
        bgColor: "bg-teal-100",
        description: "Track deliveries & handle returns",
    },
};

export function WorkflowTabs({
    orders,
    onStatusUpdate,
    onUpdate,
    onViewDetails,
    isBlacklisted,
}: WorkflowTabsProps) {
    const [activeTab, setActiveTab] = useState<WorkflowTab>("confirm");

    // Filter orders by workflow stage
    const confirmOrders = orders.filter(o => o.status === "new" || o.status === "contacted");
    const fulfillOrders = orders.filter(o => o.status === "confirmed");
    const deliveryOrders = orders.filter(o => o.status === "delivered" || (o as Order & { shipping_status?: string }).shipping_status === "shipped");

    const orderCounts: Record<WorkflowTab, number> = {
        confirm: confirmOrders.length,
        fulfill: fulfillOrders.length,
        delivery: deliveryOrders.length,
    };

    const tabs: WorkflowTab[] = ["confirm", "fulfill", "delivery"];

    return (
        <div className="space-y-6">
            {/* Tab Headers */}
            <div className="bg-white rounded-2xl border border-[var(--card-border)] p-2 shadow-sm">
                <div className="grid grid-cols-3 gap-2">
                    {tabs.map((tab) => {
                        const config = tabConfig[tab];
                        const Icon = config.icon;
                        const isActive = activeTab === tab;
                        const count = orderCounts[tab];

                        return (
                            <button
                                key={tab}
                                onClick={() => setActiveTab(tab)}
                                className={cn(
                                    "relative flex flex-col items-center gap-1 p-4 rounded-xl transition-all",
                                    isActive
                                        ? `${config.bgColor} ${config.color} shadow-sm`
                                        : "text-muted hover:bg-gray-50"
                                )}
                            >
                                <div className="flex items-center gap-2">
                                    <Icon className="w-5 h-5" />
                                    <span className="font-semibold">{config.label}</span>
                                </div>
                                <span className="text-xs opacity-75">{config.labelAr}</span>

                                {/* Count Badge */}
                                <span className={cn(
                                    "absolute -top-1 -right-1 min-w-[24px] h-6 flex items-center justify-center px-2 rounded-full text-xs font-bold",
                                    isActive
                                        ? "bg-white text-foreground shadow-sm"
                                        : "bg-gray-200 text-gray-600"
                                )}>
                                    {count}
                                </span>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Tab Description */}
            <p className="text-sm text-muted text-center">
                {tabConfig[activeTab].description}
            </p>

            {/* Tab Content */}
            <AnimatePresence mode="wait">
                <motion.div
                    key={activeTab}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.2 }}
                >
                    {activeTab === "confirm" && (
                        <ConfirmTab
                            orders={confirmOrders}
                            onStatusUpdate={onStatusUpdate}
                            onViewDetails={onViewDetails}
                            isBlacklisted={isBlacklisted}
                        />
                    )}
                    {activeTab === "fulfill" && (
                        <FulfillTab
                            orders={fulfillOrders}
                            onUpdate={onUpdate}
                            onViewDetails={onViewDetails}
                        />
                    )}
                    {activeTab === "delivery" && (
                        <DeliveryTab
                            orders={deliveryOrders}
                            onUpdate={onUpdate}
                            onStatusUpdate={onStatusUpdate}
                            onViewDetails={onViewDetails}
                        />
                    )}
                </motion.div>
            </AnimatePresence>
        </div>
    );
}
