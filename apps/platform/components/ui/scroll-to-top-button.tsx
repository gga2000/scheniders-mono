"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

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

    useEffect(() => {
        const handleScroll = () => {
            setIsVisible(window.scrollY > threshold);
        };

        handleScroll();
        window.addEventListener("scroll", handleScroll, { passive: true });

        return () => {
            window.removeEventListener("scroll", handleScroll);
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
                            className
                        )}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        aria-label="Scroll to top"
                    >
                        {/* Animated gradient background */}
                        <motion.div
                            className="absolute inset-0 rounded-full opacity-60"
                            style={{
                                background: "linear-gradient(90deg, var(--pastel-green), var(--pastel-yellow), var(--pastel-purple), var(--pastel-green))",
                                backgroundSize: "300% 100%",
                            }}
                            animate={{
                                backgroundPosition: ["0% 50%", "100% 50%", "0% 50%"],
                            }}
                            transition={{
                                duration: 4,
                                repeat: Infinity,
                                ease: "linear",
                            }}
                        />

                        {/* Inner content background */}
                        <div className="absolute inset-[2px] rounded-full bg-[var(--card-bg)]" />

                        {/* Shimmer effect */}
                        <motion.div
                            className="absolute inset-0 rounded-full"
                            style={{
                                background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)",
                            }}
                            animate={{
                                x: ["-100%", "200%"],
                            }}
                            transition={{
                                duration: 2,
                                repeat: Infinity,
                                repeatDelay: 1,
                                ease: "easeInOut",
                            }}
                        />

                        {/* Pulsating glow ring */}
                        <motion.div
                            className="absolute -inset-1 rounded-full"
                            style={{
                                background: "linear-gradient(90deg, var(--pastel-green), var(--pastel-yellow), var(--pastel-purple))",
                                filter: "blur(8px)",
                            }}
                            animate={{
                                opacity: [0.3, 0.6, 0.3],
                                scale: [1, 1.02, 1],
                            }}
                            transition={{
                                duration: 2,
                                repeat: Infinity,
                                ease: "easeInOut",
                            }}
                        />

                        {/* Icon with bounce animation */}
                        <motion.div
                            className="relative z-10"
                            animate={{
                                y: [0, -2, 0],
                            }}
                            transition={{
                                duration: 1,
                                repeat: Infinity,
                                ease: "easeInOut",
                            }}
                        >
                            <ChevronUp className="w-4 h-4 text-[var(--foreground)]" />
                        </motion.div>

                        {/* Text */}
                        <span className="relative z-10 text-sm font-medium text-[var(--foreground)]">
                            Back to top
                        </span>

                        {/* Hover sparkle particles */}
                        <motion.div
                            className="absolute inset-0 rounded-full pointer-events-none opacity-0 group-hover:opacity-100"
                            transition={{ duration: 0.3 }}
                        >
                            {[...Array(3)].map((_, i) => (
                                <motion.span
                                    key={i}
                                    className="absolute w-1 h-1 bg-white rounded-full"
                                    style={{
                                        left: `${20 + i * 30}%`,
                                        top: "50%",
                                    }}
                                    animate={{
                                        y: [0, -8, 0],
                                        opacity: [0, 1, 0],
                                        scale: [0.5, 1, 0.5],
                                    }}
                                    transition={{
                                        duration: 1,
                                        repeat: Infinity,
                                        delay: i * 0.2,
                                        ease: "easeOut",
                                    }}
                                />
                            ))}
                        </motion.div>
                    </motion.button>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
