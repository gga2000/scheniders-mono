'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Activity, Package, Printer, RefreshCw, ChevronRight, Settings, Truck, ShieldAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { ar } from 'date-fns/locale';
import { EmployeeStats } from '@/lib/team-types';

interface TeamMemberCardProps {
    employee: EmployeeStats;
    viewMode: 'grid' | 'list';
    onClick: () => void;
    rank?: number;
    delay?: number;
}

export function TeamMemberCard({ employee, viewMode, onClick, rank, delay = 0 }: TeamMemberCardProps) {
    const isOnline = employee.last_login_at ? new Date(employee.last_login_at).getTime() > Date.now() - 15 * 60 * 1000 : false;

    // Role-based theming
    const getRoleTheme = (role: string) => {
        switch (role.toLowerCase()) {
            case 'admin':
                return {
                    aura: 'from-amber-500/20 to-orange-500/20',
                    border: 'group-hover:border-amber-500/50',
                    icon: ShieldAlert,
                    iconColor: 'text-amber-500',
                    badge: 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-500/30'
                };
            case 'logistics':
            case 'delivery':
                return {
                    aura: 'from-emerald-500/20 to-teal-500/20',
                    border: 'group-hover:border-emerald-500/50',
                    icon: Truck,
                    iconColor: 'text-emerald-500',
                    badge: 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-500/30'
                };
            case 'support':
            default:
                return {
                    aura: 'from-blue-500/20 to-indigo-500/20',
                    border: 'group-hover:border-blue-500/50',
                    icon: Settings,
                    iconColor: 'text-blue-500',
                    badge: 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-500/20 dark:text-blue-300 dark:border-blue-500/30'
                };
        }
    };

    const theme = getRoleTheme(employee.role);
    const RoleIcon = theme.icon;

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onClick();
        }
    };

    if (viewMode === 'list') {
        return (
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay, duration: 0.3 }}
                onClick={onClick}
                onKeyDown={handleKeyDown}
                role="button"
                tabIndex={0}
                className={cn(
                    "group relative overflow-hidden cursor-pointer",
                    "bg-white/80 dark:bg-[#1A1A1A]/80 backdrop-blur-xl",
                    "border border-[#E8E4DC] dark:border-white/5 rounded-2xl p-4",
                    "hover:shadow-lg transition-all duration-300",
                    theme.border
                )}
            >
                <div className="flex items-center gap-4">
                    {/* Avatar */}
                    <div className="relative shrink-0">
                        <div className="w-12 h-12 rounded-xl overflow-hidden bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-900 border-2 border-white dark:border-gray-800 shadow-sm flex items-center justify-center">
                            {employee.avatar_url ? (
                                <img src={employee.avatar_url} alt="" className="w-full h-full object-cover" />
                            ) : (
                                <span className="text-lg font-bold text-gray-700 dark:text-gray-300">
                                    {(employee.display_name || employee.user_email)?.[0]?.toUpperCase()}
                                </span>
                            )}
                        </div>
                        <div className={cn(
                            "absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full border-2 border-white dark:border-[#1A1A1A]",
                            isOnline ? "bg-emerald-500" : "bg-gray-400"
                        )}>
                            {isOnline && <span className="absolute inset-0 rounded-full bg-emerald-500 animate-ping opacity-50" />}
                        </div>
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0 flex items-center justify-between">
                        <div>
                            <div className="flex items-center gap-2 mb-0.5">
                                <h3 className="font-bold text-gray-900 dark:text-white truncate">
                                    {employee.display_name || employee.user_email?.split('@')[0]}
                                </h3>
                                <div className={cn("px-2 py-0.5 rounded-md text-[10px] font-bold border capitalize flex items-center gap-1", theme.badge)}>
                                    <RoleIcon className="w-3 h-3" />
                                    {employee.role}
                                </div>
                            </div>
                            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{employee.user_email}</p>
                        </div>

                        {/* Quick Stats Grid */}
                        <div className="hidden md:flex items-center gap-6 px-6 border-l border-gray-200 dark:border-gray-800 rtl:border-l-0 rtl:border-r">
                            <div className="text-center">
                                <p className="text-[10px] text-gray-500 uppercase font-semibold">نشاط</p>
                                <p className="text-sm font-bold text-gray-900 dark:text-white">{employee.total_actions}</p>
                            </div>
                            <div className="text-center">
                                <p className="text-[10px] text-gray-500 uppercase font-semibold">طلبات</p>
                                <p className="text-sm font-bold text-gray-900 dark:text-white">{employee.orders_created}</p>
                            </div>
                            <div className="text-center">
                                <p className="text-[10px] text-gray-500 uppercase font-semibold">حالات</p>
                                <p className="text-sm font-bold text-gray-900 dark:text-white">{employee.status_changes}</p>
                            </div>
                        </div>
                    </div>

                    <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-blue-500 group-hover:translate-x-1 transition-all" />
                </div>
            </motion.div>
        );
    }

    // Grid View (Glassmorphic Card with Aura)
    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay, duration: 0.3 }}
            onClick={onClick}
            onKeyDown={handleKeyDown}
            role="button"
            tabIndex={0}
            className={cn(
                "group relative overflow-hidden cursor-pointer",
                "bg-white/80 dark:bg-[#1A1A1A]/80 backdrop-blur-2xl",
                "border border-[#E8E4DC] dark:border-white/5 rounded-3xl",
                "hover:shadow-2xl transition-all duration-500",
                theme.border
            )}
        >
            {/* Dynamic Glassmorphic Aura */}
            <div className={cn(
                "absolute -top-24 -right-24 w-48 h-48 rounded-full blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-700 bg-gradient-to-br",
                theme.aura
            )} />

            <div className="p-6 relative z-10">
                <div className="flex justify-between items-start mb-6">
                    <div className={cn("px-2.5 py-1 rounded-lg text-[10px] font-bold border capitalize flex items-center gap-1.5 shadow-sm", theme.badge)}>
                        <RoleIcon className="w-3.5 h-3.5" />
                        {employee.role}
                    </div>
                    {isOnline ? (
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 px-2 py-1 rounded-full">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            مباشر
                        </div>
                    ) : (
                        <div className="text-xs font-semibold text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-800/50 px-2 py-1 rounded-full">
                            {employee.last_login_at ? formatDistanceToNow(new Date(employee.last_login_at), { addSuffix: true, locale: ar }) : 'غير متصل'}
                        </div>
                    )}
                </div>

                <div className="flex flex-col items-center text-center">
                    <div className="relative mb-4 group-hover:-translate-y-1 transition-transform duration-300">
                        <div className="w-20 h-20 rounded-2xl overflow-hidden bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-900 border-[3px] border-white dark:border-[#222] shadow-xl flex items-center justify-center">
                            {employee.avatar_url ? (
                                <img src={employee.avatar_url} alt="" className="w-full h-full object-cover" />
                            ) : (
                                <span className="text-3xl font-bold text-gray-700 dark:text-gray-300">
                                    {(employee.display_name || employee.user_email)?.[0]?.toUpperCase()}
                                </span>
                            )}
                        </div>
                        {rank && rank <= 3 && (
                            <div className="absolute -bottom-2 -right-2 w-8 h-8 bg-amber-400 rounded-full flex items-center justify-center border-2 border-white shadow-md text-amber-900 font-bold text-sm">
                                #{rank}
                            </div>
                        )}
                    </div>

                    <h3 className="text-lg font-bold text-gray-900 dark:text-white truncate w-full mb-1">
                        {employee.display_name || employee.user_email?.split('@')[0]}
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400 truncate w-full mb-6 max-w-[200px] mx-auto">
                        {employee.user_email}
                    </p>

                    {/* Faux Performance Chart / Activity Stats */}
                    <div className="w-full grid grid-cols-3 gap-2 p-3 bg-gray-50/50 dark:bg-black/20 rounded-2xl border border-gray-100 dark:border-white/5">
                        <div className="flex flex-col items-center p-2 rounded-xl hover:bg-white dark:hover:bg-white/5 transition-colors">
                            <Activity className="w-4 h-4 text-blue-500 mb-1" />
                            <span className="text-lg font-bold text-gray-900 dark:text-white">{employee.total_actions}</span>
                            <span className="text-[9px] text-gray-500 uppercase tracking-wider">نشاط</span>
                        </div>
                        <div className="flex flex-col items-center p-2 rounded-xl hover:bg-white dark:hover:bg-white/5 transition-colors">
                            <Package className="w-4 h-4 text-emerald-500 mb-1" />
                            <span className="text-lg font-bold text-gray-900 dark:text-white">{employee.orders_created}</span>
                            <span className="text-[9px] text-gray-500 uppercase tracking-wider">طلبات</span>
                        </div>
                        <div className="flex flex-col items-center p-2 rounded-xl hover:bg-white dark:hover:bg-white/5 transition-colors">
                            <RefreshCw className="w-4 h-4 text-amber-500 mb-1" />
                            <span className="text-lg font-bold text-gray-900 dark:text-white">{employee.status_changes}</span>
                            <span className="text-[9px] text-gray-500 uppercase tracking-wider">حالات</span>
                        </div>
                    </div>
                </div>
            </div>
        </motion.div>
    );
}
