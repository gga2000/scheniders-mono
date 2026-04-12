"use client";

import { useRef, useState, useCallback } from "react";
import { motion, useMotionValue, useTransform, PanInfo } from "framer-motion";
import { Archive, Edit } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";

interface SwipeableCardProps {
    children: React.ReactNode;
    onSwipeLeft?: () => void;
    onSwipeRight?: () => void;
    leftLabel?: string;
    rightLabel?: string;
    disabled?: boolean;
}

const SWIPE_THRESHOLD = 80;
const SNAP_BACK_DURATION = 0.3;

export function SwipeableCard({
    children,
    onSwipeLeft,
    onSwipeRight,
    leftLabel,
    rightLabel,
    disabled = false,
}: SwipeableCardProps) {
    const { t } = useLanguage();
    const x = useMotionValue(0);
    const [swiping, setSwiping] = useState(false);

    // Background reveal opacity based on drag distance
    const leftBgOpacity = useTransform(x, [-SWIPE_THRESHOLD, 0], [1, 0]);
    const rightBgOpacity = useTransform(x, [0, SWIPE_THRESHOLD], [0, 1]);

    // Scale on action icons
    const leftIconScale = useTransform(x, [-SWIPE_THRESHOLD * 1.2, -SWIPE_THRESHOLD, 0], [1.1, 1, 0.5]);
    const rightIconScale = useTransform(x, [0, SWIPE_THRESHOLD, SWIPE_THRESHOLD * 1.2], [0.5, 1, 1.1]);

    const handleDragEnd = useCallback(
        (_: any, info: PanInfo) => {
            setSwiping(false);
            if (disabled) return;

            if (info.offset.x < -SWIPE_THRESHOLD && onSwipeLeft) {
                onSwipeLeft();
            } else if (info.offset.x > SWIPE_THRESHOLD && onSwipeRight) {
                onSwipeRight();
            }
        },
        [disabled, onSwipeLeft, onSwipeRight]
    );

    if (disabled || (!onSwipeLeft && !onSwipeRight)) {
        return <>{children}</>;
    }

    return (
        <div className="relative overflow-hidden rounded-[20px]">
            {/* Left action background (swipe right reveals edit) */}
            {onSwipeRight && (
                <motion.div
                    style={{ opacity: rightBgOpacity }}
                    className="absolute inset-0 bg-blue-500 flex items-center justify-start px-6 rounded-[20px]"
                >
                    <motion.div
                        style={{ scale: rightIconScale }}
                        className="flex flex-col items-center gap-1"
                    >
                        <Edit className="w-5 h-5 text-white" />
                        <span className="text-[10px] text-white font-medium">
                            {rightLabel || t("products.actions.editProduct")}
                        </span>
                    </motion.div>
                </motion.div>
            )}

            {/* Right action background (swipe left reveals archive) */}
            {onSwipeLeft && (
                <motion.div
                    style={{ opacity: leftBgOpacity }}
                    className="absolute inset-0 bg-amber-500 flex items-center justify-end px-6 rounded-[20px]"
                >
                    <motion.div
                        style={{ scale: leftIconScale }}
                        className="flex flex-col items-center gap-1"
                    >
                        <Archive className="w-5 h-5 text-white" />
                        <span className="text-[10px] text-white font-medium">
                            {leftLabel || t("products.actions.archive")}
                        </span>
                    </motion.div>
                </motion.div>
            )}

            {/* Draggable content */}
            <motion.div
                style={{ x }}
                drag="x"
                dragConstraints={{ left: onSwipeLeft ? -120 : 0, right: onSwipeRight ? 120 : 0 }}
                dragElastic={0.1}
                onDragStart={() => setSwiping(true)}
                onDragEnd={handleDragEnd}
                transition={{ type: "spring", damping: 25, stiffness: 300 }}
                className="relative z-10"
            >
                {children}
            </motion.div>
        </div>
    );
}
