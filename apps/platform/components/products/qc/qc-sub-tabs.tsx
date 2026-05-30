"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Inbox, Microscope, CheckCheck, BarChart3 } from "lucide-react";
import { useLanguage } from "@/components/providers/language-provider";

export type QCTab = "pending" | "in_inspection" | "resolved" | "analytics";

interface QCSubTabsProps {
    active: QCTab;
    onChange: (tab: QCTab) => void;
    counts: { pending: number; in_inspection: number; resolved: number };
}

const TABS: { id: QCTab; labelKey: string; icon: any }[] = [
    { id: "pending", labelKey: "qc.tab.pending", icon: Inbox },
    { id: "in_inspection", labelKey: "qc.tab.inInspection", icon: Microscope },
    { id: "resolved", labelKey: "qc.tab.resolved", icon: CheckCheck },
    { id: "analytics", labelKey: "qc.tab.analytics", icon: BarChart3 },
];

export function QCSubTabs({ active, onChange, counts }: QCSubTabsProps) {
    const { t } = useLanguage();
    return (
        <div className="flex items-center gap-1 p-1 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl overflow-x-auto">
            {TABS.map(({ id, labelKey, icon: Icon }) => {
                const isActive = active === id;
                const count = id === "pending" ? counts.pending : id === "in_inspection" ? counts.in_inspection : id === "resolved" ? counts.resolved : null;
                return (
                    <button
                        key={id}
                        onClick={() => onChange(id)}
                        className={cn(
                            "relative flex items-center gap-2 px-3 md:px-4 py-2 rounded-lg text-sm font-medium transition whitespace-nowrap",
                            isActive ? "text-white" : "text-muted hover:text-foreground"
                        )}
                    >
                        {isActive && (
                            <motion.div
                                layoutId="qc-tab-active"
                                className="absolute inset-0 bg-[var(--ink)] rounded-lg"
                                transition={{ type: "spring", stiffness: 400, damping: 32 }}
                            />
                        )}
                        <Icon className="relative w-4 h-4" />
                        <span className="relative">{t(labelKey)}</span>
                        {count !== null && count > 0 && (
                            <span
                                className={cn(
                                    "relative px-1.5 min-w-[1.25rem] text-[10px] font-bold rounded-full text-center",
                                    isActive ? "bg-white/20 text-white" : "bg-amber-500/15 text-amber-700"
                                )}
                            >
                                {count}
                            </span>
                        )}
                    </button>
                );
            })}
        </div>
    );
}
