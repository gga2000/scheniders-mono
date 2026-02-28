'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { Employee, OrderDuty, EmployeeStatus } from '@/lib/team-types';

interface AvatarPillProps {
    employee: Employee;
    duty?: OrderDuty | null;
    size?: 'sm' | 'md' | 'lg';
    showTooltip?: boolean;
    tooltipText?: string;
    onRemove?: () => void;
    className?: string;
    interactive?: boolean;
}

export function AvatarPill({
    employee,
    duty,
    size = 'md',
    showTooltip = true,
    tooltipText,
    onRemove,
    className,
    interactive = false,
}: AvatarPillProps) {
    // Duty Colors map
    const getDutyColorClass = (d?: OrderDuty | null) => {
        if (!d) return 'bg-gray-100/50 border-gray-200/50 text-gray-700 dark:bg-gray-800/50 dark:border-gray-700/50 dark:text-gray-300';
        if (d === 'confirmation') return 'bg-blue-50/80 border-blue-200/50 text-blue-800 dark:bg-blue-900/30 dark:border-blue-700/50 dark:text-blue-300 shadow-[0_0_15px_rgba(59,130,246,0.15)] dark:shadow-[0_0_15px_rgba(59,130,246,0.1)]';
        if (d === 'fulfillment') return 'bg-orange-50/80 border-orange-200/50 text-orange-800 dark:bg-orange-900/30 dark:border-orange-700/50 dark:text-orange-300 shadow-[0_0_15px_rgba(249,115,22,0.15)] dark:shadow-[0_0_15px_rgba(249,115,22,0.1)]';
        return '';
    };

    // Employee Theme mappings (for fallback or general usage)
    const getThemeColorClass = (theme: string) => {
        switch (theme) {
            case 'gold': return 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-700/50';
            case 'blue': return 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-700/50';
            case 'green': return 'bg-green-100 text-green-800 border-green-200 dark:bg-green-900/40 dark:text-green-300 dark:border-green-700/50';
            case 'purple': return 'bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-900/40 dark:text-purple-300 dark:border-purple-700/50';
            case 'pink': return 'bg-pink-100 text-pink-800 border-pink-200 dark:bg-pink-900/40 dark:text-pink-300 dark:border-pink-700/50';
            case 'orange': return 'bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-900/40 dark:text-orange-300 dark:border-orange-700/50';
            default: return 'bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-800/40 dark:text-gray-300 dark:border-gray-700/50';
        }
    }

    const getStatusColor = (status: EmployeeStatus) => {
        switch (status) {
            case 'online': return 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]';
            case 'away': return 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.6)]';
            case 'busy': return 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]';
            case 'offline': return 'bg-gray-400';
            default: return 'bg-gray-400';
        }
    };

    const dutyClass = duty ? getDutyColorClass(duty) : getThemeColorClass(employee.theme_color);

    const sizeClasses = {
        sm: {
            container: 'h-6 px-1.5 text-xs',
            avatar: 'w-4 h-4 text-[9px]',
            dot: 'w-1.5 h-1.5 -bottom-0.5 -right-0.5',
            close: 'w-3 h-3',
            gap: 'gap-1'
        },
        md: {
            container: 'h-8 px-2 text-sm',
            avatar: 'w-6 h-6 text-xs',
            dot: 'w-2 h-2 -bottom-0.5 -right-0.5',
            close: 'w-4 h-4',
            gap: 'gap-2'
        },
        lg: {
            container: 'h-10 px-3 text-base',
            avatar: 'w-8 h-8 text-sm',
            dot: 'w-2.5 h-2.5 -bottom-0.5 -right-0.5',
            close: 'w-5 h-5',
            gap: 'gap-3'
        }
    };

    const s = sizeClasses[size];

    // Get Initials
    const initials = `${employee.first_name[0]}${employee.last_name[0]}`.toUpperCase();

    // The inner content since we might wrap it in a tooltip group
    const content = (
        <div
            className={cn(
                "relative inline-flex items-center rounded-full border backdrop-blur-sm transition-all duration-300 group/pill",
                dutyClass,
                s.container,
                s.gap,
                interactive && "hover:-translate-y-0.5 cursor-pointer hover:shadow-lg", // 3D lift effect
                className
            )}
        >
            {/* Avatar Circle */}
            <div className={cn(
                "relative flex-shrink-0 rounded-full flex items-center justify-center font-bold overflow-hidden bg-white/50 dark:bg-black/20",
                s.avatar
            )}>
                {employee.avatar_url ? (
                    <img loading="lazy" decoding="async" src={employee.avatar_url} alt={employee.first_name} className="w-full h-full object-cover" />
                ) : (
                    <span>{initials}</span>
                )}

                {/* Status Dot */}
                <span
                    className={cn(
                        "absolute rounded-full border border-white dark:border-gray-900 z-10",
                        getStatusColor(employee.status),
                        s.dot
                    )}
                />
            </div>

            {/* Name */}
            <span className="font-medium tracking-tight whitespace-nowrap">
                {employee.first_name} {size === 'lg' && employee.last_name}
            </span>

            {/* Remove Action (if provided) */}
            {onRemove && (
                <button
                    onClick={(e) => { e.stopPropagation(); onRemove(); }}
                    className={cn(
                        "rounded-full flex items-center justify-center transition-colors hover:bg-black/10 dark:hover:bg-white/20",
                        s.close
                    )}
                >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3/4 h-3/4">
                        <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                    </svg>
                </button>
            )}
        </div>
    );

    if (!showTooltip) return content;

    const defaultTooltip = duty ? `Assigned to ${employee.first_name} for ${duty}` : employee.first_name;

    return (
        <div className="relative group inline-block">
            {content}
            {/* Glassmorphic Tooltip */}
            <div className="absolute opacity-0 group-hover:opacity-100 bottom-full left-1/2 -translate-x-1/2 mb-2 pointer-events-none transition-opacity duration-200 z-50">
                <div className="px-3 py-1.5 bg-gray-900/90 dark:bg-gray-800/90 backdrop-blur-md text-white text-xs rounded-lg shadow-xl whitespace-nowrap border border-white/10 dark:border-gray-600/50">
                    {tooltipText || defaultTooltip}
                    {/* Tooltip subtle arrow */}
                    <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900/90 dark:border-t-gray-800/90" />
                </div>
            </div>
        </div>
    );
}

