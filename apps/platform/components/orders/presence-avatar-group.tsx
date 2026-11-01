"use client";

import { usePresence } from "@/hooks/use-presence";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import { UserCircle } from "lucide-react";

interface PresenceAvatarGroupProps {
    orderId: string;
    showLimit?: number;
    className?: string;
}

export function PresenceAvatarGroup({ orderId, showLimit = 3, className }: PresenceAvatarGroupProps) {
    const { t } = useLanguage();
    const { otherUsers, isConnected } = usePresence(orderId);

    if (!isConnected || otherUsers.length === 0) return null;

    const visibleUsers = otherUsers.slice(0, showLimit);
    const overflowCount = otherUsers.length - showLimit;

    return (
        <div
            className={cn("flex items-center -space-x-2 overflow-hidden py-1 px-1", className)}
            role="group"
            aria-label={t("orders.ui.viewersLabel")}
        >
            {visibleUsers.map((user) => (
                <div
                    key={user.id}
                    className="relative group cursor-help transition-transform hover:z-10 hover:scale-105"
                    title={`${user.display_name} (${user.role}) is viewing this page`}
                >
                    <div className="w-8 h-8 rounded-full border-2 border-white dark:border-gray-800 bg-gray-100 flex items-center justify-center overflow-hidden shadow-sm">
                        {user.avatar_url ? (
                            <picture>
                                {/* Next-Gen media logic: Let browser pick the best format if available via CDN */}
                                <source srcSet={`${user.avatar_url}?format=avif`} type="image/avif" />
                                <source srcSet={`${user.avatar_url}?format=webp`} type="image/webp" />
                                <img
                                    loading="lazy"
                                    decoding="async"
                                    // High priority for avatars as they represent live presence
                                    fetchPriority="high"
                                    src={user.avatar_url}
                                    alt={user.display_name}
                                    className="w-full h-full object-cover"
                                />
                            </picture>
                        ) : (
                            <UserCircle className="w-5 h-5 text-gray-400" />
                        )}
                    </div>
                    {/* Online indicator */}
                    <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 border-2 border-white dark:border-gray-800 rounded-full animate-pulse"></div>
                </div>
            ))}

            {overflowCount > 0 && (
                <div
                    className="w-8 h-8 rounded-full border-2 border-white dark:border-gray-800 bg-gray-50 dark:bg-gray-700 flex items-center justify-center text-xs font-medium text-gray-500 dark:text-gray-300 shadow-sm cursor-help"
                    title={`${overflowCount} more users online`}
                >
                    +{overflowCount}
                </div>
            )}

            {otherUsers.length > 0 && (
                <div className="ml-3 text-xs text-muted-foreground hidden sm:block">
                    {t("orders.ui.viewingNow")}
                </div>
            )}
        </div>
    );
}
