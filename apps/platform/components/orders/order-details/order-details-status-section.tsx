"use client";

import { cn } from "@/lib/utils";
import type { OrderDetailsView } from "./use-order-details-model";

/** One section of OrderDetailsModal. */
export function OrderDetailsStatusSection({ m }: { m: OrderDetailsView }) {
    const { onStatusUpdate, order, isEditing, isUpdatingStatus, handleStatusChange, row1Group1, row1Group2, row1Group3, row2Group1, row2Group2, row2Group3 } = m;
    return (
        <>
            {/* Quick Actions - 2 Row Layout */}
            {!isEditing && onStatusUpdate && (
                <div className="py-3 border-y border-[var(--card-border)] space-y-3">
                    {/* ROW 1: abandoned/new/contacted | confirmed/in_transit | pending_refund */}
                    <div className="flex items-center gap-4">
                        {/* Group: abandoned, new, contacted */}
                        <div className="flex items-center gap-2">
                            {row1Group1.map((action) => {
                                const Icon = action.icon;
                                const isCurrentStatus = order.status === action.status;
                                return (
                                    <button
                                        key={action.status}
                                        data-status-option={action.status}
                                        data-current={isCurrentStatus ? "" : undefined}
                                        onClick={() => handleStatusChange(action.status)}
                                        disabled={isUpdatingStatus || isCurrentStatus}
                                        className={cn(
                                            "flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
                                            isCurrentStatus
                                                ? cn(action.bgColor, action.textColor, "ring-2 ring-offset-1 shadow-md font-bold border-2 border-current")
                                                : cn(action.bgColor, action.textColor, action.hoverColor, "active:scale-95 border border-transparent hover:border-black/5"),
                                            isUpdatingStatus && "opacity-50 cursor-wait"
                                        )}
                                    >
                                        <Icon className="w-3.5 h-3.5" />
                                        <span>{action.label}</span>
                                    </button>
                                );
                            })}
                        </div>

                        <div className="h-6 w-px bg-[var(--card-border)]" />

                        {/* Group: confirmed, in_transit */}
                        <div className="flex items-center gap-2">
                            {row1Group2.map((action) => {
                                const Icon = action.icon;
                                const isCurrentStatus = order.status === action.status;
                                return (
                                    <button
                                        key={action.status}
                                        data-status-option={action.status}
                                        data-current={isCurrentStatus ? "" : undefined}
                                        onClick={() => handleStatusChange(action.status)}
                                        disabled={isUpdatingStatus || isCurrentStatus}
                                        className={cn(
                                            "flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
                                            isCurrentStatus
                                                ? cn(action.bgColor, action.textColor, "ring-2 ring-offset-1 shadow-md font-bold border-2 border-current")
                                                : cn(action.bgColor, action.textColor, action.hoverColor, "active:scale-95 border border-transparent hover:border-black/5"),
                                            isUpdatingStatus && "opacity-50 cursor-wait"
                                        )}
                                    >
                                        <Icon className="w-3.5 h-3.5" />
                                        <span>{action.label}</span>
                                    </button>
                                );
                            })}
                        </div>

                        <div className="h-6 w-px bg-[var(--card-border)]" />

                        {/* Group: pending_refund */}
                        <div className="flex items-center gap-2">
                            {row1Group3.map((action) => {
                                const Icon = action.icon;
                                const isCurrentStatus = order.status === action.status;
                                return (
                                    <button
                                        key={action.status}
                                        data-status-option={action.status}
                                        data-current={isCurrentStatus ? "" : undefined}
                                        onClick={() => handleStatusChange(action.status)}
                                        disabled={isUpdatingStatus || isCurrentStatus}
                                        className={cn(
                                            "flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
                                            isCurrentStatus
                                                ? cn(action.bgColor, action.textColor, "ring-2 ring-offset-1 shadow-md font-bold border-2 border-current")
                                                : cn(action.bgColor, action.textColor, action.hoverColor, "active:scale-95 border border-transparent hover:border-black/5"),
                                            isUpdatingStatus && "opacity-50 cursor-wait"
                                        )}
                                    >
                                        <Icon className="w-3.5 h-3.5" />
                                        <span>{action.label}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* ROW 2: cancelled/rejected/didn't_respond | delivered/completed | pending_order */}
                    <div className="flex items-center gap-4">
                        {/* Group: cancelled, rejected, didn't respond */}
                        <div className="flex items-center gap-2">
                            {row2Group1.map((action) => {
                                const Icon = action.icon;
                                const isCurrentStatus = order.status === action.status;
                                return (
                                    <button
                                        key={action.status}
                                        data-status-option={action.status}
                                        data-current={isCurrentStatus ? "" : undefined}
                                        onClick={() => handleStatusChange(action.status)}
                                        disabled={isUpdatingStatus || isCurrentStatus}
                                        className={cn(
                                            "flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
                                            isCurrentStatus
                                                ? cn(action.bgColor, action.textColor, "ring-2 ring-offset-1 shadow-md font-bold border-2 border-current")
                                                : cn(action.bgColor, action.textColor, action.hoverColor, "active:scale-95 border border-transparent hover:border-black/5"),
                                            isUpdatingStatus && "opacity-50 cursor-wait"
                                        )}
                                    >
                                        <Icon className="w-3.5 h-3.5" />
                                        <span>{action.label}</span>
                                    </button>
                                );
                            })}
                        </div>

                        <div className="h-6 w-px bg-[var(--card-border)]" />

                        {/* Group: delivered, completed */}
                        <div className="flex items-center gap-2">
                            {row2Group2.map((action) => {
                                const Icon = action.icon;
                                const isCurrentStatus = order.status === action.status;
                                return (
                                    <button
                                        key={action.status}
                                        data-status-option={action.status}
                                        data-current={isCurrentStatus ? "" : undefined}
                                        onClick={() => handleStatusChange(action.status)}
                                        disabled={isUpdatingStatus || isCurrentStatus}
                                        className={cn(
                                            "flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
                                            isCurrentStatus
                                                ? cn(action.bgColor, action.textColor, "ring-2 ring-offset-1 shadow-md font-bold border-2 border-current")
                                                : cn(action.bgColor, action.textColor, action.hoverColor, "active:scale-95 border border-transparent hover:border-black/5"),
                                            isUpdatingStatus && "opacity-50 cursor-wait"
                                        )}
                                    >
                                        <Icon className="w-3.5 h-3.5" />
                                        <span>{action.label}</span>
                                    </button>
                                );
                            })}
                        </div>

                        <div className="h-6 w-px bg-[var(--card-border)]" />

                        {/* Group: pending_order */}
                        <div className="flex items-center gap-2">
                            {row2Group3.map((action) => {
                                const Icon = action.icon;
                                const isCurrentStatus = order.status === action.status;
                                return (
                                    <button
                                        key={action.status}
                                        data-status-option={action.status}
                                        data-current={isCurrentStatus ? "" : undefined}
                                        onClick={() => handleStatusChange(action.status)}
                                        disabled={isUpdatingStatus || isCurrentStatus}
                                        className={cn(
                                            "flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
                                            isCurrentStatus
                                                ? cn(action.bgColor, action.textColor, "ring-2 ring-offset-1 shadow-md font-bold border-2 border-current")
                                                : cn(action.bgColor, action.textColor, action.hoverColor, "active:scale-95 border border-transparent hover:border-black/5"),
                                            isUpdatingStatus && "opacity-50 cursor-wait"
                                        )}
                                    >
                                        <Icon className="w-3.5 h-3.5" />
                                        <span>{action.label}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
