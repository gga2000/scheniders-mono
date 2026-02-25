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
    MoreHorizontal,
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

    // Helper to get days since last order easily
    const daysSinceLastOrder = customer.last_order_date
        ? Math.floor((new Date().getTime() - new Date(customer.last_order_date).getTime()) / (1000 * 3600 * 24))
        : 999;

    // New Tier Helper (Mock Data based on customer total spent for visual concept)
    const getCustomerTier = (spent: number) => {
        if (spent >= 10000000) return "Enterprise";
        if (spent >= 5000000) return "Mid-Market";
        if (spent >= 1000000) return "SMB";
        return "Startup";
    };

    // New Status Badge System matching dark theme concept
    const renderStatusPill = () => {
        if (customer.calculated_status === "vip" || daysSinceLastOrder <= 30) {
            return (
                <span className="inline-flex items-center justify-center px-2.5 py-0.5 bg-green-100 text-green-800 dark:bg-[#00ff9d]/10 dark:text-[#00ff9d] rounded-full text-xs font-medium">
                    Healthy
                </span>
            );
        } else if (daysSinceLastOrder > 180) {
            return (
                <span className="inline-flex items-center justify-center px-2.5 py-0.5 bg-red-100 text-red-800 dark:bg-[#ff3366]/10 dark:text-[#ff3366] rounded-full text-xs font-medium">
                    At Risk
                </span>
            );
        } else {
            return (
                <span className="inline-flex items-center justify-center px-2.5 py-0.5 bg-yellow-100 text-yellow-800 dark:bg-yellow-500/10 dark:text-yellow-500 rounded-full text-xs font-medium">
                    Warning
                </span>
            );
        }
    };

    // Mock Engagement Sparklines SVG — neon colors matching reference
    const renderMockSparkline = () => {
        if (customer.calculated_status === "vip" || daysSinceLastOrder <= 30) {
            return (
                <div className="w-24 h-8">
                    <svg className="w-full h-full overflow-visible" viewBox="0 0 100 30">
                        <path d="M0 25 L 20 20 L 40 22 L 60 10 L 80 15 L 100 5" fill="none" stroke="#00ff9d" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="drop-shadow-md" />
                        <circle cx="100" cy="5" r="3" fill="#00ff9d" />
                    </svg>
                </div>
            );
        } else if (daysSinceLastOrder > 180) {
            return (
                <div className="w-24 h-8">
                    <svg className="w-full h-full overflow-visible" viewBox="0 0 100 30">
                        <path d="M0 5 L 20 10 L 40 15 L 60 15 L 80 25 L 100 28" fill="none" stroke="#ff3366" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="drop-shadow-md" />
                        <circle cx="100" cy="28" r="3" fill="#ff3366" />
                    </svg>
                </div>
            );
        } else {
            return (
                <div className="w-24 h-8">
                    <svg className="w-full h-full overflow-visible" viewBox="0 0 100 30">
                        <path d="M0 15 L 20 12 L 40 18 L 60 15 L 80 15 L 100 15" fill="none" stroke="#eab308" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        <circle cx="100" cy="15" r="3" fill="#eab308" />
                    </svg>
                </div>
            );
        }
    };

    // Mock Activity (Action + Time)
    const renderMockActivity = () => {
        // Deterministic mock based on phone
        const hash = (customer.phone.charCodeAt(customer.phone.length - 1) || 0) + (customer.name.length || 0);
        const activities = [
            { action: "Login", time: "2 mins ago" },
            { action: "Email Open", time: "3 days ago" },
            { action: "Ticket", time: "5 hours ago" },
            { action: "Order Placed", time: "Yesterday" }
        ];
        return activities[hash % activities.length];
    };

    // ULTRA-COMPACT VIEW (Level 2) - Seamless Datatable Row
    if (compact === 2) {
        // Initials avatar
        const initials = customer.name.substring(0, 2).toUpperCase();
        // Dot Color map — neon colors matching reference
        const dotColor = (customer.calculated_status === "vip" || daysSinceLastOrder <= 30) ? "bg-[#00ff9d]" : (daysSinceLastOrder > 180 ? "bg-[#ff3366] animate-pulse" : "bg-yellow-500");
        const activity = renderMockActivity();

        return (
            <motion.div
                layout={!isVirtualized}
                layoutId={getLayoutId(`customer-${customer.phone}`)}
                onClick={() => onViewDetails(customer.phone)}
                className={cn(
                    "group relative w-full isolate",
                    "grid grid-cols-[auto_2fr_1.5fr_1.5fr_1fr_1fr_auto] gap-4 items-center px-6 py-4",
                    "border-b border-slate-100 dark:border-white/5 last:border-0",
                    "hover:bg-slate-50 dark:hover:bg-white/5 transition-all cursor-pointer",
                    isSelected && "bg-slate-50 dark:bg-white/5"
                )}
            >
                {/* 1. Selection Checkbox */}
                <div className="w-10 flex justify-center">
                    {onToggleSelection ? (
                        <input
                            type="checkbox"
                            checked={isSelected}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => {
                                e.stopPropagation();
                                onToggleSelection(customer.phone);
                            }}
                            className="rounded border-slate-300 dark:border-slate-600 bg-transparent text-primary focus:ring-offset-0 focus:ring-primary"
                        />
                    ) : <div className="w-4" />}
                </div>

                {/* 2. Customer Avatar, Name, Tier */}
                <div className="flex items-center gap-3 min-w-0">
                    <div className="relative flex-shrink-0">
                        <div className="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-300 flex items-center justify-center text-sm font-bold ring-2 ring-white dark:ring-slate-700 shadow-sm">
                            {initials}
                        </div>
                        {/* Status Dot */}
                        <span className={cn("absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white dark:border-[#0f172a]", dotColor)} />
                    </div>
                    <div className="flex-1 min-w-0 text-left">
                        <div className="flex items-center gap-1.5">
                            <p className="font-bold text-sm text-slate-800 dark:text-white truncate leading-tight group-hover:text-primary transition-colors">{customer.name}</p>
                            {customer.is_blacklisted && <AlertTriangle className="w-3 h-3 text-red-500 flex-shrink-0" />}
                            {hasDuplicates && (
                                <button
                                    onClick={(e) => { e.stopPropagation(); onShowDuplicates?.(customer.phone); }}
                                    className="text-[10px] font-bold text-amber-500 bg-amber-500/10 px-1.5 rounded"
                                >
                                    Dupes
                                </button>
                            )}
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">Tier: {getCustomerTier(customer.total_spent)}</p>
                    </div>
                </div>

                {/* 3. Status Pill — centered */}
                <div className="text-center">
                    {renderStatusPill()}
                </div>

                {/* 4. Engagement Sparkline */}
                <div>
                    {renderMockSparkline()}
                </div>

                {/* 5. LTV — right-aligned, font-mono */}
                <div className="text-right">
                    <span className="text-sm font-mono font-medium text-slate-700 dark:text-slate-200">{formatIQD(customer.total_spent)}</span>
                </div>

                {/* 6. Activity — right-aligned */}
                <div className="text-right">
                    <div className="flex flex-col items-end">
                        <span className="text-slate-700 dark:text-slate-300 text-xs font-medium">{activity.action}</span>
                        <span className="text-slate-400 text-[10px]">{activity.time}</span>
                    </div>
                </div>

                {/* 7. Actions — Horizontal Dots */}
                <div className="w-10 flex justify-end">
                    <button className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-white/10 text-slate-400 transition-colors">
                        <MoreHorizontal className="w-5 h-5" />
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
                            <p className="text-sm font-bold text-foreground">{customer.last_order_date ? formatDate(customer.last_order_date) : "-"}</p>
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

    // FULL VIEW (Level 0) - Data-Table Row (Matches Reference Design)
    const fullActivity = renderMockActivity();
    const fullDotColor = (customer.calculated_status === "vip" || daysSinceLastOrder <= 30) ? "bg-[#00ff9d]" : (daysSinceLastOrder > 180 ? "bg-[#ff3366] animate-pulse" : "bg-yellow-500");
    return (
        <motion.div
            layout={!isVirtualized}
            layoutId={getLayoutId(`customer-${customer.phone}`)}
            onClick={() => onViewDetails(customer.phone)}
            className={cn(
                "group relative w-full isolate",
                "hover:bg-slate-50 dark:hover:bg-white/5 transition-all cursor-pointer",
                "border-b border-slate-100 dark:border-white/5 last:border-0",
                "grid grid-cols-[auto_2fr_1.5fr_1.5fr_1fr_1fr_auto] gap-4 items-center px-6 py-4",
                isSelected && "bg-slate-50 dark:bg-white/5"
            )}
        >
            {/* Col 0: Selection Checkbox */}
            <div className="w-10 flex justify-center">
                {onToggleSelection && (
                    <input
                        type="checkbox"
                        checked={isSelected}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => {
                            e.stopPropagation();
                            onToggleSelection(customer.phone);
                        }}
                        className="rounded border-slate-300 dark:border-slate-600 bg-transparent text-primary focus:ring-offset-0 focus:ring-primary"
                    />
                )}
            </div>

            {/* Col 1: Avatar, Name, Tier (CUSTOMER) */}
            <div className="flex items-center gap-3 min-w-0">
                <div className="relative">
                    <div className="w-10 h-10 rounded-full flex items-center justify-center bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-300 ring-2 ring-white dark:ring-slate-700 shadow-sm">
                        {customer.name ? (
                            <span className="text-sm font-bold">
                                {customer.name.substring(0, 2).toUpperCase()}
                            </span>
                        ) : (
                            <User className="w-4 h-4" />
                        )}
                    </div>
                    {/* Tiny Status Dot */}
                    <span
                        className={cn("absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white dark:border-[#0f172a]", fullDotColor)}
                        title={getDormancyTooltip(customer.last_order_date)}
                    />
                </div>
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                        <p className="text-sm font-bold text-slate-800 dark:text-white truncate group-hover:text-primary transition-colors">{customer.name || customer.phone}</p>
                        {customer.is_blacklisted && <AlertTriangle className="w-3 h-3 text-red-500" />}
                        {hasDuplicates && (
                            <button
                                onClick={(e) => { e.stopPropagation(); onShowDuplicates?.(customer.phone); }}
                                className="text-[10px] font-bold text-amber-500 bg-amber-500/10 px-1.5 rounded"
                            >
                                Dupes
                            </button>
                        )}
                    </div>
                    <div className="text-xs text-slate-500">
                        Tier: {getCustomerTier(customer.total_spent)}
                    </div>
                </div>
            </div>

            {/* Col 2: Status Pill (STATUS) — centered */}
            <div className="text-center">
                {renderStatusPill()}
            </div>

            {/* Col 3: Engagement Sparkline (ENGAGEMENT) */}
            <div>
                {renderMockSparkline()}
            </div>

            {/* Col 4: LTV — right-aligned, font-mono */}
            <div className="text-right">
                <span className="text-sm font-mono font-medium text-slate-700 dark:text-slate-200">{formatIQD(customer.total_spent)}</span>
            </div>

            {/* Col 5: Activity — right-aligned */}
            <div className="text-right">
                <div className="flex flex-col items-end">
                    <span className="text-slate-700 dark:text-slate-300 text-xs font-medium">{fullActivity.action}</span>
                    <span className="text-slate-400 text-[10px]">{fullActivity.time}</span>
                </div>
            </div>

            {/* Col 6: Actions — Horizontal Dots */}
            <div className="w-10 flex justify-end">
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        setActionsOpen(!actionsOpen);
                    }}
                    className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-white/10 text-slate-400 transition-colors"
                >
                    <MoreHorizontal className="w-5 h-5" />
                </button>
            </div>
        </motion.div>
    );
});
