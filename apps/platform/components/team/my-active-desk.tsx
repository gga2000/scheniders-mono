'use client';

import React, { useRef, useState, useEffect } from 'react';
import { motion, useScroll, useTransform, AnimatePresence } from 'framer-motion';
import { Package, CheckCircle2, Clock, ChevronRight, RefreshCw, Printer, Edit3, LogIn, Activity } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { ar } from 'date-fns/locale';
import { supabase } from '@/lib/supabase';

interface RecentTask {
    id: string;
    action: string;
    entity_id: string | null;
    details: Record<string, unknown>;
    created_at: string;
}

interface MyActiveDeskProps {
    profile: {
        id?: string;
        display_name?: string | null;
        email?: string;
    } | null;
}

const ACTION_CONFIG: Record<string, { label: string; duty: 'confirmation' | 'fulfillment'; icon: React.ElementType; priority: 'high' | 'medium' | 'low' }> = {
    'order.create': { label: 'إنشاء طلب', duty: 'confirmation', icon: Package, priority: 'high' },
    'order.status_change': { label: 'تغيير حالة', duty: 'fulfillment', icon: RefreshCw, priority: 'medium' },
    'order.edit': { label: 'تعديل طلب', duty: 'confirmation', icon: Edit3, priority: 'medium' },
    'order.print': { label: 'طباعة طلب', duty: 'fulfillment', icon: Printer, priority: 'low' },
};

