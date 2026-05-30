"use client";

import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface ComingSoonProps {
    title: string;
    description: string;
    features: string[];
    icon?: LucideIcon;
}

export function ComingSoon({ title, description, features, icon: Icon = Sparkles }: ComingSoonProps) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border border-dashed border-[var(--card-border)] bg-[var(--card-bg)] p-10 text-center"
        >
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500/10 to-teal-500/10 flex items-center justify-center mx-auto mb-4">
                <Icon className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
            </div>
            <h3 className="text-lg font-bold text-foreground mb-1">{title}</h3>
            <p className="text-[13px] text-muted mb-5 max-w-md mx-auto">{description}</p>
            <div className="max-w-sm mx-auto text-left space-y-1.5">
                {features.map((f, i) => (
                    <div key={i} className="flex items-start gap-2 text-[12px] text-foreground/80">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
                        <span>{f}</span>
                    </div>
                ))}
            </div>
        </motion.div>
    );
}
