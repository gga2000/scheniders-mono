"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronUp } from "lucide-react";
import { cn } from "@scheniders/shared";

interface ScrollToTopButtonProps {
    /** Scroll threshold in pixels before the button appears */
    threshold?: number;
    /** Custom className for the button */
    className?: string;
}

export function ScrollToTopButton({
    threshold = 400,
    className,
}: ScrollToTopButtonProps) {
    const [isVisible, setIsVisible] = useState(false);
    const rafRef = useRef<number | null>(null);

    useEffect(() => {
        const handleScroll = () => {
            if (rafRef.current) return;
            rafRef.current = requestAnimationFrame(() => {
                setIsVisible(window.scrollY > threshold);
                rafRef.current = null;
            });
        };

        handleScroll();
        window.addEventListener("scroll", handleScroll, { passive: true });

        return () => {
            window.removeEventListener("scroll", handleScroll);
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
        };
    }, [threshold]);

    const scrollToTop = () => {
        window.scrollTo({
            top: 0,
            behavior: "smooth",
        });
    };

    return (
        <AnimatePresence>
            {isVisible && (
                <motion.div
                    initial={{ opacity: 0, y: -20, scale: 0.9 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -20, scale: 0.9 }}
                    transition={{
                        type: "spring",
                        stiffness: 400,
                        damping: 25,
                    }}
                    className="fixed top-24 left-1/2 -translate-x-1/2 z-40"
                >
                    <motion.button
                        onClick={scrollToTop}
                        className={cn(
                            "relative px-6 py-2.5 rounded-full",
                            "bg-[var(--card-bg)]/95 backdrop-blur-xl",
                            "border border-[var(--card-border)]",
                            "shadow-xl shadow-black/5",
                            "flex items-center gap-2",
                            "cursor-pointer",
                            "overflow-hidden",
                            "group",
                            "hover:shadow-lg transition-shadow duration-200",
                            className
                        )}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        aria-label="Scroll to top"
                    >
                        {/* Static gradient border — no infinite animation */}
                        <div
                            className="absolute inset-0 rounded-full opacity-60"
                            style={{
                                background: "linear-gradient(135deg, var(--pastel-green), var(--pastel-yellow), var(--pastel-purple))",
                            }}
                        />

                        {/* Inner background */}
                        <div className="absolute inset-[2px] rounded-full bg-[var(--card-bg)]" />

                        {/* Icon */}
                        <ChevronUp className="relative z-10 w-4 h-4 text-[var(--foreground)] group-hover:-translate-y-0.5 transition-transform duration-200" />

                        {/* Text */}
                        <span className="relative z-10 text-sm font-medium text-[var(--foreground)]">
                            Back to top
                        </span>
                    </motion.button>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
