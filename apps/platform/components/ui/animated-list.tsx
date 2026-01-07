"use client";

import { LayoutGroup, AnimatePresence, motion } from "framer-motion";
import { ReactNode } from "react";

interface AnimatedListProps {
    children: ReactNode;
    className?: string;
}

export function AnimatedList({ children, className }: AnimatedListProps) {
    return (
        <LayoutGroup>
            <motion.div layout className={className}>
                <AnimatePresence mode="popLayout" initial={false}>
                    {children}
                </AnimatePresence>
            </motion.div>
        </LayoutGroup>
    );
}

export const AnimatedItem = motion.div;
