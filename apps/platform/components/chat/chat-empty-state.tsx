// apps/platform/components/chat/chat-empty-state.tsx
"use client";
import type { LucideIcon } from "lucide-react";

/** Calm, centered empty state for chat surfaces (no order-domain coupling). */
export function ChatEmptyState({
    icon: Icon,
    title,
    description,
}: {
    icon: LucideIcon;
    title: string;
    description: string;
}) {
    return (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-10 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--card-bg)] text-muted-foreground shadow-sm ring-1 ring-[var(--card-border)]">
                <Icon className="h-6 w-6" />
            </span>
            <div>
                <p className="text-sm font-semibold text-foreground">{title}</p>
                <p className="mt-1 text-xs text-muted-foreground">{description}</p>
            </div>
        </div>
    );
}
