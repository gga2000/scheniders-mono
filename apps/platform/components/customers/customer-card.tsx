"use client";

import { useState, memo } from "react";
import { PaginatedCustomer } from "@/hooks/use-paginated-customers";
import { cn, formatIQD, formatDate, generateWhatsAppLink } from "@/lib/utils";
import {
    User,
    Crown,
    Star,
    Phone,
    MapPin,
    MessageCircle,
    AlertTriangle,
    Eye,
    ShoppingBag
} from "lucide-react";
import { motion } from "framer-motion";
import { CustomerTag } from "@/types/customer";
import { RiskBadge } from "@/components/orders/risk-badge";

interface CustomerCardProps {
    customer: PaginatedCustomer;
    isSelected?: boolean;
    onToggleSelection?: (phone: string, isShiftKey?: boolean) => void;
    onViewDetails: (phone: string) => void;
    tags?: CustomerTag[];
    hasDuplicates?: boolean;
    onShowDuplicates?: (phone: string) => void;
    // Compact view: 0 = full, 1 = semi-compact, 2 = ultra-compact
    compact?: 0 | 1 | 2;
    isVirtualized?: boolean;
}

const CustomerCardInner = function CustomerCard({
    customer,
    isSelected = false,
    onToggleSelection,
    onViewDetails,
    tags = [],
    hasDuplicates = false,
    onShowDuplicates,
    compact = 0,
    isVirtualized = false,
}: CustomerCardProps) {
    const [actionsOpen, setActionsOpen] = useState(false);

    // Helper to conditionally disable layout animations
    const getLayoutId = (id: string) => isVirtualized ? undefined : id;

    // Get status icon and color for semi-compact view
    const getStatusIcon = (status: PaginatedCustomer["calculated_status"]) => {
        switch (status) {
            case "vip": return <Crown className="w-4 h-4" />;
            case "regular": return <Star className="w-4 h-4" />;
            default: return <User className="w-4 h-4" />;
        }
    };

    const getStatusColor = (status: PaginatedCustomer["calculated_status"]) => {
        switch (status) {
            case "vip": return "bg-[#eab308] text-amber-900 border-amber-200";
            case "regular": return "bg-[#00ff9d] text-green-900 border-green-200";
            default: return "bg-[#2dd4bf] text-teal-900 border-teal-200";
        }
    };

    // Dormancy indicator (activity level)
    const getDormancyColor = (lastOrder: string) => {
        const daysSince = Math.floor((new Date().getTime() - new Date(lastOrder).getTime()) / (1000 * 3600 * 24));
        if (daysSince <= 30) return "bg-[#00ff9d] shadow-[0_0_8px_rgba(0,255,157,0.5)]";
        if (daysSince <= 90) return "bg-[#eab308] shadow-[0_0_8px_rgba(234,179,8,0.5)]";
        if (daysSince <= 180) return "bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.5)]";
        return "bg-[#ff3366] shadow-[0_0_8px_rgba(255,51,102,0.5)]";
    };

    const daysSinceLastOrder = customer.last_order_date
        ? Math.floor((new Date().getTime() - new Date(customer.last_order_date).getTime()) / (1000 * 3600 * 24))
        : 999;

    // Status Color helper for the new Status column
    const getLastOrderNeonClass = (status?: string) => {
        switch (status?.toLowerCase()) {
            case 'delivered':
            case 'completed': return "bg-[#00ff9d]/10 text-[#00ff9d] border-[#00ff9d]/30 drop-shadow-[0_0_8px_rgba(0,255,157,0.3)]";
            case 'cancelled':
            case 'rejected': return "bg-[#ff3366]/10 text-[#ff3366] border-[#ff3366]/30 drop-shadow-[0_0_8px_rgba(255,51,102,0.3)]";
            case 'in_transit': return "bg-[#eab308]/10 text-[#eab308] border-[#eab308]/30 drop-shadow-[0_0_8px_rgba(234,179,8,0.3)]";
            default: return "bg-gray-500/10 text-gray-400 border-gray-500/20";
        }
    }

    const renderLastOrder = () => {
        const statusText = customer.last_order_status ? customer.last_order_status.replace('_', ' ').toUpperCase() : 'UNKNOWN';
        return (
            <div className="flex flex-col items-center gap-1.5 w-full">
                <div className={cn("px-2.5 py-0.5 rounded-full text-[10px] font-bold border whitespace-nowrap", getLastOrderNeonClass(customer.last_order_status))}>
                    {statusText}
                </div>
                <span className="text-[10px] text-slate-500">{customer.last_order_date ? `${daysSinceLastOrder} days ago` : 'N/A'}</span>
            </div>
        );
    };

    const renderItems = () => (
        <div className="flex flex-col items-center justify-center w-full">
            <span className="text-sm font-bold text-slate-800 dark:text-white">{customer.total_items || 0}</span>
            <span className="text-[10px] text-slate-500 font-medium">items</span>
        </div>
    );

    const renderValuation = () => {
        const aov = customer.total_orders > 0 ? Math.round(customer.total_spent / customer.total_orders) : 0;
        return (
            <div className="flex flex-col items-end justify-center w-full">
                <span className="text-sm font-mono font-bold text-slate-800 dark:text-white whitespace-nowrap">{formatIQD(customer.total_spent)}</span>
                <span className="text-[10px] text-slate-500">AOV: <span className="text-slate-400 dark:text-slate-300 font-mono">{formatIQD(aov)}</span></span>
            </div>
        );
    };

    const renderHoverActions = () => (
        <div className="flex justify-end pr-2 md:pr-0 w-full relative h-10 items-center">
            <div className="absolute right-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 translate-x-4 group-hover:translate-x-0 transition-all duration-300">
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        const link = generateWhatsAppLink(customer.phone, `مرحباً ${customer.name}`);
                        window.open(link, "_blank");
                    }}
                    className="p-2 rounded-lg bg-[#25D366]/10 text-[#25D366] hover:bg-[#25D366] hover:text-white transition-all shadow-sm"
                    title="WhatsApp"
                >
                    <MessageCircle className="w-4 h-4" />
                </button>
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        onViewDetails(customer.phone);
                    }}
                    className="p-2 rounded-lg bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-500 hover:text-white transition-all shadow-sm"
                    title="View Details"
                >
                    <Eye className="w-4 h-4" />
                </button>
            </div>
        </div>
    );

    // Mock Engagement Sparklines SVG — neon colors
    const renderSparkline = () => {
        const isVip = customer.calculated_status === "vip" || daysSinceLastOrder <= 30;
        const color = isVip ? "#00ff9d" : (daysSinceLastOrder > 180 ? "#ff3366" : "#eab308");
        const path = isVip
            ? "M0 25 L 20 20 L 40 22 L 60 10 L 80 15 L 100 5"
            : (daysSinceLastOrder > 180 ? "M0 5 L 20 10 L 40 15 L 60 15 L 80 25 L 100 28" : "M0 15 L 20 12 L 40 18 L 60 15 L 80 15 L 100 15");
        const cy = isVip ? 5 : (daysSinceLastOrder > 180 ? 28 : 15);

        return (
            <div className="w-full h-8 flex items-center justify-start overflow-hidden opacity-80 group-hover:opacity-100 transition-opacity">
                <svg className="w-24 h-full overflow-visible" viewBox="0 0 100 30">
                    <motion.path
                        initial={{ pathLength: 0 }}
                        animate={{ pathLength: 1 }}
                        transition={{ duration: 1.5, ease: "easeInOut" }}
                        d={path}
                        fill="none"
                        stroke={color}
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="drop-shadow-md"
                    />
                    <motion.circle
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ delay: 1.4, duration: 0.3 }}
                        cx="100" cy={cy} r="3" fill={color}
                    />
                </svg>
            </div>
        );
    };

    const getSegmentBadge = () => {
        if (customer.calculated_status === "vip") return <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-amber-500/10 text-amber-600 dark:text-amber-500 border border-amber-500/20">VIP</span>;
        if (daysSinceLastOrder > 180 && customer.total_orders > 1) return <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-purple-500/10 text-purple-600 dark:text-purple-500 border border-purple-500/20">Dormant</span>;
        if (customer.total_orders === 1) return <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-blue-500/10 text-blue-600 dark:text-blue-500 border border-blue-500/20">Fresh</span>;
        return <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-500 border border-emerald-500/20">Active</span>;
    };

    const riskLevel = customer.is_blacklisted ? "blocked" : null;

    // DATATABLE ROW (Level 2/0)
    if (compact === 2 || compact === 0) {
        const initials = customer.name.substring(0, 2).toUpperCase();
        const dotColor = (customer.calculated_status === "vip" || daysSinceLastOrder <= 30) ? "bg-[#00ff9d]" : (daysSinceLastOrder > 180 ? "bg-[#ff3366] animate-pulse" : "bg-yellow-500");

        return (
            <motion.div
                layout={!isVirtualized}
                layoutId={getLayoutId(`customer-${customer.phone}`)}
                onClick={() => onViewDetails(customer.phone)}
                className={cn(
                    "group relative w-full h-full isolate overflow-hidden",
                    "grid grid-cols-[48px_minmax(200px,2fr)_minmax(120px,1.5fr)_minmax(80px,0.8fr)_minmax(120px,1fr)_minmax(140px,1.5fr)_80px] gap-4 items-center px-6 py-4",
                    "border-b border-slate-200 dark:border-white/5 bg-white dark:bg-[#0a0a0a]",
                    "hover:bg-slate-50 dark:hover:bg-[#141414] hover:-translate-y-[1px] hover:shadow-[0_4px_24px_rgba(0,0,0,0.05)] dark:hover:shadow-[0_4px_24px_rgba(0,0,0,0.4)] hover:z-10 transition-all duration-300 cursor-pointer",
                    "before:absolute before:inset-y-0 before:left-0 before:w-[2px] before:bg-primary before:opacity-0 hover:before:opacity-100 before:transition-opacity dark:before:shadow-[0_0_12px_var(--primary)]",
                    isSelected && "bg-slate-50 dark:bg-[#141414] before:opacity-100"
                )}
            >
                {/* 1. Selection Checkbox */}
                <div className="w-full flex justify-center">
                    {onToggleSelection ? (
                        <input
                            type="checkbox"
                            checked={isSelected}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => {
                                e.stopPropagation();
                                onToggleSelection(customer.phone);
                            }}
                            className="rounded border-slate-300 dark:border-slate-600 bg-transparent text-primary focus:ring-offset-0 focus:ring-primary cursor-pointer w-4 h-4"
                        />
                    ) : <div className="w-4" />}
                </div>

                {/* 2. Customer Avatar, Name, Tier */}
                <div className="flex items-center gap-3 min-w-0 pr-2">
                    <div className="relative flex-shrink-0">
                        <div className="w-10 h-10 rounded-full bg-indigo-50 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-300 flex items-center justify-center text-sm font-bold ring-2 ring-white dark:ring-slate-800 shadow-sm">
                            {initials || <User className="w-4 h-4" />}
                        </div>
                        {/* Status Dot */}
                        <span className={cn("absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white dark:border-[#0f172a]", dotColor)} />
                    </div>
                    <div className="flex-1 min-w-0 text-left">
                        <div className="flex items-center gap-1.5 mb-0.5">
                            <p className="font-bold text-sm text-slate-800 dark:text-white truncate leading-tight group-hover:text-primary transition-colors">{customer.name || customer.phone}</p>
                            {riskLevel && <div className="scale-75 origin-left"><RiskBadge level={riskLevel} showLabel={false} /></div>}
                            {hasDuplicates && (
                                <button
                                    onClick={(e) => { e.stopPropagation(); onShowDuplicates?.(customer.phone); }}
                                    className="text-[10px] font-bold text-amber-600 dark:text-amber-500 bg-amber-50 dark:bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-200 dark:border-amber-500/20"
                                >
                                    Dupes
                                </button>
                            )}
                        </div>
                        <div className="flex items-center gap-2">
                            <p className="text-xs text-slate-500 font-mono">{customer.phone}</p>
                            {getSegmentBadge()}
                        </div>
                    </div>
                </div>

                {/* 3. Last Order */}
                {renderLastOrder()}

                {/* 4. Total Items */}
                {renderItems()}

                {/* 5. LTV & AOV */}
                {renderValuation()}

                {/* 6. Engagement Sparkline */}
                {renderSparkline()}

                {/* 7. Hover Actions */}
                {renderHoverActions()}
            </motion.div>
        );
    }

    // SEMI-COMPACT VIEW (Level 1)
    return (
        <motion.div
            layout={!isVirtualized}
            layoutId={getLayoutId(`customer-${customer.phone}`)}
            onClick={() => onViewDetails(customer.phone)}
            className={cn(
                "group relative w-full h-full isolate",
                "bg-[var(--card-bg)] rounded-2xl shadow-sm hover:shadow-lg",
                "border border-[var(--card-border)]",
                "hover:border-[var(--secondary)] transition-all duration-300 cursor-pointer",
                "overflow-hidden",
                isSelected && "ring-2 ring-[var(--pastel-yellow-solid)] border-[var(--pastel-yellow-solid)] shadow-[0_4px_12px_rgba(0,0,0,0.1)]"
            )}
        >
            <div className={cn("h-1 w-full", customer.calculated_status === "vip" ? "bg-amber-400" : customer.calculated_status === "regular" ? "bg-green-400" : "bg-teal-400")} />
            <div className="p-4">
                <div className="flex items-start gap-3">
                    {onToggleSelection && (
                        <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(e) => {
                                e.stopPropagation();
                                onToggleSelection(customer.phone);
                            }}
                            className="mt-1 w-4 h-4 rounded border-gray-300 text-[var(--pastel-yellow-solid)] focus:ring-[var(--pastel-yellow-solid)]"
                        />
                    )}
                    <div className="relative flex-shrink-0">
                        <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center relative overflow-hidden", getStatusColor(customer.calculated_status))}>
                            <div className="absolute inset-0 opacity-10 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-black to-transparent" />
                            <div className="relative z-10">{getStatusIcon(customer.calculated_status)}</div>
                        </div>
                        <div
                            className={cn("absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full border-2 border-[var(--card-bg)]", getDormancyColor(customer.last_order_date))}
                        />
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-bold text-foreground truncate">{customer.name}</h3>
                            {customer.is_blacklisted && <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />}
                        </div>
                        <div className="flex items-center gap-2 text-sm text-muted mb-2">
                            <Phone className="w-3.5 h-3.5" />
                            <span className="font-mono">{customer.phone}</span>
                        </div>
                        {customer.city && (
                            <div className="flex items-center gap-1.5 text-sm text-muted">
                                <MapPin className="w-3.5 h-3.5" />
                                <span className="truncate">{customer.city}</span>
                            </div>
                        )}
                    </div>
                    <div className="flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                window.open(generateWhatsAppLink(customer.phone, `مرحباً ${customer.name}`), "_blank");
                            }}
                            className="p-2 rounded-lg bg-[#25D366]/10 text-[#25D366] hover:bg-[#25D366] hover:text-white transition-all"
                            title="WhatsApp"
                        >
                            <MessageCircle className="w-4 h-4" />
                        </button>
                    </div>
                </div>
                <div className="grid grid-cols-3 gap-3 mt-3 pt-3 border-t border-[var(--card-border)]">
                    <div>
                        <p className="text-xs text-muted uppercase tracking-wider mb-0.5">Spent</p>
                        <p className="text-sm font-bold text-foreground">{formatIQD(customer.total_spent)}</p>
                    </div>
                    <div>
                        <p className="text-xs text-muted uppercase tracking-wider mb-0.5">Orders</p>
                        <p className="text-sm font-bold text-foreground">{customer.total_orders}</p>
                    </div>
                    <div>
                        <p className="text-xs text-muted uppercase tracking-wider mb-0.5">Last</p>
                        <p className="text-sm font-bold text-foreground">{customer.last_order_date ? formatDate(customer.last_order_date) : "-"}</p>
                    </div>
                </div>
            </div>
        </motion.div>
    );
};
// Deep comparison function to prevent re-renders when closures change
export const CustomerCard = memo(CustomerCardInner, (prev, next) => {
    return (
        prev.customer.phone === next.customer.phone &&
        prev.customer.total_spent === next.customer.total_spent &&
        prev.customer.total_orders === next.customer.total_orders &&
        prev.customer.last_order_status === next.customer.last_order_status &&
        prev.customer.calculated_status === next.customer.calculated_status &&
        prev.customer.name === next.customer.name &&
        prev.isSelected === next.isSelected &&
        prev.compact === next.compact &&
        prev.hasDuplicates === next.hasDuplicates
    );
});
