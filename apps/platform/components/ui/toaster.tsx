"use client";

import {
    Toast,
    ToastProvider,
    ToastTitle,
    ToastDescription,
    ToastAction,
    ToastViewport,
} from "@/components/ui/toast";
import { useToast } from "@/hooks/use-toast";

export function Toaster() {
    const { toasts } = useToast();

    return (
        <ToastProvider swipeDirection="right" duration={5000}>
            {toasts.map((t) => (
                <Toast
                    key={t.id}
                    variant={t.variant}
                    open={t.open}
                    duration={t.duration}
                    onOpenChange={(open) => {
                        if (!open) {
                            // Radix handles close via swipe/escape
                        }
                    }}
                >
                    <div>
                        <ToastTitle>{t.title}</ToastTitle>
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
            <ToastViewport />
        </ToastProvider>
    );
}
