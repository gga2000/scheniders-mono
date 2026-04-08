"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    Crown,
    Medal,
    Award,
    Star,
    Flame,
    Trophy,
    ChevronLeft,
    ChevronRight,
    Sparkles,
    TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";

// Types
interface TopPerformer {
    userId: string;
    email: string;
    displayName: string | null;
    avatarUrl: string | null;
    totalActions: number;
    ordersCreated: number;
    rank: number;
}

interface EmployeeSpotlightProps {
    performers: TopPerformer[];
    autoPlayInterval?: number;
    onViewDetails?: (userId: string) => void;
}

// Rank configuration
const RANK_CONFIG = {
    1: {
        icon: Crown,
        color: "from-yellow-400 to-amber-500",
        bgColor: "bg-gradient-to-br from-yellow-50 to-amber-50",
        borderColor: "border-yellow-300",
        label: "المركز الأول",
        badge: "🥇",
    },
    2: {
        icon: Medal,
        color: "from-slate-300 to-slate-400",
        bgColor: "bg-gradient-to-br from-slate-50 to-gray-50",
        borderColor: "border-slate-300",
        label: "المركز الثاني",
        badge: "🥈",
    },
    3: {
        icon: Award,
        color: "from-orange-400 to-amber-600",
        bgColor: "bg-gradient-to-br from-orange-50 to-amber-50",
        borderColor: "border-orange-300",
        label: "المركز الثالث",
        badge: "🥉",
    },
};

// Performer Card
function PerformerCard({
    performer,
    isActive,
    onClick,
}: {
    performer: TopPerformer;
    isActive: boolean;
    onClick?: () => void;
}) {
    const config = RANK_CONFIG[performer.rank as keyof typeof RANK_CONFIG];
    const Icon = config?.icon || Star;

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{
                opacity: isActive ? 1 : 0.6,
                scale: isActive ? 1 : 0.85,
                y: isActive ? 0 : 10,
            }}
            transition={{ duration: 0.4 }}
            onClick={onClick}
            className={cn(
                "relative cursor-pointer transition-all duration-300",
                "rounded-3xl border-2 p-6",
                config?.bgColor || "bg-white",
                config?.borderColor || "border-border",
                isActive && "shadow-2xl shadow-primary/10"
            )}
        >
            {/* Sparkle effects for rank 1 */}
            {performer.rank === 1 && isActive && (
                <>
                    <motion.div
                        className="absolute -top-2 -right-2"
                        animate={{ rotate: 360, scale: [1, 1.2, 1] }}
                        transition={{ duration: 2, repeat: Infinity }}
                    >
                        <Sparkles className="w-6 h-6 text-yellow-500" />
                    </motion.div>
                    <motion.div
                        className="absolute -top-1 -left-1"
                        animate={{ rotate: -360, scale: [1, 1.1, 1] }}
                        transition={{ duration: 3, repeat: Infinity }}
                    >
                        <Star className="w-5 h-5 text-amber-400 fill-amber-400" />
                    </motion.div>
                </>
            )}

            {/* Rank Badge */}
            <div className="absolute -top-4 right-1/2 translate-x-1/2">
                <div
                    className={cn(
                        "w-12 h-12 rounded-full flex items-center justify-center",
                        "bg-gradient-to-br shadow-lg",
                        config?.color || "from-primary to-primary/80"
                    )}
                >
                    <Icon className="w-6 h-6 text-white" />
                </div>
            </div>

            {/* Content */}
            <div className="text-center pt-6">
                {/* Avatar */}
                <div className="relative mx-auto w-20 h-20 mb-4">
                    <div
                        className={cn(
                            "w-full h-full rounded-2xl overflow-hidden",
                            "bg-gradient-to-br from-primary/20 to-primary/5",
                            "flex items-center justify-center text-2xl font-bold text-primary",
                            "border-4 border-white shadow-lg"
                        )}
                    >
                        {performer.avatarUrl ? (
                            <img
                                src={performer.avatarUrl}
                                alt={performer.displayName || ""}
                                className="w-full h-full object-cover"
                            />
                        ) : (
                            (performer.displayName || performer.email)?.[0]?.toUpperCase() || "?"
                        )}
                    </div>
                    {/* Flame for high performers */}
                    {performer.rank === 1 && (
                        <motion.div
                            className="absolute -bottom-1 -right-1"
                            animate={{ scale: [1, 1.2, 1], y: [0, -2, 0] }}
                            transition={{ duration: 1.5, repeat: Infinity }}
                        >
                            <Flame className="w-6 h-6 text-orange-500" />
                        </motion.div>
                    )}
                </div>

                {/* Name */}
                <h3 className="text-lg font-bold text-foreground mb-1">
                    {performer.displayName || performer.email?.split("@")[0]}
                </h3>
                <p className="text-xs text-muted-foreground mb-4">
                    {config?.label || `#${performer.rank}`}
                </p>

                {/* Stats */}
                <div className="grid grid-cols-2 gap-3">
                    <div className="bg-white/70 rounded-xl p-3">
                        <p className="text-2xl font-bold text-foreground">{performer.totalActions}</p>
                        <p className="text-[10px] text-muted-foreground">إجمالي النشاطات</p>
                    </div>
                    <div className="bg-white/70 rounded-xl p-3">
                        <p className="text-2xl font-bold text-emerald-600">{performer.ordersCreated}</p>
                        <p className="text-[10px] text-muted-foreground">طلبات جديدة</p>
                    </div>
                </div>
            </div>
        </motion.div>
    );
}

