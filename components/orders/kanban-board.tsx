"use client";

import { useState } from "react";
import {
    DndContext,
    DragEndEvent,
    DragOverlay,
    DragStartEvent,
    PointerSensor,
    useSensor,
    useSensors,
    useDroppable,
    useDraggable,
} from "@dnd-kit/core";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { formatIQD } from "@/lib/utils";
import type { Order } from "@/lib/supabase";
import { GripVertical, Undo2, X } from "lucide-react";

interface KanbanBoardProps {
    orders: Order[];
    onStatusChange: (orderId: string, newStatus: Order["status"]) => Promise<void>;
    onViewDetails: (order: Order) => void;
}

type StatusType = "new" | "contacted" | "confirmed" | "delivered" | "rejected";

const statusConfig: Record<StatusType, { bg: string; header: string; text: string; label: string }> = {
    new: { bg: "bg-orange-50", header: "bg-orange-100", text: "text-orange-800", label: "New" },
    contacted: { bg: "bg-yellow-50", header: "bg-yellow-100", text: "text-yellow-800", label: "Contacted" },
    confirmed: { bg: "bg-green-50", header: "bg-green-100", text: "text-green-800", label: "Confirmed" },
    delivered: { bg: "bg-teal-50", header: "bg-teal-100", text: "text-teal-800", label: "Delivered" },
    rejected: { bg: "bg-rose-50", header: "bg-rose-100", text: "text-rose-800", label: "Rejected" },
};

// Droppable Column
function DroppableColumn({
    status,
    children,
    orderCount,
    isOver,
}: {
    status: StatusType;
    children: React.ReactNode;
    orderCount: number;
    isOver: boolean;
}) {
    const { setNodeRef } = useDroppable({ id: status });
    const colors = statusConfig[status];

    return (
        <div
            ref={setNodeRef}
            className={cn(
                "rounded-2xl overflow-hidden transition-all duration-200 min-h-[300px]",
                colors.bg,
                isOver && "ring-2 ring-offset-2 ring-blue-400 scale-[1.02]"
            )}
        >
            <div className={cn(
                "px-4 py-3 font-semibold text-sm uppercase tracking-wider flex items-center justify-between",
                colors.header,
                colors.text
            )}>
                <span>{colors.label}</span>
                <span className="px-2 py-0.5 bg-white/50 rounded-full text-xs">{orderCount}</span>
            </div>
            <div className="p-2 space-y-2 max-h-[500px] overflow-y-auto min-h-[200px]">
                {children}
            </div>
        </div>
    );
}

// Draggable Order Card
function DraggableOrderCard({
    order,
    onViewDetails,
}: {
    order: Order;
    onViewDetails: (order: Order) => void;
}) {
    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
        id: order.id,
        data: { order },
    });

    const style = transform
        ? { transform: `translate(${transform.x}px, ${transform.y}px)` }
        : undefined;

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={cn(
                "bg-white rounded-xl p-3 shadow-sm hover:shadow-md cursor-grab active:cursor-grabbing transition-all group",
                isDragging && "opacity-50 shadow-lg scale-105 z-50"
            )}
        >
            <div className="flex items-start gap-2">
                <div
                    {...attributes}
                    {...listeners}
                    className="mt-0.5 text-gray-300 hover:text-gray-500 cursor-grab"
                >
                    <GripVertical className="w-4 h-4" />
                </div>
                <div
                    className="flex-1 min-w-0"
                    onClick={(e) => {
                        e.stopPropagation();
                        onViewDetails(order);
                    }}
                >
                    <p className="font-medium text-sm truncate">{order.customer_name}</p>
                    <p className="text-xs text-muted font-mono">#{order.order_id}</p>
                    <p className="text-sm font-semibold mt-1">{formatIQD(Number(order.price))}</p>
                </div>
            </div>
        </div>
    );
}

// Main Kanban Board
export function KanbanBoard({ orders, onStatusChange, onViewDetails }: KanbanBoardProps) {
    const [activeId, setActiveId] = useState<string | null>(null);
    const [overId, setOverId] = useState<string | null>(null);
    const [undoAction, setUndoAction] = useState<{ orderId: string; oldStatus: Order["status"]; newStatus: Order["status"] } | null>(null);

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 8, // Require 8px drag before activating
            },
        })
    );

    const activeOrder = activeId ? orders.find((o) => o.id === activeId) : null;

    const handleDragStart = (event: DragStartEvent) => {
        setActiveId(event.active.id as string);
    };

    const handleDragOver = (event: DragEndEvent) => {
        setOverId(event.over?.id as string || null);
    };

    const handleDragEnd = async (event: DragEndEvent) => {
        const { active, over } = event;
        setActiveId(null);
        setOverId(null);

        if (!over) return;

        const order = orders.find((o) => o.id === active.id);
        const newStatus = over.id as Order["status"];

        if (order && order.status !== newStatus) {
            const oldStatus = order.status;

            // Optimistically update
            await onStatusChange(order.id, newStatus);

            // Show undo toast
            setUndoAction({ orderId: order.id, oldStatus, newStatus });

            // Auto-hide after 5 seconds
            setTimeout(() => setUndoAction(null), 5000);
        }
    };

    const handleUndo = async () => {
        if (undoAction) {
            await onStatusChange(undoAction.orderId, undoAction.oldStatus);
            setUndoAction(null);
        }
    };

    const statuses: StatusType[] = ["new", "contacted", "confirmed", "delivered", "rejected"];

    return (
        <>
            <DndContext
                sensors={sensors}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDragEnd={handleDragEnd}
            >
                <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
                    {statuses.map((status) => {
                        const statusOrders = orders.filter((o) => o.status === status);
                        return (
                            <DroppableColumn
                                key={status}
                                status={status}
                                orderCount={statusOrders.length}
                                isOver={overId === status}
                            >
                                {statusOrders.map((order) => (
                                    <DraggableOrderCard
                                        key={order.id}
                                        order={order}
                                        onViewDetails={onViewDetails}
                                    />
                                ))}
                                {statusOrders.length === 0 && (
                                    <p className="text-xs text-center py-8 text-muted">
                                        Drop orders here
                                    </p>
                                )}
                            </DroppableColumn>
                        );
                    })}
                </div>

                {/* Drag Overlay */}
                <DragOverlay>
                    {activeOrder && (
                        <div className="bg-white rounded-xl p-3 shadow-2xl border-2 border-blue-400 w-[200px]">
                            <p className="font-medium text-sm truncate">{activeOrder.customer_name}</p>
                            <p className="text-xs text-muted font-mono">#{activeOrder.order_id}</p>
                            <p className="text-sm font-semibold mt-1">{formatIQD(Number(activeOrder.price))}</p>
                        </div>
                    )}
                </DragOverlay>
            </DndContext>

            {/* Undo Toast */}
            <AnimatePresence>
                {undoAction && (
                    <motion.div
                        initial={{ opacity: 0, y: 50 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 50 }}
                        className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50"
                    >
                        <div className="flex items-center gap-3 px-4 py-3 bg-gray-900 text-white rounded-2xl shadow-2xl">
                            <span className="text-sm">
                                Moved to <strong>{statusConfig[undoAction.newStatus as StatusType]?.label}</strong>
                            </span>
                            <button
                                onClick={handleUndo}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg transition-all text-sm font-medium"
                            >
                                <Undo2 className="w-3.5 h-3.5" />
                                Undo
                            </button>
                            <button
                                onClick={() => setUndoAction(null)}
                                className="p-1 hover:bg-white/10 rounded-lg transition-all"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
}