export function MyActiveDesk({ profile }: MyActiveDeskProps) {
    const listRef = useRef<HTMLDivElement>(null);
    const { scrollXProgress } = useScroll({ container: listRef });
    const [tasks, setTasks] = useState<RecentTask[]>([]);
    const [loading, setLoading] = useState(true);

    const leftShadowOpacity = useTransform(scrollXProgress, [0, 0.05], [0, 1]);
    const rightShadowOpacity = useTransform(scrollXProgress, [0.95, 1], [1, 0]);

    useEffect(() => {
        if (!profile?.id) {
            setLoading(false);
            return;
        }

        const fetchRecentTasks = async () => {
            setLoading(true);
            const todayStart = new Date();
            todayStart.setHours(0, 0, 0, 0);

            const { data, error } = await supabase
                .from('activity_logs')
                .select('id, action, entity_id, details, created_at')
                .eq('user_id', profile.id)
                .gte('created_at', todayStart.toISOString())
                .in('action', ['order.create', 'order.status_change', 'order.edit', 'order.print'])
                .order('created_at', { ascending: false })
                .limit(10);

            if (!error && data) {
                setTasks(data);
            }
            setLoading(false);
        };

        fetchRecentTasks();
    }, [profile?.id]);

    if (!profile) return null;

    const firstName = profile.display_name?.split(' ')[0] || profile.email?.split('@')[0] || 'زميل';

    const hour = new Date().getHours();
    const greeting = hour < 12 ? 'صباح الخير' : 'مساء الخير';

    return (
        <div className="mb-10 w-full relative">
            {/* Header / Greeting */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6"
            >
                <div>
                    <div className="flex items-center gap-2 text-2xl font-bold text-gray-900 dark:text-white mb-1">
                        <span>{greeting}،</span>
                        <span className="text-blue-600 dark:text-blue-400">{firstName}</span>
                    </div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        {loading ? (
                            'جاري التحميل...'
                        ) : tasks.length > 0 ? (
                            <>لديك <strong className="text-gray-900 dark:text-white">{tasks.length} نشاطات</strong> اليوم.</>
                        ) : (
                            'لا توجد نشاطات حتى الآن اليوم.'
                        )}
                    </p>
                </div>
            </motion.div>

            {/* Horizontal Task List */}
            <div className="relative w-full rounded-3xl overflow-hidden">
                {/* Fade Indicators for scrolling */}
                <motion.div
                    style={{ opacity: leftShadowOpacity }}
                    className="absolute top-0 bottom-0 left-0 w-16 bg-gradient-to-r from-gray-50 dark:from-[#121212] to-transparent z-10 pointer-events-none"
                />
                <motion.div
                    style={{ opacity: rightShadowOpacity }}
                    className="absolute top-0 bottom-0 right-0 w-16 bg-gradient-to-l from-gray-50 dark:from-[#121212] to-transparent z-10 pointer-events-none"
                />

                <div
                    ref={listRef}
                    className="flex items-center gap-4 overflow-x-auto pb-4 pt-2 px-1 snap-x snap-mandatory hide-scrollbar"
                >
                    {loading ? (
                        // Loading skeleton cards
                        Array.from({ length: 3 }).map((_, i) => (
                            <div key={i} className="shrink-0 w-[280px] sm:w-[320px] rounded-3xl p-5 bg-white dark:bg-[#1A1A1A] border-2 border-gray-100 dark:border-white/5 animate-pulse">
                                <div className="h-6 w-24 bg-gray-100 dark:bg-gray-800 rounded-full mb-4" />
                                <div className="h-6 w-40 bg-gray-100 dark:bg-gray-800 rounded mb-2" />
                                <div className="h-4 w-28 bg-gray-50 dark:bg-gray-800/50 rounded" />
                            </div>
                        ))
                    ) : (
                        <AnimatePresence>
                            {tasks.map((task, index) => (
                                <TaskCard key={task.id} task={task} index={index} />
                            ))}
                        </AnimatePresence>
                    )}

                    {/* Empty state */}
                    {!loading && tasks.length === 0 && (
                        <div className="w-full py-12 flex flex-col items-center justify-center text-center bg-white/50 dark:bg-black/10 border border-dashed border-gray-200 dark:border-white/10 rounded-3xl backdrop-blur-md">
                            <div className="w-16 h-16 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-4 text-gray-400">
                                <CheckCircle2 className="w-8 h-8" />
                            </div>
                            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1">مكتبك فارغ!</h3>
                            <p className="text-sm text-gray-500 max-w-xs">لا توجد لديك نشاطات حالياً اليوم.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

// Internal Task Card Component
function TaskCard({ task, index }: { task: RecentTask; index: number }) {
    const config = ACTION_CONFIG[task.action] || { label: task.action, duty: 'confirmation' as const, icon: Activity, priority: 'low' as const };
    const isConfirmation = config.duty === 'confirmation';
    const TaskIcon = config.icon;

    const theme = isConfirmation
        ? {
            bg: 'bg-indigo-50 dark:bg-indigo-500/10 hover:bg-indigo-100 dark:hover:bg-indigo-500/20',
            border: 'border-indigo-100 dark:border-indigo-500/20',
            text: 'text-indigo-700 dark:text-indigo-400',
            accent: 'bg-indigo-500 shadow-indigo-500/30'
        }
        : {
            bg: 'bg-emerald-50 dark:bg-emerald-500/10 hover:bg-emerald-100 dark:hover:bg-emerald-500/20',
            border: 'border-emerald-100 dark:border-emerald-500/20',
            text: 'text-emerald-700 dark:text-emerald-400',
            accent: 'bg-emerald-500 shadow-emerald-500/30'
        };

    const entityDisplay = task.entity_id
        ? task.entity_id.length > 12 ? `...${task.entity_id.slice(-8)}` : task.entity_id
        : '';

    const statusDetail = task.action === 'order.status_change' && task.details?.newStatus
        ? String(task.details.newStatus)
        : null;

    return (
        <motion.div
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.1, duration: 0.4, type: 'spring' }}
            className={cn(
                "group shrink-0 w-[280px] sm:w-[320px] rounded-3xl p-5 snap-start",
                "bg-white dark:bg-[#1A1A1A] border-2 transition-all duration-300",
                `${theme.border} shadow-sm hover:shadow-md`
            )}
        >
            <div className="flex items-start justify-between mb-4">
                <div className={cn(
                    "px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider",
                    theme.bg, theme.text
                )}>
                    {config.label}
                </div>

                {config.priority === 'high' && (
                    <div className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse shadow-[0_0_8px_rgba(244,63,94,0.6)]" />
                )}
            </div>

            <div className="mb-5">
                <div className="flex items-center gap-2 mb-1">
                    <TaskIcon className={cn("w-5 h-5", theme.text)} />
                    <h4 className="text-lg font-bold text-gray-900 dark:text-white">{config.label}</h4>
                </div>
                {entityDisplay && (
                    <p className="text-sm text-gray-500 font-mono tracking-tight">{entityDisplay}</p>
                )}
                {statusDetail && (
                    <p className="text-xs text-gray-400 mt-1">الحالة الجديدة: <strong className="text-gray-700 dark:text-gray-300">{statusDetail}</strong></p>
                )}
            </div>

            <div className="flex items-center justify-between mt-auto border-t border-gray-100 dark:border-white/5 pt-4">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-500">
                    <Clock className="w-3.5 h-3.5" />
                    <span>{formatDistanceToNow(new Date(task.created_at), { addSuffix: true, locale: ar })}</span>
                </div>

                <div className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center",
                    theme.accent, "text-white shadow-lg"
                )}>
                    <TaskIcon className="w-4 h-4" />
                </div>
            </div>
        </motion.div>
    );
}
