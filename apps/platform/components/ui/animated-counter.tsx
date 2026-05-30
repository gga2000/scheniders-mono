"use client";

import { AnimatePresence, motion } from "framer-motion";

interface AnimatedCounterProps {
    value: number;
    className?: string;
    format?: (n: number) => string;
}

/**
 * Odometer-style count — when value changes, the number rolls with a short
 * spring-based vertical slide. Used inside tier pills and result counters.
 */
export function AnimatedCounter({ value, className, format }: AnimatedCounterProps) {
    const display = format ? format(value) : value.toLocaleString("en-US");
    return (
        <span className={`relative inline-block overflow-hidden tabular-nums ${className ?? ""}`}>
            <AnimatePresence initial={false} mode="popLayout">
                <motion.span
                    key={display}
                    initial={{ y: 10, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: -10, opacity: 0 }}
                    transition={{ type: "spring", stiffness: 500, damping: 30, mass: 0.6 }}
                    className="inline-block"
                >
                    {display}
                </motion.span>
            </AnimatePresence>
        </span>
    );
}