export function EmployeeSpotlight({
    performers,
    autoPlayInterval = 5000,
    onViewDetails,
}: EmployeeSpotlightProps) {
    const [activeIndex, setActiveIndex] = useState(0);
    const [isPaused, setIsPaused] = useState(false);

    // Only show top 3
    const topPerformers = useMemo(() => performers.slice(0, 3), [performers]);

    // Auto-rotate
    useEffect(() => {
        if (isPaused || topPerformers.length <= 1) return;

        const interval = setInterval(() => {
            setActiveIndex((prev) => (prev + 1) % topPerformers.length);
        }, autoPlayInterval);

        return () => clearInterval(interval);
    }, [isPaused, topPerformers.length, autoPlayInterval]);

    const handlePrev = useCallback(() => {
        setActiveIndex((prev) => (prev - 1 + topPerformers.length) % topPerformers.length);
    }, [topPerformers.length]);

    const handleNext = useCallback(() => {
        setActiveIndex((prev) => (prev + 1) % topPerformers.length);
    }, [topPerformers.length]);

    if (topPerformers.length === 0) {
        return (
            <div className="text-center py-8 text-muted-foreground">
                <Trophy className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p>لا توجد بيانات كافية</p>
            </div>
        );
    }

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="relative"
            onMouseEnter={() => setIsPaused(true)}
            onMouseLeave={() => setIsPaused(false)}
        >
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">
                        <Trophy className="w-5 h-5 text-white" />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-foreground">أبطال الأسبوع</h2>
                        <p className="text-xs text-muted-foreground">أفضل المؤدين هذا الأسبوع</p>
                    </div>
                </div>

                {/* Navigation */}
                {topPerformers.length > 1 && (
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handlePrev}
                            className="p-2 rounded-xl bg-muted hover:bg-muted/80 transition-colors"
                        >
                            <ChevronRight className="w-4 h-4" />
                        </button>
                        <button
                            onClick={handleNext}
                            className="p-2 rounded-xl bg-muted hover:bg-muted/80 transition-colors"
                        >
                            <ChevronLeft className="w-4 h-4" />
                        </button>
                    </div>
                )}
            </div>

            {/* Carousel */}
            <div className="flex items-center justify-center gap-4 pb-4">
                <AnimatePresence mode="wait">
                    {topPerformers.map((performer, index) => (
                        <div
                            key={performer.userId}
                            className={cn(
                                "transition-all duration-300",
                                index === activeIndex ? "w-72" : "w-56 hidden md:block"
                            )}
                        >
                            <PerformerCard
                                performer={performer}
                                isActive={index === activeIndex}
                                onClick={() => {
                                    setActiveIndex(index);
                                    if (index === activeIndex) {
                                        onViewDetails?.(performer.userId);
                                    }
                                }}
                            />
                        </div>
                    ))}
                </AnimatePresence>
            </div>

            {/* Dots indicator */}
            {topPerformers.length > 1 && (
                <div className="flex items-center justify-center gap-2">
                    {topPerformers.map((_, index) => (
                        <button
                            key={index}
                            onClick={() => setActiveIndex(index)}
                            className={cn(
                                "w-2 h-2 rounded-full transition-all duration-300",
                                index === activeIndex
                                    ? "bg-primary w-6"
                                    : "bg-muted-foreground/30 hover:bg-muted-foreground/50"
                            )}
                        />
                    ))}
                </div>
            )}
        </motion.div>
    );
}
