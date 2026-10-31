"use client";

import { useEffect, useCallback, useId } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { createPortal } from "react-dom";
import { useLanguage } from "@/hooks/use-language";

interface ModalShellProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    /** Optional icon before the title. */
    icon?: React.ReactNode;
    /** Optional line under the title. */
    description?: string;
    children: React.ReactNode;
    /** Optional action row pinned under the scrolling body. */
    footer?: React.ReactNode;
    maxWidth?: string;
}

/** The customers pages' dialog: Escape and backdrop close it, and it is announced as a modal dialog. */
export function ModalShell({ isOpen, onClose, title, icon, description, children, footer, maxWidth = "max-w-lg" }: ModalShellProps) {
    const { t } = useLanguage();
    const titleId = useId();
    const descriptionId = useId();
    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        if (e.key === "Escape") onClose();
    }, [onClose]);

    useEffect(() => {
        if (isOpen) {
            document.addEventListener("keydown", handleKeyDown);
            document.body.style.overflow = "hidden";
        }
        return () => {
            document.removeEventListener("keydown", handleKeyDown);
            document.body.style.overflow = "";
        };
    }, [isOpen, handleKeyDown]);

    if (typeof window === "undefined") return null;

    return createPortal(
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[100]">
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="customer-modal-backdrop absolute inset-0 bg-black/40 backdrop-blur-sm"
                        onClick={onClose}
                    />
                    <div className="absolute inset-0 flex items-center justify-center p-4 pointer-events-none">
                        <motion.div
                            role="dialog"
                            aria-modal="true"
                            aria-labelledby={titleId}
                            aria-describedby={description ? descriptionId : undefined}
                            initial={{ opacity: 0, scale: 0.95, y: 10 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 10 }}
                            transition={{ duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] }}
                            className={`customer-modal-surface pointer-events-auto bg-(--card-bg) rounded-[24px] border border-(--card-border) shadow-2xl w-full ${maxWidth} max-h-[85vh] overflow-hidden flex flex-col`}
                        >
                            {/* Header */}
                            <div className="flex items-start justify-between gap-4 px-6 py-5 border-b border-(--card-border)">
                                <div className="min-w-0">
                                    <h3 id={titleId} className="text-lg font-bold text-foreground flex items-center gap-2">
                                        {icon}
                                        {title}
                                    </h3>
                                    {description && <p id={descriptionId} className="text-sm text-muted-foreground mt-1">{description}</p>}
                                </div>
                                <button
                                    onClick={onClose}
                                    aria-label={t("common.close", "Close")}
                                    className="w-10 h-10 -m-1 shrink-0 flex items-center justify-center rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                            {/* Content */}
                            <div className="flex-1 overflow-y-auto px-6 py-5">
                                {children}
                            </div>
                            {footer && (
                                <div className="px-6 py-4 border-t border-(--card-border) flex items-center gap-3">
                                    {footer}
                                </div>
                            )}
                        </motion.div>
                    </div>
                </div>
            )}
        </AnimatePresence>,
        document.body
    );
}
