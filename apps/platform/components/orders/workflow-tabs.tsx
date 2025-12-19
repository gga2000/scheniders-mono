"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Phone, Package, Truck, Sparkles, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Order } from "@/lib/supabase";

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
    gradient: string;
    activeGradient: string;
    borderColor: string;
    shadowColor: string;
    stepNumber: number;
}> = {
    confirm: {
        label: "Confirm",
        labelAr: "تأكيد",
        icon: Phone,
        gradient: "from-emerald-50 to-teal-50",
        activeGradient: "from-emerald-500 to-teal-600",
        borderColor: "border-emerald-200",
        shadowColor: "shadow-emerald-500/20",
        stepNumber: 1,
    },
    fulfill: {
        label: "Fulfill",
        labelAr: "تجهيز",
        icon: Package,
        gradient: "from-purple-50 to-violet-50",
        activeGradient: "from-purple-500 to-violet-600",
        borderColor: "border-purple-200",
        shadowColor: "shadow-purple-500/20",
        stepNumber: 2,
    },
    delivery: {
        label: "Delivery",
        labelAr: "توصيل",
        icon: Truck,
        gradient: "from-amber-50 to-orange-50",
        activeGradient: "from-amber-500 to-orange-600",
        borderColor: "border-amber-200",
        shadowColor: "shadow-amber-500/20",
        stepNumber: 3,
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
    const activeIndex = tabs.indexOf(activeTab);

    return (
        <div className="space-y-6">
            {/* Premium Tab Headers */}
            <div className="relative">
                {/* Background Card */}
                <div className="absolute inset-0 bg-gradient-to-r from-gray-50 via-white to-gray-50 rounded-3xl border border-gray-100 shadow-lg" />

                {/* Progress Line */}
                <div className="absolute top-1/2 left-[16.67%] right-[16.67%] h-1 -translate-y-1/2 z-0">
                    <div className="h-full bg-gray-200 rounded-full" />
                    <motion.div
                        className="absolute top-0 left-0 h-full bg-gradient-to-r from-emerald-500 via-purple-500 to-amber-500 rounded-full"
                        initial={{ width: "0%" }}
                        animate={{ width: `${activeIndex * 50}%` }}
                        transition={{ duration: 0.4, ease: "easeInOut" }}
                    />
                </div>

                <div className="relative grid grid-cols-3 gap-4 p-3 z-10">
                    {tabs.map((tab, index) => {
                        const config = tabConfig[tab];
                        const Icon = config.icon;
                        const isActive = activeTab === tab;
                        const count = orderCounts[tab];
                        const isPast = index < activeIndex;

                        return (
                            <motion.button
                                key={tab}
                                onClick={() => setActiveTab(tab)}
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                                className={cn(
                                    "relative flex flex-col items-center gap-2 p-5 rounded-2xl transition-all duration-300",
                                    isActive
                                        ? `bg-gradient-to-br ${config.activeGradient} text-white shadow-xl ${config.shadowColor}`
                                        : isPast
                                            ? `bg-gradient-to-br ${config.gradient} ${config.borderColor} border-2 text-gray-700`
                                            : "bg-white/80 backdrop-blur-sm border border-gray-200 text-gray-500 hover:border-gray-300 hover:bg-white"
                                )}
                            >
                                {/* Step Number Badge */}
                                <div className={cn(
                                    "absolute -top-2 -left-2 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shadow-md",
                                    isActive
                                        ? "bg-white text-gray-800"
                                        : isPast
                                            ? `bg-gradient-to-br ${config.activeGradient} text-white`
                                            : "bg-gray-100 text-gray-500 border border-gray-200"
                                )}>
                                    {config.stepNumber}
                                </div>

                                {/* Count Badge */}
                                {count > 0 && (
                                    <motion.div
                                        initial={{ scale: 0 }}
                                        animate={{ scale: 1 }}
                                        className={cn(
                                            "absolute -top-2 -right-2 min-w-[28px] h-7 px-2 rounded-full flex items-center justify-center text-xs font-bold shadow-lg",
                                            isActive
                                                ? "bg-white text-gray-800"
                                                : "bg-gradient-to-br from-rose-500 to-pink-600 text-white"
                                        )}
                                    >
                                        {count}
                                    </motion.div>
                                )}

                                {/* Icon with glow effect */}
                                <div className={cn(
                                    "p-3 rounded-xl transition-all",
                                    isActive
                                        ? "bg-white/20 backdrop-blur-sm"
                                        : "bg-gray-50"
                                )}>
                                    <Icon className={cn(
                                        "w-6 h-6 transition-all",
                                        isActive && "drop-shadow-lg"
                                    )} />
                                </div>

                                {/* Labels */}
                                <div className="text-center">
                                    <span className="font-bold text-sm tracking-wide">{config.label}</span>
                                    <p className={cn(
                                        "text-[11px] mt-0.5",
                                        isActive ? "text-white/80" : "text-gray-400"
                                    )}>
                                        {config.labelAr}
                                    </p>
                                </div>

                                {/* Active indicator line */}
                                {isActive && (
                                    <motion.div
                                        layoutId="activeIndicator"
                                        className="absolute -bottom-3 left-1/2 -translate-x-1/2 w-12 h-1 rounded-full bg-white shadow-lg"
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        transition={{ duration: 0.3 }}
                                    />
                                )}
                            </motion.button>
                        );
                    })}
                </div>
            </div>

            {/* Workflow Tips - Animated */}
            <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center justify-center gap-2 text-sm"
            >
                <Sparkles className="w-4 h-4 text-amber-500" />
                <span className="text-muted">
                    {activeTab === "confirm" && "Contact customers & confirm their orders"}
                    {activeTab === "fulfill" && "Pack items & prepare for shipping"}
                    {activeTab === "delivery" && "Track deliveries & handle returns"}
                </span>
            </motion.div>

            {/* Tab Content with premium card */}
            <div className="relative">
                {/* Subtle gradient background */}
                <div className="absolute inset-0 bg-gradient-to-b from-transparent via-gray-50/50 to-gray-100/30 rounded-3xl -z-10" />

                <AnimatePresence mode="wait">
                    <motion.div
                        key={activeTab}
                        initial={{ opacity: 0, y: 20, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -20, scale: 0.98 }}
                        transition={{ duration: 0.3, ease: "easeOut" }}
                        className="min-h-[400px]"
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
        </div>
    );
}
