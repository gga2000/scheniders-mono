'use client';

import React, { useRef } from 'react';
import { motion, useScroll, useTransform, AnimatePresence } from 'framer-motion';
import { Package, CheckCircle2, Clock, ChevronRight, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { ar } from 'date-fns/locale';

interface ActiveTask {
    id: string;
    orderId: string;
    customerName: string;
    duty: 'confirmation' | 'fulfillment';
    status: 'pending' | 'in_progress';
    assignedAt: string;
    priority: 'high' | 'medium' | 'low';
}

// Mock tasks for development
const MOCK_TASKS: ActiveTask[] = [
    {
        id: '1',
        orderId: 'ORD-2024-089',
        customerName: 'أحمد محمود',
        duty: 'confirmation',
        status: 'pending',
        assignedAt: new Date(Date.now() - 1000 * 60 * 15).toISOString(), // 15 mins ago
        priority: 'high'
    },
    {
        id: '2',
        orderId: 'ORD-2024-090',
        customerName: 'منى علي',
        duty: 'fulfillment',
        status: 'in_progress',
        assignedAt: new Date(Date.now() - 1000 * 60 * 45).toISOString(), // 45 mins ago
        priority: 'medium'
    },
    {
        id: '3',
        orderId: 'ORD-2024-091',
        customerName: 'سارة خالد',
        duty: 'confirmation',
        status: 'pending',
        assignedAt: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(), // 2 hours ago
        priority: 'low'
    },
    {
        id: '4',
        orderId: 'ORD-2024-092',
        customerName: 'عمر زيد',
        duty: 'fulfillment',
        status: 'pending',
        assignedAt: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString(), // 3 hours ago
        priority: 'medium'
    }
];

interface MyActiveDeskProps {
    profile: {
        display_name?: string | null;
        email?: string;
    } | null;
}

export function MyActiveDesk({ profile }: MyActiveDeskProps) {
    const listRef = useRef<HTMLDivElement>(null);
    const { scrollXProgress } = useScroll({ container: listRef });

    // Fade out edges based on scroll position
    const leftShadowOpacity = useTransform(scrollXProgress, [0, 0.05], [0, 1]);
    const rightShadowOpacity = useTransform(scrollXProgress, [0.95, 1], [1, 0]);

    if (!profile) return null;

    const firstName = profile.display_name?.split(' ')[0] || profile.email?.split('@')[0] || 'زميل';

    // Greeting based on time of day
    const hour = new Date().getHours();
    const greeting = hour < 12 ? 'صباح الخير' : hour < 18 ? 'مساء الخير' : 'مساء الخير';

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
                        <span className="text-blue-600 dark:text-blue-400">{firstName} 👋</span>
                    </div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        لديك <strong className="text-gray-900 dark:text-white">{MOCK_TASKS.length} مهام</strong> نشطة في مكتبك اليوم.
                    </p>
                </div>

                {/* Actions / Filter (Placeholder) */}
                <div className="flex items-center gap-2">
                    <button className="px-4 py-2 rounded-xl text-sm font-semibold bg-white dark:bg-[#1A1A1A] border border-gray-200 dark:border-white/10 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors shadow-sm">
                        عرض الكل
                    </button>
                    <button className="w-10 h-10 rounded-xl flex items-center justify-center bg-white dark:bg-[#1A1A1A] border border-gray-200 dark:border-white/10 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors shadow-sm text-gray-500">
                        <Settings className="w-4 h-4" />
                    </button>
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
                    <AnimatePresence>
                        {MOCK_TASKS.map((task, index) => (
                            <TaskCard key={task.id} task={task} index={index} />
                        ))}
                    </AnimatePresence>

                    {/* Add empty state if no tasks */}
                    {MOCK_TASKS.length === 0 && (
                        <div className="w-full py-12 flex flex-col items-center justify-center text-center bg-white/50 dark:bg-black/10 border border-dashed border-gray-200 dark:border-white/10 rounded-3xl backdrop-blur-md">
                            <div className="w-16 h-16 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-4 text-gray-400">
                                <CheckCircle2 className="w-8 h-8" />
                            </div>
                            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1">مكتبك فارغ!</h3>
                            <p className="text-sm text-gray-500 max-w-xs">لا توجد لديك مهام نشطة حالياً. يمكنك أخذ استراحة أو مساعدة زملائك.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

// Internal Task Card Component
function TaskCard({ task, index }: { task: ActiveTask, index: number }) {
    const isConfirmation = task.duty === 'confirmation';
    const isPending = task.status === 'pending';

    // Theming based on duty
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

    return (
        <motion.div
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.1, duration: 0.4, type: 'spring' }}
            className={cn(
                "group shrink-0 w-[280px] sm:w-[320px] rounded-3xl p-5 cursor-pointer snap-start",
                "bg-white dark:bg-[#1A1A1A] border-2 transition-all duration-300",
                isPending ? "border-gray-100 dark:border-white/5 hover:border-gray-200 dark:hover:border-white/10 shadow-sm hover:shadow-md"
                    : `${theme.border} shadow-md`
            )}
        >
            <div className="flex items-start justify-between mb-4">
                <div className={cn(
                    "px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider",
                    theme.bg, theme.text
                )}>
                    {isConfirmation ? 'تأكيد طلب' : 'تجهيز طلب'}
                </div>

                {task.priority === 'high' && (
                    <div className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse shadow-[0_0_8px_rgba(244,63,94,0.6)]" />
                )}
            </div>

            <div className="mb-5">
                <h4 className="text-xl font-bold text-gray-900 dark:text-white mb-1">{task.customerName}</h4>
                <p className="text-sm text-gray-500 font-mono tracking-tight">{task.orderId}</p>
            </div>

            <div className="flex items-center justify-between mt-auto border-t border-gray-100 dark:border-white/5 pt-4">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-500">
                    <Clock className="w-3.5 h-3.5" />
                    <span>{formatDistanceToNow(new Date(task.assignedAt), { addSuffix: true, locale: ar })}</span>
                </div>

                <div className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center transition-transform group-hover:scale-110",
                    isPending ? "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300" : theme.accent,
                    !isPending && "text-white shadow-lg"
                )}>
                    {isPending ? <ChevronRight className="w-4 h-4" /> : <Package className="w-4 h-4" />}
                </div>
            </div>
        </motion.div>
    );
}
