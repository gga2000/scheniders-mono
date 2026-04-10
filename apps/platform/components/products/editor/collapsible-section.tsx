"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

interface CollapsibleSectionProps {
    title: string;
    icon?: React.ReactNode;
    defaultOpen?: boolean;
    badge?: string | number;
    children: React.ReactNode;
}

export function CollapsibleSection({ title, icon, defaultOpen = false, badge, children }: CollapsibleSectionProps) {
    const [isOpen, setIsOpen] = useState(defaultOpen);

    return (
        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl overflow-hidden">
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-[var(--background)] transition-colors"
            >
                <div className="flex items-center gap-2">
                    {icon}
                    <h2 className="text-sm font-semibold text-muted uppercase tracking-wider">
                        {title}
                    </h2>
                    {badge !== undefined && (
                        <span className="ml-1 px-1.5 py-0.5 rounded-full text-xs bg-[var(--card-border)] text-muted">
                            {badge}
                        </span>
                    )}
                </div>
                <ChevronDown
                    className={`w-4 h-4 text-muted transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
                />
            </button>
            <AnimatePresence initial={false}>
                {isOpen && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2, ease: "easeInOut" }}
                        className="overflow-hidden"
                    >
                        <div className="px-6 pb-6 pt-2">
                            {children}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
