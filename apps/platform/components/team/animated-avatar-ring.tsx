"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface AnimatedAvatarRingProps {
    avatarUrl: string | null;
    displayName: string | null;
    email: string;
    isOnline: boolean;
    isPulsing?: boolean;
    activityLevel?: number; // 0-100, determines ring intensity
    size?: "sm" | "md" | "lg";
    className?: string;
}

const SIZE_CONFIG = {
    sm: {
        container: "w-10 h-10",
        ring: "w-12 h-12",
        avatar: "w-10 h-10",
        text: "text-sm",
        indicator: "w-3 h-3 -bottom-0.5 -right-0.5",
    },
    md: {
        container: "w-14 h-14",
        ring: "w-16 h-16",
        avatar: "w-14 h-14",
        text: "text-lg",
        indicator: "w-4 h-4 -bottom-1 -right-1",
    },
    lg: {
        container: "w-20 h-20",
        ring: "w-24 h-24",
        avatar: "w-20 h-20",
        text: "text-2xl",
        indicator: "w-5 h-5 -bottom-1 -right-1",
    },
};

// Generate gradient based on activity level
function getActivityGradient(level: number): string {
    if (level >= 80) {
        return "from-emerald-400 via-green-500 to-teal-500";
    } else if (level >= 60) {
        return "from-blue-400 via-cyan-500 to-teal-400";
    } else if (level >= 40) {
        return "from-violet-400 via-purple-500 to-indigo-500";
    } else if (level >= 20) {
        return "from-amber-400 via-orange-500 to-yellow-500";
    }
    return "from-slate-300 via-gray-400 to-slate-500";
}

export function AnimatedAvatarRing({
    avatarUrl,
    displayName,
    email,
    isOnline,
    isPulsing = false,
    activityLevel = 50,
    size = "md",
    className,
}: AnimatedAvatarRingProps) {
    const config = SIZE_CONFIG[size];
    const gradient = getActivityGradient(activityLevel);
    const initial = (displayName || email)?.[0]?.toUpperCase() || "?";

    return (
        <div className={cn("relative", config.container, className)}>
            {/* Animated gradient ring */}
            <motion.div
                className={cn(
                    "absolute inset-0 m-auto rounded-full",
                    "bg-gradient-to-r",
                    gradient,
                    config.ring
                )}
                style={{
                    transform: "translate(-50%, -50%)",
                    top: "50%",
                    left: "50%",
                }}
                animate={{
                    rotate: 360,
                    scale: isPulsing ? [1, 1.1, 1] : 1,
                }}
                transition={{
                    rotate: {
                        duration: 8,
                        repeat: Infinity,
                        ease: "linear",
                    },
                    scale: isPulsing
                        ? {
                            duration: 0.8,
                            repeat: 3,
                            ease: "easeInOut",
                        }
                        : undefined,
                }}
            />

            {/* Pulse effect overlay */}
            {isPulsing && (
                <motion.div
                    className={cn(
                        "absolute inset-0 m-auto rounded-full",
                        "bg-gradient-to-r",
                        gradient,
                        config.ring
                    )}
                    style={{
                        transform: "translate(-50%, -50%)",
                        top: "50%",
                        left: "50%",
                    }}
                    initial={{ opacity: 0.5, scale: 1 }}
                    animate={{ opacity: 0, scale: 1.5 }}
                    transition={{
                        duration: 1,
                        repeat: 3,
                        ease: "easeOut",
                    }}
                />
            )}

            {/* Avatar container (covers ring center) */}
            <div
                className={cn(
                    "absolute inset-0 m-auto rounded-full",
                    "bg-white p-0.5",
                    config.avatar
                )}
                style={{
                    transform: "translate(-50%, -50%)",
                    top: "50%",
                    left: "50%",
                }}
            >
                <div
                    className={cn(
                        "w-full h-full rounded-full overflow-hidden",
                        "bg-gradient-to-br from-primary/20 to-primary/5",
                        "flex items-center justify-center font-bold text-primary",
                        config.text
                    )}
                >
                    {avatarUrl ? (
                        <img
                            src={avatarUrl}
                            alt={displayName || email}
                            className="w-full h-full object-cover"
                        />
                    ) : (
                        initial
                    )}
                </div>
            </div>

            {/* Online indicator */}
            <div
                className={cn(
                    "absolute rounded-full border-2 border-white z-10",
                    config.indicator,
                    isOnline ? "bg-emerald-500" : "bg-zinc-300"
                )}
            >
                {isOnline && (
                    <motion.span
                        className="absolute inset-0 rounded-full bg-emerald-500"
                        animate={{ scale: [1, 1.5, 1], opacity: [1, 0, 1] }}
                        transition={{ duration: 2, repeat: Infinity }}
                    />
                )}
            </div>
        </div>
    );
}
