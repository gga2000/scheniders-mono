"use client";

import { motion } from "framer-motion";
import { Package, Truck, CheckCircle2, ShoppingCart } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export function OrdersLoader() {
    // Array of beautiful loading states to cycle through
    const states = [
        { icon: ShoppingCart, label: "Fetching orders...", color: "text-blue-500", bg: "bg-blue-500/10", border: "border-blue-500/20" },
        { icon: Package, label: "Processing data...", color: "text-amber-500", bg: "bg-amber-500/10", border: "border-amber-500/20" },
        { icon: Truck, label: "Preparing view...", color: "text-purple-500", bg: "bg-purple-500/10", border: "border-purple-500/20" },
        { icon: CheckCircle2, label: "Almost ready...", color: "text-emerald-500", bg: "bg-emerald-500/10", border: "border-emerald-500/20" }
    ];

    const [currentStateIndex, setCurrentStateIndex] = useState(0);

    useEffect(() => {
        const interval = setInterval(() => {
            setCurrentStateIndex((prev) => (prev + 1) % states.length);
        }, 1500);
        return () => clearInterval(interval);
    }, [states.length]);

    const CurrentIcon = states[currentStateIndex].icon;

    return (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background/80 backdrop-blur-xl overflow-hidden">
            {/* Ambient Background Glows */}
            <motion.div
                animate={{
                    scale: [1, 1.2, 1],
                    opacity: [0.3, 0.5, 0.3],
                    rotate: [0, 90, 0]
                }}
                transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
                className="absolute top-1/4 -left-32 w-96 h-96 bg-purple-500/20 rounded-full blur-[100px]"
            />
            <motion.div
                animate={{
                    scale: [1, 1.3, 1],
                    opacity: [0.2, 0.4, 0.2],
                    rotate: [0, -90, 0]
                }}
                transition={{ duration: 10, repeat: Infinity, ease: "easeInOut", delay: 1 }}
                className="absolute bottom-1/4 -right-32 w-[30rem] h-[30rem] bg-amber-500/20 rounded-full blur-[120px]"
            />

            {/* Central Animated Core */}
            <div className="relative flex flex-col items-center justify-center z-10 w-full max-w-md px-6">

                {/* 3D-like Icon Container */}
                <motion.div
                    initial={{ scale: 0.8, opacity: 0, y: 20 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    transition={{
                        type: "spring",
                        stiffness: 260,
                        damping: 20,
                    }}
                    className={cn(
                        "relative flex items-center justify-center w-32 h-32 rounded-[2rem] shadow-2xl backdrop-blur-md border border-white/20 transition-all duration-700",
                        states[currentStateIndex].bg,
                        states[currentStateIndex].border
                    )}
                >
                    {/* Pulsing rings behind icon */}
                    <motion.div
                        animate={{ scale: [1, 1.8], opacity: [0.8, 0] }}
                        transition={{ duration: 2, repeat: Infinity, ease: "easeOut" }}
                        className={cn("absolute inset-0 rounded-[2rem] border-2", states[currentStateIndex].border)}
                    />
                    <motion.div
                        animate={{ scale: [1, 2.2], opacity: [0.5, 0] }}
                        transition={{ duration: 2, repeat: Infinity, ease: "easeOut", delay: 0.5 }}
                        className={cn("absolute inset-0 rounded-[2rem] border", states[currentStateIndex].border)}
                    />

                    {/* Rotating Dashed Ring */}
                    <motion.svg
                        animate={{ rotate: 360 }}
                        transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
                        className={cn("absolute inset-2 w-[calc(100%-16px)] h-[calc(100%-16px)] opacity-50", states[currentStateIndex].color)}
                        viewBox="0 0 100 100"
                    >
                        <circle cx="50" cy="50" r="48" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="8 8" />
                    </motion.svg>

                    {/* Dynamic Icon with Keyframe crossfade */}
                    <motion.div
                        key={currentStateIndex} // Force re-render for spring animation on icon change
                        initial={{ scale: 0.5, opacity: 0, rotate: -30 }}
                        animate={{ scale: 1, opacity: 1, rotate: 0 }}
                        exit={{ scale: 0.5, opacity: 0, rotate: 30 }}
                        transition={{ type: "spring", stiffness: 300, damping: 20 }}
                        className={states[currentStateIndex].color}
                    >
                        <CurrentIcon className="w-14 h-14" strokeWidth={1.5} />
                    </motion.div>
                </motion.div>

                {/* Loading Text */}
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    className="mt-10 flex flex-col items-center"
                >
                    <div className="relative h-8 w-64 flex justify-center overflow-hidden">
                        <motion.span
                            key={currentStateIndex}
                            initial={{ y: 20, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            exit={{ y: -20, opacity: 0 }}
                            transition={{ type: "spring", stiffness: 300, damping: 25 }}
                            className="absolute text-xl font-bold tracking-tight text-foreground"
                        >
                            {states[currentStateIndex].label}
                        </motion.span>
                    </div>

                    {/* Animated Progress Bar */}
                    <div className="mt-6 w-48 h-1.5 bg-[var(--card-border)] rounded-full overflow-hidden relative">
                        <motion.div
                            animate={{
                                x: ["-100%", "200%"]
                            }}
                            transition={{
                                duration: 1.5,
                                repeat: Infinity,
                                ease: "easeInOut",
                            }}
                            className={cn(
                                "absolute inset-y-0 w-1/2 rounded-full transition-colors duration-500",
                                states[currentStateIndex].color.replace('text-', 'bg-')
                            )}
                        />
                    </div>
                </motion.div>

                {/* Staggered Ghost Cards in background for visual flair */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-[500px] -z-10 pointer-events-none perspective-[1000px]">
                    {[0, 1, 2].map((i) => (
                        <motion.div
                            key={i}
                            animate={{
                                y: [0, -20, 0],
                                rotateX: [20, 25, 20],
                                rotateY: [-10 + (i * 10), -5 + (i * 10), -10 + (i * 10)],
                                z: [-100 * (i + 1), -150 * (i + 1), -100 * (i + 1)]
                            }}
                            transition={{
                                duration: 4 + i,
                                repeat: Infinity,
                                ease: "easeInOut",
                                delay: i * 0.5
                            }}
                            className={cn(
                                "absolute top-[10%] left-[10%] w-[80%] h-32 rounded-3xl border border-white/5 opacity-20 backdrop-blur-[2px]",
                                i === 0 ? "bg-white/10 dark:bg-white/5" : i === 1 ? "bg-black/5 dark:bg-black/20" : "bg-primary/5"
                            )}
                            style={{
                                transformStyle: "preserve-3d",
                                translateY: `${i * 60}px`
                            }}
                        >
                            <div className="w-full h-full p-6 flex flex-col justify-between">
                                <div className="w-1/3 h-4 bg-foreground/20 rounded animate-pulse" />
                                <div className="flex justify-between items-end">
                                    <div className="w-12 h-12 bg-foreground/10 rounded-xl" />
                                    <div className="w-1/4 h-6 bg-foreground/20 rounded-full" />
                                </div>
                            </div>
                        </motion.div>
                    ))}
                </div>
            </div>
        </div>
    );
}
