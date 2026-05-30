"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    MoreVertical,
    User,
    BarChart3,
    GitCompare,
    Download,
    ExternalLink,
    Activity,
    Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";

interface QuickActionsMenuProps {
    employeeId: string;
    employeeName: string;
    onViewDetails?: () => void;
    onViewTimeline?: () => void;
    onCompare?: () => void;
    onViewSessions?: () => void;
    onExportReport?: () => void;
    className?: string;
}

interface MenuItem {
    icon: React.ElementType;
    label: string;
    onClick: () => void;
    color?: string;
}

export function QuickActionsMenu({
    employeeId,
    employeeName,
    onViewDetails,
    onViewTimeline,
    onCompare,
    onViewSessions,
    onExportReport,
    className,
}: QuickActionsMenuProps) {
    const { t } = useLanguage();
    const [isOpen, setIsOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    // Close on click outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }

        if (isOpen) {
            document.addEventListener("mousedown", handleClickOutside);
        }
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [isOpen]);

    // Close on escape
    useEffect(() => {
        function handleEscape(event: KeyboardEvent) {
            if (event.key === "Escape") {
                setIsOpen(false);
            }
        }

        if (isOpen) {
            document.addEventListener("keydown", handleEscape);
        }
        return () => document.removeEventListener("keydown", handleEscape);
    }, [isOpen]);

    const menuItems: MenuItem[] = [
        {
            icon: User,
            label: t("team.actions.viewDetails"),
            onClick: () => {
                onViewDetails?.();
                setIsOpen(false);
            },
            color: "text-blue-500",
        },
        {
            icon: Activity,
            label: t("team.actions.activityLog"),
            onClick: () => {
                onViewTimeline?.();
                setIsOpen(false);
            },
            color: "text-emerald-500",
        },
        {
            icon: GitCompare,
            label: t("team.actions.compare"),
            onClick: () => {
                onCompare?.();
                setIsOpen(false);
            },
            color: "text-violet-500",
        },
        {
            icon: Clock,
            label: t("team.actions.workSessions"),
            onClick: () => {
                onViewSessions?.();
                setIsOpen(false);
            },
            color: "text-amber-500",
        },
        {
            icon: Download,
            label: t("team.actions.exportReport"),
            onClick: () => {
                onExportReport?.();
                setIsOpen(false);
            },
            color: "text-gray-500",
        },
    ];

    return (
        <div ref={menuRef} className={cn("relative", className)}>
            {/* Trigger Button */}
            <button
                onClick={(e) => {
                    e.stopPropagation();
                    setIsOpen(!isOpen);
                }}
                className={cn(
                    "p-2 rounded-xl transition-all duration-200",
                    "hover:bg-muted/80 active:scale-95",
                    isOpen && "bg-muted"
                )}
            >
                <MoreVertical className="w-4 h-4 text-muted-foreground" />
            </button>

            {/* Dropdown Menu */}
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: -10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: -10 }}
                        transition={{ duration: 0.15 }}
                        className={cn(
                            "absolute left-0 top-full mt-2 z-50",
                            "bg-white rounded-2xl border border-border/50",
                            "shadow-xl shadow-black/10",
                            "min-w-[180px] overflow-hidden"
                        )}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="px-4 py-3 border-b border-border/50 bg-muted/30">
                            <p className="text-xs text-muted-foreground">{t("team.actions.quickActions")}</p>
                            <p className="text-sm font-semibold truncate">{employeeName}</p>
                        </div>

                        {/* Menu Items */}
                        <div className="py-2">
                            {menuItems.map((item, index) => (
                                <button
                                    key={item.label}
                                    onClick={item.onClick}
                                    className={cn(
                                        "w-full flex items-center gap-3 px-4 py-2.5",
                                        "text-sm text-foreground",
                                        "hover:bg-muted/50 transition-colors",
                                        "text-right"
                                    )}
                                >
                                    <item.icon className={cn("w-4 h-4", item.color)} />
                                    <span>{item.label}</span>
                                </button>
                            ))}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
