"use client";

import {
    Toast,
    ToastProvider,
    ToastTitle,
    ToastDescription,
    ToastAction,
    ToastViewport,
} from "@/components/ui/toast";
import { useToast, dismissToast, updateToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { AnimatePresence } from "framer-motion";

export function Toaster() {
    const { toasts } = useToast();

    return (
        <ToastProvider swipeDirection="right" duration={5000}>
            <AnimatePresence>
                {toasts.map((t, index) => (
                    <Toast
                        key={t.id}
                        index={index}
                        variant={t.variant}
                        open={t.open}
                        duration={t.duration}
                        onClick={() => {
                            // Extend the toast timer by 5 seconds when clicked
                            updateToast(t.id, { duration: (t.duration || 5000) + 5000 });
                        }}
                        onOpenChange={(open) => {
                            if (!open) {
                                dismissToast(t.id);
                            }
                        }}
                    >
                        <div className="flex-1 w-full">
                            <ToastTitle className="flex items-center gap-2">
                                {t.title}
                                {t.count && t.count > 1 && (
                                    <span className="flex items-center justify-center rounded-full bg-zinc-200/80 dark:bg-zinc-800/80 px-1.5 py-0.5 text-[10px] font-bold text-zinc-600 dark:text-zinc-300">
                                        {t.count}
                                    </span>
                                )}
                            </ToastTitle>
                            {t.description && (
                                <ToastDescription>{t.description}</ToastDescription>
                            )}
                            {t.action && (
                                <ToastAction
                                    altText={t.action.label}
                                    onClick={t.action.onClick}
                                    isUndo={t.action.label.toLowerCase() === 'undo'}
                                >
                                    {t.action.label}
                                </ToastAction>
                            )}
                        </div>
                    </Toast>
                ))}
            </AnimatePresence>
            <ToastViewport />
        </ToastProvider>
    );
}
