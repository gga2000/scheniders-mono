"use client";

import React, { useState, useEffect } from "react";
import { getDeletedOrders, restoreDeletedOrder } from "@/app/actions/deleted-orders";
import { toast } from "sonner";
import { Trash2, RotateCcw, ArrowLeft, Package } from "lucide-react";
import Link from "next/link";
import { formatIQD } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

export default function TrashPage() {
    const [orders, setOrders] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [restoringId, setRestoringId] = useState<string | null>(null);

    useEffect(() => {
        fetchOrders();
    }, []);

    const fetchOrders = async () => {
        setLoading(true);
        const result = await getDeletedOrders();
        if (result.success && result.data) {
            setOrders(result.data);
        } else {
            toast.error("Failed to load deleted orders");
        }
        setLoading(false);
    };

    const handleRestore = async (orderId: string) => {
        setRestoringId(orderId);
        const result = await restoreDeletedOrder(orderId);
        if (result.success) {
            toast.success("Order restored successfully");
            setOrders(prev => prev.filter(o => o.id !== orderId));
        } else {
            toast.error("Failed to restore order: " + result.error);
        }
        setRestoringId(null);
    };

    return (
        <div className="p-6 max-w-5xl mx-auto">
            <div className="flex items-center gap-4 mb-8">
                <Link href="/orders" className="p-2 hover:bg-muted rounded-lg transition-colors">
                    <ArrowLeft className="w-5 h-5" />
                </Link>
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        <Trash2 className="w-6 h-6 text-red-500" />
                        Trash
                    </h1>
                    <p className="text-muted-foreground text-sm">
                        Orders deleted within the last 30 days can be restored here.
                    </p>
                </div>
            </div>

            {loading ? (
                <div className="flex flex-col gap-3">
                    {[1, 2, 3].map(i => (
                        <div key={i} className="h-24 bg-muted/20 animate-pulse rounded-xl border border-border/50" />
                    ))}
                </div>
            ) : orders.length === 0 ? (
                <div className="text-center py-20 bg-muted/10 rounded-2xl border border-dashed border-border">
                    <Package className="w-12 h-12 text-muted-foreground/50 mx-auto mb-3" />
                    <h3 className="text-lg font-medium text-foreground">Trash is empty</h3>
                    <p className="text-sm text-muted-foreground">No orders have been deleted recently.</p>
                </div>
            ) : (
                <div className="flex flex-col gap-3">
                    {orders.map((order) => (
                        <div key={order.id} className="flex items-center justify-between p-4 bg-background border border-border/50 shadow-sm rounded-xl hover:border-border transition-colors">
                            <div className="flex flex-col gap-1">
                                <div className="flex items-center gap-2">
                                    <span className="font-semibold">{order.order_id || order.sequence_number}</span>
                                    <span className="px-2 py-0.5 bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 rounded-md text-xs font-medium">
                                        Deleted {order.deleted_at ? formatDistanceToNow(new Date(order.deleted_at), { addSuffix: true }) : ''}
                                    </span>
                                </div>
                                <div className="text-sm text-muted-foreground flex items-center gap-2">
                                    <span className="font-medium text-foreground">{order.customer_name}</span>
                                    <span>•</span>
                                    <span>{order.phone}</span>
                                    <span>•</span>
                                    <span className="font-medium text-foreground">{formatIQD(order.price)}</span>
                                </div>
                            </div>

                            <button
                                onClick={() => handleRestore(order.id)}
                                disabled={restoringId === order.id}
                                className="flex items-center gap-2 px-4 py-2 bg-primary/10 hover:bg-primary/20 text-primary rounded-lg transition-colors font-medium text-sm disabled:opacity-50"
                            >
                                <RotateCcw className="w-4 h-4" />
                                {restoringId === order.id ? 'Restoring...' : 'Restore'}
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
