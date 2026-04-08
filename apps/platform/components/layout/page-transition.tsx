"use client";

import { motion } from "framer-motion";
import { ReactNode } from "react";

// ─── Shared Animation Constants ─────────────────────────────────────────────
// UI chrome easing — fast attack, soft land (ease-out-expo style)
export const EASE_CHROME = [0.16, 1, 0.3, 1] as const;

// Card spring — slightly underdamped for organic feel, no visible overshoot
export const SPRING_CARD = {
    type: "spring" as const,
    stiffness: 380,
    damping: 30,
    mass: 0.8,
};

// Panel reveal easing — smooth S-curve for height:0→auto collapsibles
export const EASE_PANEL = [0.25, 0.8, 0.25, 1] as const;

// Crossfade easing — standard material fade for skeleton→content blends
export const EASE_CROSSFADE = [0.4, 0, 0.2, 1] as const;

// ─── Variants ───────────────────────────────────────────────────────────────

interface PageTransitionProps {
    children: ReactNode;
    className?: string;
}

const pageVariants = {
    initial: {
        opacity: 0,
        y: 6,
    },
    animate: {
        opacity: 1,
        y: 0,
        transition: {
            duration: 0.35,
            ease: EASE_CHROME,
        },
    },
    exit: {
        opacity: 0,
        y: -4,
        transition: {
            duration: 0.2,
            ease: EASE_CHROME,
        },
    },
};

export function PageTransition({ children, className = "" }: PageTransitionProps) {
    return (
        <motion.div
            variants={pageVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className={className}
        >
            {children}
        </motion.div>
    );
}

// Stagger children animation wrapper
const staggerContainerVariants = {
    initial: {},
    animate: {
        transition: {
            staggerChildren: 0.04,
            delayChildren: 0.02,
        },
    },
};

const staggerItemVariants = {
    initial: {
        opacity: 0,
        y: 6,
    },
    animate: {
        opacity: 1,
        y: 0,
        transition: SPRING_CARD,
    },
};

export function StaggerContainer({ children, className = "" }: PageTransitionProps) {
    return (
        <motion.div
            variants={staggerContainerVariants}
            initial="initial"
            animate="animate"
            className={className}
        >
            {children}
        </motion.div>
    );
}

export function StaggerItem({ children, className = "" }: PageTransitionProps) {
    return (
        <motion.div variants={staggerItemVariants} className={className}>
            {children}
        </motion.div>
    );
}
