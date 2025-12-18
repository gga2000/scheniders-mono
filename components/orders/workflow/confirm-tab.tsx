"use client";

import { useState } from "react";
import { OrderCard } from "@/components/dashboard/order-card";
import { StaggerContainer, StaggerItem } from "@/components/layout/page-transition";
import type { Order } from "@/lib/supabase";
import { MessageCircle, CheckCircle, XCircle } from "lucide-react";
import { generateWhatsAppLink } from "@/lib/utils";

interface ConfirmTabProps {
    orders: Order[];
    onStatusUpdate: (orderId: string, status: Order["status"], reason?: string) => Promise<{ success: boolean; error?: string }>;
    onViewDetails: (order: Order) => void;
    isBlacklisted: (phone: string) => boolean;
}

export function ConfirmTab({
    orders,
    onStatusUpdate,
    onViewDetails,
    isBlacklisted,
}: ConfirmTabProps) {
    const [loadingId, setLoadingId] = useState<string | null>(null);

    const handleStatusUpdate = async (orderId: string, status: Order["status"], reason?: string) => {
        setLoadingId(orderId);
        await onStatusUpdate(orderId, status, reason);
        setLoadingId(null);
    };

    const handleWhatsApp = (order: Order) => {
        const message = `مرحباً ${order.customer_name}!\n\nشكراً لطلبكم. نود تأكيد طلبكم رقم #${order.order_id}.\n\nهل المعلومات صحيحة؟`;
        const link = generateWhatsAppLink(order.phone, message);
        window.open(link, "_blank");
    };

    if (orders.length === 0) {
        return (
            <div className="text-center py-16">
                <CheckCircle className="w-16 h-16 text-green-300 mx-auto mb-4" />
                <p className="text-xl font-semibold text-foreground">All orders confirmed!</p>
                <p className="text-muted">No pending orders to confirm</p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Quick Stats */}
            <div className="flex gap-4 text-sm">
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-orange-100 text-orange-700">
                    <span className="font-bold">{orders.filter(o => o.status === "new").length}</span>
                    <span>New</span>
                </div>
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-yellow-100 text-yellow-700">
                    <span className="font-bold">{orders.filter(o => o.status === "contacted").length}</span>
                    <span>Contacted</span>
                </div>
            </div>

            {/* Order Cards */}
            <StaggerContainer className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {orders.map((order) => (
                    <StaggerItem key={order.id}>
                        <OrderCard
                            order={order}
                            loadingId={loadingId}
                            onStatusUpdate={handleStatusUpdate}
                            onViewDetails={onViewDetails}
                            isBlacklisted={isBlacklisted(order.phone)}
                        />
                    </StaggerItem>
                ))}
            </StaggerContainer>
        </div>
    );
}
