"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Phone, Package, Truck } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Order, MessageTemplate } from "@/lib/supabase";

import { ConfirmTab } from "./workflow/confirm-tab";
import { FulfillTab } from "./workflow/fulfill-tab";
import { DeliveryTab } from "./workflow/delivery-tab";

interface WorkflowTabsProps {
    orders: Order[];
    onStatusUpdate: (orderId: string, status: Order["status"], reason?: string) => Promise<{ success: boolean; error?: string }>;
    onUpdate: (orderId: string, updates: Partial<Order>) => Promise<{ success: boolean; error?: string }>;
    onViewDetails: (order: Order) => void;
    isBlacklisted: (phone: string) => boolean;
    messageTemplates?: MessageTemplate[];
}

type WorkflowTab = "confirm" | "fulfill" | "delivery";

const tabConfig: Record<WorkflowTab, {
    label: string;
    labelAr: string;
    icon: typeof Phone;
    activeColor: string;
    activeBg: string;
    stepNumber: number;
}> = {
    confirm: {
        label: "Confirm",
        labelAr: "تأكيد",
        icon: Phone,
        activeColor: "text-emerald-700",
        activeBg: "bg-[var(--pastel-green)]",
        stepNumber: 1,
    },
    fulfill: {
        label: "Fulfill",
        labelAr: "تجهيز",
        icon: Package,
        activeColor: "text-purple-700",
        activeBg: "bg-purple-100",
        stepNumber: 2,
    },
    delivery: {
        label: "Delivery",
        labelAr: "توصيل",
        icon: Truck,
        activeColor: "text-amber-700",
        activeBg: "bg-[var(--pastel-yellow)]",
        stepNumber: 3,
    },
};

import { memo } from "react";

export const WorkflowTabs = memo(function WorkflowTabs({
    orders,
    onStatusUpdate,
    onUpdate,
    onViewDetails,
    isBlacklisted,
    messageTemplates = [],
}: WorkflowTabsProps) {
    const [activeTab, setActiveTab] = useState<WorkflowTab>("confirm");

    // Filter orders by workflow stage
    const confirmOrders = orders.filter(o => o.status === "new" || o.status === "contacted");
    const fulfillOrders = orders.filter(o => o.status === "confirmed");
    const deliveryOrders = orders.filter(o => o.status === "in_transit");

    const orderCounts: Record<WorkflowTab, number> = {
        confirm: confirmOrders.length,
        fulfill: fulfillOrders.length,
        delivery: deliveryOrders.length,
    };

    const tabs: WorkflowTab[] = ["confirm", "fulfill", "delivery"];

    return (
        <div className="space-y-6">
            {/* Tab Headers - matching pastel-card style */}
            <div className="pastel-card p-2">
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
                                        ? `${config.activeBg} ${config.activeColor}`
                                        : "text-muted hover:bg-[var(--background)]"
                                )}
                            >
                                {/* Step Number */}
                                <span className={cn(
                                    "absolute top-2 left-2 w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center",
                                    isActive
                                        ? "bg-white/50 text-inherit"
                                        : "bg-gray-100 text-gray-500"
                                )}>
                                    {config.stepNumber}
                                </span>

                                {/* Count Badge */}
                                {count > 0 && (
                                    <span className={cn(
                                        "absolute -top-1 -right-1 min-w-[22px] h-[22px] flex items-center justify-center px-1.5 rounded-full text-xs font-bold",
                                        isActive
                                            ? "bg-white text-foreground shadow-sm"
                                            : "bg-orange-200 text-orange-800"
                                    )}>
                                        {count}
                                    </span>
                                )}

                                <Icon className="w-5 h-5" />
                                <span className="font-semibold">{config.label}</span>
                                <span className="text-xs opacity-70">{config.labelAr}</span>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Tab Description */}
            <p className="text-sm text-muted text-center">
                {activeTab === "confirm" && "Contact customers & confirm orders"}
                {activeTab === "fulfill" && "Pack orders & prepare for shipping"}
                {activeTab === "delivery" && "Track deliveries & handle returns"}
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
                            messageTemplates={messageTemplates}
                            onUpdateOrder={onUpdate}
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
});
