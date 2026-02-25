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
    Calendar,
    ShoppingBag,
    Tag as TagIcon,
    MoreVertical,
    Eye,
    Mail,
} from "lucide-react";
import { motion } from "framer-motion";
import { CustomerTag } from "@/lib/customer-types";

interface CustomerCardProps {
    customer: PaginatedCustomer;
    isSelected?: boolean;
    onToggleSelection?: (phone: string) => void;
    onViewDetails: (phone: string) => void;
    tags?: CustomerTag[];
    hasDuplicates?: boolean;
    onShowDuplicates?: (phone: string) => void;
    // Compact view: 0 = full, 1 = semi-compact, 2 = ultra-compact
    compact?: 0 | 1 | 2;
    isVirtualized?: boolean;
}

export const CustomerCard = memo(function CustomerCard({
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

    // Get status icon and color
    const getStatusIcon = (status: PaginatedCustomer["calculated_status"]) => {
        switch (status) {
            case "vip": return <Crown className="w-4 h-4" />;
            case "regular": return <Star className="w-4 h-4" />;
            default: return <User className="w-4 h-4" />;
        }
    };

    const getStatusColor = (status: PaginatedCustomer["calculated_status"]) => {
        switch (status) {
            case "vip": return "bg-[var(--pastel-yellow)] text-amber-900 border-amber-200";
            case "regular": return "bg-[var(--pastel-green)] text-green-900 border-green-200";
            default: return "bg-[var(--pastel-mint)] text-teal-900 border-teal-200";
        }
    };

    // Dormancy indicator (activity level)
    const getDormancyColor = (lastOrder: string) => {
        const daysSince = Math.floor((new Date().getTime() - new Date(lastOrder).getTime()) / (1000 * 3600 * 24));
        if (daysSince <= 30) return "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]";
        if (daysSince <= 90) return "bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]";
        if (daysSince <= 180) return "bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.5)]";
        return "bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]";
    };

    const getDormancyTooltip = (lastOrder: string) => {
        const daysSince = Math.floor((new Date().getTime() - new Date(lastOrder).getTime()) / (1000 * 3600 * 24));
        if (daysSince <= 30) return "Active (last 30 days)";
        if (daysSince <= 90) return "Moderate (30-90 days)";
        if (daysSince <= 180) return "At Risk (90-180 days)";
        return "Dormant (180+ days)";
    };

    // WhatsApp handler
    const handleWhatsApp = (e: React.MouseEvent) => {
        e.stopPropagation();
        const link = generateWhatsAppLink(customer.phone, `مرحباً ${customer.name}`);
        window.open(link, "_blank");
    };

    // ULTRA-COMPACT VIEW (Level 2) - Single dense row
    if (compact === 2) {
        return (
            <motion.div
                layout={!isVirtualized}
                layoutId={getLayoutId(`customer-${customer.phone}`)}
                onClick={() => onViewDetails(customer.phone)}
                className={cn(
                    "group relative w-full isolate",
                    "bg-[var(--card-bg)] rounded-xl shadow-sm hover:shadow-md",
                    "flex items-center gap-3 px-3 py-2",
                    "border border-[var(--card-border)]/50",
                    "hover:border-[var(--secondary)] transition-all duration-300 cursor-pointer",
                    isSelected && "ring-2 ring-[var(--pastel-yellow-solid)] border-[var(--pastel-yellow-solid)]"
                )}
            >
                {/* Selection Checkbox */}
                {onToggleSelection && (
                    <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => {
                            e.stopPropagation();
                            onToggleSelection(customer.phone);
                        }}
                        className="w-4 h-4 rounded border-gray-300 text-[var(--pastel-yellow-solid)] focus:ring-[var(--pastel-yellow-solid)]"
                    />
                )}

                {/* Status & Dormancy */}
                <div className="relative flex-shrink-0">
                    <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center", getStatusColor(customer.calculated_status))}>
                        {getStatusIcon(customer.calculated_status)}
                    </div>
                    <div
                        className={cn("absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border border-[var(--card-bg)]", getDormancyColor(customer.last_order_date))}
                        title={getDormancyTooltip(customer.last_order_date)}
                    />
                </div>

                {/* Name & Phone */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <p className="font-bold text-sm text-foreground truncate">{customer.name}</p>
                        {customer.is_blacklisted && <AlertTriangle className="w-3 h-3 text-red-500 flex-shrink-0" />}
                        {hasDuplicates && (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onShowDuplicates?.(customer.phone);
                                }}
                                className="text-xs font-medium text-orange-600 hover:text-orange-700"
                            >
                                Duplicates
                            </button>
                        )}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted">
                        <Phone className="w-3 h-3" />
                        <span className="font-mono">{customer.phone}</span>
                        {customer.city && (
                            <>
                                <span className="w-1 h-1 rounded-full bg-muted" />
                                <MapPin className="w-3 h-3" />
                                <span className="truncate max-w-[100px]">{customer.city}</span>
                            </>
                        )}
                    </div>
                </div>

                {/* Metrics */}
                <div className="flex items-center gap-4 flex-shrink-0">
                    <div className="text-right">
                        <p className="text-sm font-bold text-foreground">{formatIQD(customer.total_spent)}</p>
                        <p className="text-xs text-muted">{customer.total_orders} orders</p>
                    </div>

                    {/* WhatsApp Button */}
                    <button
                        onClick={handleWhatsApp}
                        className="w-7 h-7 rounded-lg flex items-center justify-center bg-[#25D366]/10 text-[#25D366] hover:bg-[#25D366] hover:text-white transition-all opacity-0 group-hover:opacity-100"
                    >
                        <MessageCircle className="w-4 h-4" />
                    </button>
                </div>
            </motion.div>
        );
    }

    // SEMI-COMPACT VIEW (Level 1) - Reduced info card
    if (compact === 1) {
        return (
            <motion.div
                layout={!isVirtualized}
                layoutId={getLayoutId(`customer-${customer.phone}`)}
                onClick={() => onViewDetails(customer.phone)}
                className={cn(
                    "group relative w-full isolate",
                    "bg-[var(--card-bg)] rounded-2xl shadow-sm hover:shadow-lg",
                    "border border-[var(--card-border)]",
                    "hover:border-[var(--secondary)] transition-all duration-300 cursor-pointer",
                    "overflow-hidden",
                    isSelected && "ring-2 ring-[var(--pastel-yellow-solid)] border-[var(--pastel-yellow-solid)] shadow-[0_4px_12px_rgba(0,0,0,0.1)]"
                )}
            >
                {/* Status Bar */}
                <div className={cn("h-1 w-full", customer.calculated_status === "vip" ? "bg-amber-400" : customer.calculated_status === "regular" ? "bg-green-400" : "bg-teal-400")} />

                <div className="p-4">
                    <div className="flex items-start gap-3">
                        {/* Selection Checkbox */}
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

                        {/* Avatar & Status */}
                        <div className="relative flex-shrink-0">
                            <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center relative overflow-hidden", getStatusColor(customer.calculated_status))}>
                                <div className="absolute inset-0 opacity-10 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-black to-transparent" />
                                <div className="relative z-10">{getStatusIcon(customer.calculated_status)}</div>
                            </div>
                            <div
                                className={cn("absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full border-2 border-[var(--card-bg)]", getDormancyColor(customer.last_order_date))}
                                title={getDormancyTooltip(customer.last_order_date)}
                            />
                        </div>

                        {/* Info */}
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
                                    {customer.governorate && <span className="text-xs">({customer.governorate})</span>}
                                </div>
                            )}
                        </div>

                        {/* Actions */}
                        <div className="flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                                onClick={handleWhatsApp}
                                className="p-2 rounded-lg bg-[#25D366]/10 text-[#25D366] hover:bg-[#25D366] hover:text-white transition-all"
                                title="WhatsApp"
                            >
                                <MessageCircle className="w-4 h-4" />
                            </button>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onViewDetails(customer.phone);
                                }}
                                className="p-2 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 transition-all"
                                title="View Details"
                            >
                                <Eye className="w-4 h-4" />
                            </button>
                        </div>
                    </div>

                    {/* Stats */}
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
                            <p className="text-sm font-bold text-foreground">{formatDate(customer.last_order_date, "short")}</p>
                        </div>
                    </div>

                    {/* Tags */}
                    {tags.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-3">
                            {tags.slice(0, 3).map((tag) => (
                                <span
                                    key={tag.id}
                                    className="px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700"
                                >
                                    {tag.name}
                                </span>
                            ))}
                            {tags.length > 3 && (
                                <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                                    +{tags.length - 3}
                                </span>
                            )}
                        </div>
                    )}
                </div>
            </motion.div>
        );
    }

    // FULL VIEW (Level 0) - Complete customer card
    return (
        <motion.div
            layout={!isVirtualized}
            layoutId={getLayoutId(`customer-${customer.phone}`)}
            onClick={() => onViewDetails(customer.phone)}
            className={cn(
                "group relative w-full isolate",
                "bg-[var(--card-bg)] rounded-3xl shadow-sm hover:shadow-xl",
                "border border-[var(--card-border)]",
                "hover:border-[var(--secondary)] transition-all duration-300 cursor-pointer",
                "overflow-hidden",
                isSelected && "ring-2 ring-[var(--pastel-yellow-solid)] border-[var(--pastel-yellow-solid)] shadow-[0_6px_20px_rgba(0,0,0,0.12)]"
            )}
        >
            {/* Status Bar */}
            <div className={cn("h-2 w-full", customer.calculated_status === "vip" ? "bg-gradient-to-r from-amber-400 to-amber-500" : customer.calculated_status === "regular" ? "bg-gradient-to-r from-green-400 to-green-500" : "bg-gradient-to-r from-teal-400 to-teal-500")} />

            <div className="p-6">
                {/* Header */}
                <div className="flex items-start gap-4 mb-4">
                    {/* Selection Checkbox */}
                    {onToggleSelection && (
                        <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(e) => {
                                e.stopPropagation();
                                onToggleSelection(customer.phone);
                            }}
                            className="mt-2 w-5 h-5 rounded border-gray-300 text-[var(--pastel-yellow-solid)] focus:ring-[var(--pastel-yellow-solid)]"
                        />
                    )}

                    {/* Avatar & Status */}
                    <div className="relative flex-shrink-0">
                        <div className={cn("w-16 h-16 rounded-2xl flex items-center justify-center relative overflow-hidden border-2", getStatusColor(customer.calculated_status))}>
                            <div className="absolute inset-0 opacity-10 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-black to-transparent" />
                            <div className="relative z-10 scale-110">{getStatusIcon(customer.calculated_status)}</div>
                        </div>
                        <div
                            className={cn("absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-[var(--card-bg)]", getDormancyColor(customer.last_order_date))}
                            title={getDormancyTooltip(customer.last_order_date)}
                        />
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                            <h2 className="text-xl font-bold text-foreground truncate">{customer.name}</h2>
                            {customer.is_blacklisted && (
                                <span className="px-2 py-1 rounded-lg bg-red-100 text-red-700 text-xs font-bold uppercase flex items-center gap-1">
                                    <AlertTriangle className="w-3 h-3" />
                                    Blacklisted
                                </span>
                            )}
                            {hasDuplicates && (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onShowDuplicates?.(customer.phone);
                                    }}
                                    className="px-2 py-1 rounded-lg bg-orange-100 text-orange-700 text-xs font-bold uppercase hover:bg-orange-200"
                                >
                                    View Duplicates
                                </button>
                            )}
                        </div>

                        <div className="flex items-center gap-3 text-sm text-muted mb-2">
                            <div className="flex items-center gap-1.5">
                                <Phone className="w-4 h-4" />
                                <span className="font-mono">{customer.phone}</span>
                            </div>
                            {customer.city && (
                                <>
                                    <span className="w-1 h-1 rounded-full bg-muted" />
                                    <div className="flex items-center gap-1.5">
                                        <MapPin className="w-4 h-4" />
                                        <span>{customer.city}</span>
                                        {customer.governorate && <span className="text-xs">({customer.governorate})</span>}
                                    </div>
                                </>
                            )}
                        </div>

                        {/* Tags */}
                        {tags.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                                {tags.map((tag) => (
                                    <span
                                        key={tag.id}
                                        className="px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-100 text-purple-700 flex items-center gap-1"
                                    >
                                        <TagIcon className="w-3 h-3" />
                                        {tag.name}
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Quick Actions */}
                    <div className="flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                            onClick={handleWhatsApp}
                            className="p-2.5 rounded-xl bg-[#25D366]/10 text-[#25D366] hover:bg-[#25D366] hover:text-white transition-all shadow-sm"
                            title="WhatsApp"
                        >
                            <MessageCircle className="w-5 h-5" />
                        </button>
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                setActionsOpen(!actionsOpen);
                            }}
                            className="p-2.5 rounded-xl bg-gray-100 text-gray-700 hover:bg-gray-200 transition-all shadow-sm"
                            title="More Actions"
                        >
                            <MoreVertical className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* Metrics Grid */}
                <div className="grid grid-cols-4 gap-4 p-4 bg-[var(--background)] rounded-2xl border border-[var(--card-border)]">
                    <div className="text-center">
                        <p className="text-xs font-bold uppercase tracking-wider text-muted mb-1">Lifetime Value</p>
                        <p className="text-lg font-bold text-foreground">{formatIQD(customer.total_spent)}</p>
                    </div>
                    <div className="text-center">
                        <p className="text-xs font-bold uppercase tracking-wider text-muted mb-1">Total Orders</p>
                        <p className="text-lg font-bold text-foreground">{customer.total_orders}</p>
                    </div>
                    <div className="text-center">
                        <p className="text-xs font-bold uppercase tracking-wider text-muted mb-1">Avg. Order</p>
                        <p className="text-lg font-bold text-foreground">{formatIQD(customer.total_spent / customer.total_orders)}</p>
                    </div>
                    <div className="text-center">
                        <p className="text-xs font-bold uppercase tracking-wider text-muted mb-1">Last Order</p>
                        <p className="text-sm font-bold text-foreground">{formatDate(customer.last_order_date, "short")}</p>
                    </div>
                </div>

                {/* Timeline */}
                <div className="mt-4 flex items-center gap-2 text-xs text-muted">
                    <Calendar className="w-3.5 h-3.5" />
                    <span>Customer since {formatDate(customer.first_order_date, "short")}</span>
                    <span className="w-1 h-1 rounded-full bg-muted" />
                    <ShoppingBag className="w-3.5 h-3.5" />
                    <span>Last purchase {formatDate(customer.last_order_date, "relative")}</span>
                </div>
            </div>
        </motion.div>
    );
});
