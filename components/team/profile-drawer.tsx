'use client';

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Activity, Package, Printer, RefreshCw, LogIn, Calendar, Clock, Mail, ShieldAlert, Truck, Settings, Edit3, AlertCircle } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { ar } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { EmployeeStats } from '@/lib/team-types';
import { ActivityLogEntry } from '@/lib/activity-logger';

interface ProfileDrawerProps {
    employee: EmployeeStats | null;
    isOpen: boolean;
    onClose: () => void;
}

export function ProfileDrawer({ employee, isOpen, onClose }: ProfileDrawerProps) {
    const [recentLogs, setRecentLogs] = useState<ActivityLogEntry[]>([]);
    const [loadingLogs, setLoadingLogs] = useState(false);
    const [logsError, setLogsError] = useState(false);

    useEffect(() => {
        if (isOpen && employee) {
            fetchUserLogs(employee.user_id);
            document.body.style.overflow = 'hidden';

            const handleKeyDown = (e: KeyboardEvent) => {
                if (e.key === 'Escape') onClose();
            };
            document.addEventListener('keydown', handleKeyDown);
            return () => {
                document.body.style.overflow = '';
                document.removeEventListener('keydown', handleKeyDown);
            };
        } else {
            document.body.style.overflow = '';
        }

        return () => {
            document.body.style.overflow = '';
        };
    }, [isOpen, employee, onClose]);

    const fetchUserLogs = async (userId: string) => {
        setLoadingLogs(true);
        setLogsError(false);
        const { data, error } = await supabase
            .from('activity_logs')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(15);

        if (error) {
            setLogsError(true);
            setRecentLogs([]);
        } else {
            setRecentLogs(data || []);
        }
        setLoadingLogs(false);
    };

    if (!employee) return null;

    const isOnline = employee.last_login_at ? new Date(employee.last_login_at).getTime() > Date.now() - 15 * 60 * 1000 : false;

    const getRoleInfo = (role: string) => {
        switch (role.toLowerCase()) {
            case 'admin': return { icon: ShieldAlert, color: 'text-amber-500', bg: 'bg-amber-100 dark:bg-amber-500/20', label: 'مسؤول' };
            case 'logistics':
            case 'delivery': return { icon: Truck, color: 'text-emerald-500', bg: 'bg-emerald-100 dark:bg-emerald-500/20', label: 'لوجستيات' };
            default: return { icon: Settings, color: 'text-blue-500', bg: 'bg-blue-100 dark:bg-blue-500/20', label: 'دعم' };
        }
    };

    const roleInfo = getRoleInfo(employee.role);
    const RoleIcon = roleInfo.icon;

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 transition-opacity"
                    />

                    {/* Drawer */}
                    <motion.div
                        initial={{ x: '100%', opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        exit={{ x: '100%', opacity: 0 }}
                        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                        className="fixed top-0 bottom-0 right-0 w-full max-w-md bg-white dark:bg-[#121212] shadow-2xl z-[60] flex flex-col border-l border-gray-200 dark:border-gray-800"
                    >
                        {/* Header Image / Pattern Background */}
                        <div className="h-48 bg-gradient-to-br from-[#1E1E1E] to-[#3A3A3A] dark:from-black dark:to-[#1A1A1A] relative overflow-hidden shrink-0">
                            {/* Decorative background circles */}
                            <div className="absolute top-[-50px] right-[-50px] w-48 h-48 bg-white/5 rounded-full blur-3xl" />
                            <div className="absolute bottom-[-20px] left-[-20px] w-32 h-32 bg-blue-500/20 rounded-full blur-2xl" />

                            <button
                                onClick={onClose}
                                aria-label="إغلاق"
                                className="absolute top-4 left-4 w-8 h-8 rounded-full bg-black/20 hover:bg-black/40 text-white flex items-center justify-center transition-colors backdrop-blur-md z-10"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        {/* Content Area */}
                        <div className="flex-1 overflow-y-auto px-6 pb-8 relative -top-16 custom-scrollbar">
                            {/* Profile Header section (overlapping the cover) */}
                            <div className="flex flex-col items-center mb-8 relative">
                                <div className="w-32 h-32 rounded-3xl overflow-hidden bg-gradient-to-br from-gray-100 to-gray-200 border-4 border-white dark:border-[#121212] shadow-2xl flex items-center justify-center relative z-10 mb-4">
                                    {employee.avatar_url ? (
                                        <img src={employee.avatar_url} alt="" className="w-full h-full object-cover" />
                                    ) : (
                                        <span className="text-4xl font-bold text-gray-700">
                                            {(employee.display_name || employee.user_email)?.[0]?.toUpperCase()}
                                        </span>
                                    )}
                                </div>

                                <h2 className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                                    {employee.display_name || employee.user_email?.split('@')[0]}
                                </h2>

                                <div className="flex items-center gap-2 mt-2">
                                    <div className={cn("px-2.5 py-1 rounded-full text-xs font-bold border flex items-center gap-1.5 shadow-sm", roleInfo.bg, roleInfo.color, "border-transparent")}>
                                        <RoleIcon className="w-3.5 h-3.5" />
                                        {roleInfo.label}
                                    </div>
                                    <div className={cn(
                                        "px-2.5 py-1 rounded-full text-xs font-bold border flex items-center gap-1.5 shadow-sm",
                                        isOnline ? "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-400 dark:border-transparent"
                                            : "bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-transparent"
                                    )}>
                                        {isOnline ? (
                                            <>
                                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                                متصل
                                            </>
                                        ) : (
                                            <>
                                                <Clock className="w-3.5 h-3.5" />
                                                {employee.last_login_at ? formatDistanceToNow(new Date(employee.last_login_at), { addSuffix: true, locale: ar }) : 'غير متصل'}
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Contact Info Card */}
                            <div className="bg-gray-50 dark:bg-[#1A1A1A] rounded-2xl p-4 mb-6 border border-gray-100 dark:border-transparent">
                                <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-3">معلومات التواصل</h3>
                                <div className="flex items-center gap-3 text-gray-600 dark:text-gray-400">
                                    <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-500/10 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0">
                                        <Mail className="w-4 h-4" />
                                    </div>
                                    <span className="text-sm font-medium truncate">{employee.user_email}</span>
                                </div>
                            </div>

                            {/* Stats Grid */}
                            <div className="grid grid-cols-2 gap-3 mb-8">
                                <div className="bg-gray-50 dark:bg-[#1A1A1A] p-4 rounded-2xl border border-gray-100 dark:border-transparent relative overflow-hidden group">
                                    <div className="absolute top-[-20px] right-[-20px] w-20 h-20 bg-blue-500/5 dark:bg-blue-500/10 rounded-full blur-xl group-hover:bg-blue-500/20 transition-colors" />
                                    <div className="w-8 h-8 rounded-xl bg-blue-100 dark:bg-blue-500/20 flex items-center justify-center mb-3">
                                        <Activity className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                                    </div>
                                    <p className="text-2xl font-bold text-gray-900 dark:text-white mb-1">{employee.total_actions}</p>
                                    <p className="text-xs text-gray-500 font-medium">إجمالي النشاط</p>
                                </div>

                                <div className="bg-gray-50 dark:bg-[#1A1A1A] p-4 rounded-2xl border border-gray-100 dark:border-transparent relative overflow-hidden group">
                                    <div className="absolute top-[-20px] right-[-20px] w-20 h-20 bg-emerald-500/5 dark:bg-emerald-500/10 rounded-full blur-xl group-hover:bg-emerald-500/20 transition-colors" />
                                    <div className="w-8 h-8 rounded-xl bg-emerald-100 dark:bg-emerald-500/20 flex items-center justify-center mb-3">
                                        <Package className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                                    </div>
                                    <p className="text-2xl font-bold text-gray-900 dark:text-white mb-1">{employee.orders_created}</p>
                                    <p className="text-xs text-gray-500 font-medium">طلبات جديدة</p>
                                </div>

                                <div className="bg-gray-50 dark:bg-[#1A1A1A] p-4 rounded-2xl border border-gray-100 dark:border-transparent relative overflow-hidden group">
                                    <div className="absolute top-[-20px] right-[-20px] w-20 h-20 bg-amber-500/5 dark:bg-amber-500/10 rounded-full blur-xl group-hover:bg-amber-500/20 transition-colors" />
                                    <div className="w-8 h-8 rounded-xl bg-amber-100 dark:bg-amber-500/20 flex items-center justify-center mb-3">
                                        <RefreshCw className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                                    </div>
                                    <p className="text-2xl font-bold text-gray-900 dark:text-white mb-1">{employee.status_changes}</p>
                                    <p className="text-xs text-gray-500 font-medium">تغيير حالة</p>
                                </div>

                                <div className="bg-gray-50 dark:bg-[#1A1A1A] p-4 rounded-2xl border border-gray-100 dark:border-transparent relative overflow-hidden group">
                                    <div className="absolute top-[-20px] right-[-20px] w-20 h-20 bg-purple-500/5 dark:bg-purple-500/10 rounded-full blur-xl group-hover:bg-purple-500/20 transition-colors" />
                                    <div className="w-8 h-8 rounded-xl bg-purple-100 dark:bg-purple-500/20 flex items-center justify-center mb-3">
                                        <Edit3 className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                                    </div>
                                    <p className="text-2xl font-bold text-gray-900 dark:text-white mb-1">{employee.orders_edited}</p>
                                    <p className="text-xs text-gray-500 font-medium">تعديل طلب</p>
                                </div>
                            </div>

                            {/* Action Audit Log */}
                            <div>
                                <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                                    <Calendar className="w-4 h-4 text-gray-400" />
                                    آخر النشاطات
                                </h3>

                                {loadingLogs ? (
                                    <div className="flex justify-center p-8">
                                        <RefreshCw className="w-6 h-6 text-gray-400 animate-spin" />
                                    </div>
                                ) : logsError ? (
                                    <div className="text-center p-8 bg-rose-50 dark:bg-rose-500/10 rounded-2xl border border-dashed border-rose-200 dark:border-rose-800">
                                        <AlertCircle className="w-8 h-8 text-rose-400 mx-auto mb-2" />
                                        <p className="text-sm text-rose-600 dark:text-rose-400 font-medium">تعذر تحميل السجلات</p>
                                        <button
                                            onClick={() => employee && fetchUserLogs(employee.user_id)}
                                            className="mt-2 text-xs text-rose-500 hover:text-rose-700 underline"
                                        >
                                            إعادة المحاولة
                                        </button>
                                    </div>
                                ) : recentLogs.length === 0 ? (
                                    <div className="text-center p-8 bg-gray-50 dark:bg-[#1A1A1A] rounded-2xl border border-dashed border-gray-200 dark:border-gray-800">
                                        <p className="text-sm text-gray-500">لا توجد سجلات حديثة</p>
                                    </div>
                                ) : (
                                    <div className="relative border-r-2 border-gray-100 dark:border-gray-800 mr-4 pr-6 space-y-6">
                                        {recentLogs.map((log) => {
                                            const getActionDetails = (action: string) => {
                                                switch (action) {
                                                    case 'order.create': return { icon: Package, color: 'text-emerald-500', bg: 'bg-emerald-100 dark:bg-emerald-500/20', label: 'إنشاء طلب' };
                                                    case 'order.status_change': return { icon: RefreshCw, color: 'text-amber-500', bg: 'bg-amber-100 dark:bg-amber-500/20', label: 'تغيير حالة' };
                                                    case 'order.edit': return { icon: Edit3, color: 'text-purple-500', bg: 'bg-purple-100 dark:bg-purple-500/20', label: 'تعديل' };
                                                    case 'order.print': return { icon: Printer, color: 'text-blue-500', bg: 'bg-blue-100 dark:bg-blue-500/20', label: 'طباعة' };
                                                    case 'user.login': return { icon: LogIn, color: 'text-gray-500', bg: 'bg-gray-100 dark:bg-gray-800', label: 'دخول النظام' };
                                                    default: return { icon: Activity, color: 'text-gray-500', bg: 'bg-gray-100 dark:bg-gray-800', label: action };
                                                }
                                            };
                                            const details = getActionDetails(log.action);
                                            const ActionIcon = details.icon;

                                            return (
                                                <div key={log.id} className="relative">
                                                    {/* Timeline Dot */}
                                                    <div className={cn("absolute -right-[33px] top-1 w-4 h-4 rounded-full border-[3px] border-white dark:border-[#121212] z-10", details.bg, details.color)} />

                                                    <div className="bg-gray-50 dark:bg-[#1A1A1A] p-3 rounded-2xl border border-gray-100 dark:border-transparent">
                                                        <div className="flex items-center justify-between mb-1">
                                                            <div className="flex items-center gap-2">
                                                                <div className={cn("w-6 h-6 rounded-lg flex items-center justify-center shrink-0", details.bg, details.color)}>
                                                                    <ActionIcon className="w-3.5 h-3.5" />
                                                                </div>
                                                                <span className="text-sm font-bold text-gray-900 dark:text-white">
                                                                    {details.label}
                                                                </span>
                                                            </div>
                                                            <span className="text-[10px] text-gray-400">
                                                                {formatDistanceToNow(new Date(log.created_at), { addSuffix: true, locale: ar })}
                                                            </span>
                                                        </div>
                                                        {log.details && Object.keys(log.details).length > 0 && (
                                                            <div className="mt-2 text-xs text-gray-500 dark:text-gray-400 bg-white dark:bg-black/20 p-2 rounded-xl">
                                                                {log.action === 'order.status_change' && log.details.newStatus ? (
                                                                    <span>تغيرت الحالة إلى: <strong className="text-gray-900 dark:text-white">{String(log.details.newStatus)}</strong></span>
                                                                ) : log.entity_id ? (
                                                                    <span>معرف الطلب: <strong className="text-gray-900 dark:text-white font-mono break-all">{log.entity_id}</strong></span>
                                                                ) : (
                                                                    <span className="truncate">تفاصيل إضافية مسجلة</span>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
