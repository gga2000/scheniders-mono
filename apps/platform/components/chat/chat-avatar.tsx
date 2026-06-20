// apps/platform/components/chat/chat-avatar.tsx
"use client";
import { useState } from "react";
import { initials, colorFromId } from "@/lib/chat/avatar-identity";
import type { PresenceStatus } from "@/hooks/chat/use-tenant-presence";

const BOX = {
    xs: "h-6 w-6 text-[10px]",
    sm: "h-8 w-8 text-[11px]",
    md: "h-10 w-10 text-sm",
    lg: "h-12 w-12 text-base",
} as const;

const DOT = {
    xs: "h-2 w-2",
    sm: "h-2.5 w-2.5",
    md: "h-3 w-3",
    lg: "h-3.5 w-3.5",
} as const;

const STATUS_COLOR: Record<PresenceStatus | "offline", string> = {
    online: "bg-green-500",
    idle: "bg-amber-500",
    away: "bg-gray-300",
    offline: "",
};

export type ChatAvatarSize = keyof typeof BOX;

export function ChatAvatar({
    userId,
    name,
    avatarUrl,
    size = "sm",
    status = "offline",
    showStatus = false,
    ringClassName,
    dotBorderClassName = "border-[var(--background)]",
    className,
}: {
    userId: string;
    name: string;
    avatarUrl?: string | null;
    size?: ChatAvatarSize;
    status?: PresenceStatus | "offline";
    showStatus?: boolean;
    ringClassName?: string;
    dotBorderClassName?: string;
    className?: string;
}) {
    const [errored, setErrored] = useState(false);
    const color = colorFromId(userId);
    const showImg = !!avatarUrl && !errored;
    const dotColor = STATUS_COLOR[status];

    return (
        <span className={`relative inline-flex shrink-0 ${className ?? ""}`}>
            {showImg ? (
                // eslint-disable-next-line @next/next/no-img-element -- chat avatar needs an onError→initials fallback and xs sizing that the shared next/image Avatar cannot provide (same pattern already used in composer.tsx)
                <img
                    src={avatarUrl ?? undefined}
                    alt={name}
                    onError={() => setErrored(true)}
                    className={`rounded-full object-cover ${BOX[size]} ${ringClassName ?? ""}`}
                />
            ) : (
                <span
                    role="img"
                    aria-label={name}
                    className={`flex items-center justify-center rounded-full font-semibold ${BOX[size]} ${ringClassName ?? ""}`}
                    style={{ backgroundColor: color.bg, color: color.fg }}
                >
                    {initials(name)}
                </span>
            )}
            {showStatus && dotColor && (
                <span
                    className={`absolute -bottom-0.5 -right-0.5 rounded-full border-2 ${dotBorderClassName} ${DOT[size]} ${dotColor}`}
                />
            )}
        </span>
    );
}
