"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { formatIQD, formatDate, generateWhatsAppLink, getStatusLabel } from "@/lib/utils";
import { MessageCircle, CheckCircle2, XCircle, Eye } from "lucide-react";
import type { Order } from "@/lib/supabase";
import { OrderDetailsModal } from "@/components/orders/order-details-modal";

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

    const getItemsPreview = (items: Order["items"]) => {
        if (!items || items.length === 0) return "لا توجد عناصر";

        if (items.length === 1) {
            return `${items[0].name} (${items[0].quantity}×)`;
        }

        return `${items[0].name} +${items.length - 1} أخرى`;
    };

    return (
        <>
            <Card className="p-6">
                {/* Header with filters */}
                <div className="flex flex-col gap-4 mb-6">
                    <div className="flex items-center justify-between">
                        <h2 className="text-2xl font-bold">الطلبات</h2>
                        <div className="text-sm text-zinc-400">
                            {filteredOrders.length} من {orders.length} طلب
                        </div>
                    </div>

                    {/* Search and Filters */}
                    <div className="flex flex-col sm:flex-row gap-3">
                        <input
                            type="text"
                            placeholder="بحث بالاسم أو رقم الهاتف..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="flex-1 px-4 py-2 bg-surface border border-border rounded-lg text-foreground placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                        />

                        <div className="flex gap-2 overflow-x-auto pb-2">
                            <Button
                                size="sm"
                                variant={filter === "all" ? "primary" : "ghost"}
                                onClick={() => setFilter("all")}
                            >
                                الكل
                            </Button>
                            <Button
                                size="sm"
                                variant={filter === "new" ? "primary" : "ghost"}
                                onClick={() => setFilter("new")}
                            >
                                جديد
                            </Button>
                            <Button
                                size="sm"
                                variant={filter === "contacted" ? "primary" : "ghost"}
                                onClick={() => setFilter("contacted")}
                            >
                                تم الاتصال
                            </Button>
                            <Button
                                size="sm"
                                variant={filter === "confirmed" ? "primary" : "ghost"}
                                onClick={() => setFilter("confirmed")}
                            >
                                مؤكد
                            </Button>
                            <Button
                                size="sm"
                                variant={filter === "rejected" ? "primary" : "ghost"}
                                onClick={() => setFilter("rejected")}
                            >
                                مرفوض
                            </Button>
                            <Button
                                size="sm"
                                variant={filter === "delivered" ? "primary" : "ghost"}
                                onClick={() => setFilter("delivered")}
                            >
                                تم التوصيل
                            </Button>
                        </div>
                    </div>
                </div>

                {/* Table */}
                <div className="overflow-x-auto">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>رقم الطلب</TableHead>
                                <TableHead>العميل</TableHead>
                                <TableHead>الهاتف</TableHead>
                                <TableHead>المدينة</TableHead>
                                <TableHead>العناصر</TableHead>
                                <TableHead>السعر</TableHead>
                                <TableHead>الحالة</TableHead>
                                <TableHead>التاريخ</TableHead>
                                <TableHead>الإجراءات</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredOrders.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={9} className="text-center py-8 text-zinc-500">
                                        لا توجد طلبات
                                    </TableCell>
                                </TableRow>
                            ) : (
                                filteredOrders.map((order) => (
                                    <TableRow key={order.id}>
                                        <TableCell className="font-mono text-sm">
                                            {order.order_id}
                                        </TableCell>
                                        <TableCell className="font-medium">
                                            {order.customer_name}
                                        </TableCell>
                                        <TableCell className="font-mono text-sm" dir="ltr">
                                            {order.phone}
                                        </TableCell>
                                        <TableCell>{order.city || "-"}</TableCell>
                                        <TableCell className="max-w-[200px] truncate" title={JSON.stringify(order.items)}>
                                            {getItemsPreview(order.items)}
                                        </TableCell>
                                        <TableCell className="font-mono font-semibold text-financial">
                                            {formatIQD(Number(order.price))}
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant={order.status}>
                                                {getStatusLabel(order.status)}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-sm text-zinc-400">
                                            {formatDate(order.created_at)}
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-2">
                                                {/* WhatsApp Button */}
                                                <Button
                                                    size="icon"
                                                    variant="primary"
                                                    onClick={() => {
                                                        const link = generateWhatsAppLink(
                                                            order.phone,
                                                            `مرحباً ${order.customer_name}، بخصوص طلبك رقم ${order.order_id}`
                                                        );
                                                        window.open(link, "_blank");
                                                    }}
                                                    title="فتح واتساب"
                                                >
                                                    <MessageCircle className="h-4 w-4" />
                                                </Button>

                                                {/* Confirm Button */}
                                                {(order.status === "new" || order.status === "contacted") && (
                                                    <Button
                                                        size="icon"
                                                        variant="primary"
                                                        onClick={() => handleStatusUpdate(order.id, "confirmed")}
                                                        disabled={loading === order.id}
                                                        isLoading={loading === order.id}
                                                        title="تأكيد الطلب"
                                                    >
                                                        <CheckCircle2 className="h-4 w-4" />
                                                    </Button>
                                                )}

                                                {/* Reject Button */}
                                                {order.status !== "rejected" && order.status !== "delivered" && (
                                                    <Button
                                                        size="icon"
                                                        variant="destructive"
                                                        onClick={() => handleStatusUpdate(order.id, "rejected")}
                                                        disabled={loading === order.id}
                                                        isLoading={loading === order.id}
                                                        title="رفض الطلب"
                                                    >
                                                        <XCircle className="h-4 w-4" />
                                                    </Button>
                                                )}

                                                {/* View Details Button */}
                                                <Button
                                                    size="icon"
                                                    variant="ghost"
                                                    onClick={() => {
                                                        setSelectedOrder(order);
                                                        setIsModalOpen(true);
                                                    }}
                                                    title="عرض التفاصيل"
                                                >
                                                    <Eye className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </div>
            </Card>

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
