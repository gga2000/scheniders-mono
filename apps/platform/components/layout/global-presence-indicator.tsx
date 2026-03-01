"use client";

import { useState, useRef, useEffect } from "react";
import { useGlobalPresence } from "@/hooks/use-global-presence";
import { motion, AnimatePresence } from "framer-motion";
import { UserCircle, Users, Circle } from "lucide-react";
import { cn } from "@/lib/utils";

const AVATAR_SIZE = 32; // px
const OVERLAP = 8; // px

export function GlobalPresenceIndicator() {
    const { otherUsers, isConnected, totalOnline } = useGlobalPresence();
    const [isExpanded, setIsExpanded] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    // Debug logging
    useEffect(() => {
        console.log('[GlobalPresence] Debug:', {
            isConnected,
            otherUsersCount: otherUsers.length,
            totalOnline,
            otherUsers
        });
    }, [isConnected, otherUsers, totalOnline]);

    // Close dropdown when clicking outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsExpanded(false);
            }
        }

        if (isExpanded) {
            document.addEventListener("mousedown", handleClickOutside);
            return () => document.removeEventListener("mousedown", handleClickOutside);
        }
    }, [isExpanded]);

    if (!isConnected || otherUsers.length === 0) {
        return null;
    }

    const visibleAvatars = otherUsers.slice(0, 3);
    const remainingCount = Math.max(0, otherUsers.length - 3);

    // Calculate badge width based on number of avatars
    const badgeWidth = visibleAvatars.length * (AVATAR_SIZE - OVERLAP) + OVERLAP;

    return (
        <div ref={containerRef} className="relative">
            {/* Main Button */}
            <motion.button
                onClick={() => setIsExpanded(!isExpanded)}
                className={cn(
                    "relative h-10 rounded-full bg-[var(--card-bg)] border border-[var(--card-border)] flex items-center justify-center transition-all hover:border-[var(--foreground-muted)] overflow-visible",
                    isExpanded && "ring-2 ring-[var(--pastel-green)] border-transparent"
                )}
                style={{
                    width: `${badgeWidth + 16}px`, // Add padding
                    paddingLeft: '8px',
                    paddingRight: remainingCount > 0 ? '32px' : '8px'
                }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                title={`${otherUsers.length} ${otherUsers.length === 1 ? 'employee' : 'employees'} online`}
            >
                {/* Avatar Stack */}
                <div className="flex items-center" style={{ width: `${badgeWidth}px` }}>
                    {visibleAvatars.map((user, index) => (
                        <motion.div
                            key={user.id}
                            className="relative"
                            style={{
                                marginLeft: index === 0 ? 0 : `-${OVERLAP}px`,
                                zIndex: visibleAvatars.length - index,
                            }}
                            initial={{ scale: 0, x: -20 }}
                            animate={{ scale: 1, x: 0 }}
                            transition={{
                                type: "spring",
                                stiffness: 500,
                                damping: 30,
                                delay: index * 0.05,
                            }}
                        >
                            <div
                                className="rounded-full border-2 border-white dark:border-gray-800 bg-gray-100 dark:bg-gray-700 flex items-center justify-center overflow-hidden shadow-sm"
                                style={{
                                    width: `${AVATAR_SIZE}px`,
                                    height: `${AVATAR_SIZE}px`
                                }}
                            >
                                {user.avatar_url ? (
                                    <img
                                        src={user.avatar_url}
                                        alt={user.display_name}
                                        className="w-full h-full object-cover"
                                    />
                                ) : (
                                    <UserCircle className="w-4 h-4 text-gray-400" />
                                )}
                            </div>

                            {/* Pulsing online indicator - only show on first avatar */}
                            {index === 0 && (
                                <motion.div
                                    className="absolute -bottom-0.5 -right-0.5"
                                    initial={{ scale: 0 }}
                                    animate={{ scale: 1 }}
                                    transition={{ delay: 0.2 }}
                                >
                                    <div className="relative">
                                        {/* Pulsing ring */}
                                        <motion.div
                                            className="absolute inset-0 w-3 h-3 bg-green-500 rounded-full"
                                            animate={{
                                                scale: [1, 1.5, 1],
                                                opacity: [0.7, 0, 0.7],
                                            }}
                                            transition={{
                                                duration: 2,
                                                repeat: Infinity,
                                                ease: "easeInOut",
                                            }}
                                        />
                                        {/* Solid dot */}
                                        <div className="relative w-3 h-3 bg-green-500 border-2 border-white dark:border-gray-800 rounded-full" />
                                    </div>
                                </motion.div>
                            )}
                        </motion.div>
                    ))}
                </div>

                {/* Remaining Count Badge */}
                {remainingCount > 0 && (
                    <motion.div
                        className="absolute right-1 w-6 h-6 rounded-full bg-[var(--ink)] text-white flex items-center justify-center text-xs font-bold shadow-md"
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{
                            type: "spring",
                            stiffness: 500,
                            damping: 30,
                            delay: 0.15,
                        }}
                    >
                        +{remainingCount}
                    </motion.div>
                )}
            </motion.button>

            {/* Expanded Dropdown */}
            <AnimatePresence>
                {isExpanded && (
                    <motion.div
                        initial={{ opacity: 0, y: -10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -10, scale: 0.95 }}
                        transition={{ duration: 0.15 }}
                        className="absolute top-full right-0 mt-2 w-72 bg-[var(--card-bg)] rounded-2xl border border-[var(--card-border)] shadow-xl overflow-hidden z-50"
                    >
                        {/* Header */}
                        <div className="px-4 py-3 bg-[var(--background)] border-b border-[var(--card-border)]">
                            <div className="flex items-center gap-2">
                                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[var(--pastel-green)] to-[var(--pastel-mint)] flex items-center justify-center">
                                    <Users className="w-4 h-4 text-green-900" />
                                </div>
                                <div>
                                    <h3 className="text-sm font-semibold text-foreground">
                                        Online Now
                                    </h3>
                                    <p className="text-xs text-muted">
                                        {otherUsers.length} {otherUsers.length === 1 ? 'employee' : 'employees'} active
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* User List */}
                        <div className="max-h-96 overflow-y-auto">
                            {otherUsers.map((user, index) => (
                                <motion.div
                                    key={user.id}
                                    initial={{ opacity: 0, x: -20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{
                                        delay: index * 0.05,
                                        duration: 0.2,
                                    }}
                                    className="flex items-center gap-3 px-4 py-3 hover:bg-[var(--background)] transition-colors group"
                                >
                                    {/* Avatar */}
                                    <div className="relative flex-shrink-0">
                                        <div className="w-10 h-10 rounded-full border-2 border-white dark:border-gray-800 bg-gray-100 dark:bg-gray-700 flex items-center justify-center overflow-hidden">
                                            {user.avatar_url ? (
                                                <img
                                                    src={user.avatar_url}
                                                    alt={user.display_name}
                                                    className="w-full h-full object-cover"
                                                />
                                            ) : (
                                                <UserCircle className="w-5 h-5 text-gray-400" />
                                            )}
                                        </div>

                                        {/* Online indicator */}
                                        <div className="absolute bottom-0 right-0">
                                            <motion.div
                                                className="w-3 h-3 bg-green-500 border-2 border-white dark:border-gray-800 rounded-full"
                                                animate={{
                                                    scale: [1, 1.1, 1],
                                                }}
                                                transition={{
                                                    duration: 2,
                                                    repeat: Infinity,
                                                    ease: "easeInOut",
                                                }}
                                            />
                                        </div>
                                    </div>

                                    {/* User Info */}
                                    <div className="flex-1 min-w-0">
                                        <p className="font-medium text-foreground truncate">
                                            {user.display_name}
                                        </p>
                                        <div className="flex items-center gap-1.5 mt-0.5">
                                            <span className={cn(
                                                "text-xs px-2 py-0.5 rounded-full font-medium",
                                                user.role === 'admin'
                                                    ? "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300"
                                                    : user.role === 'employee'
                                                    ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
                                                    : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300"
                                            )}>
                                                {user.role}
                                            </span>
                                            {user.current_page && (
                                                <span className="text-xs text-muted truncate">
                                                    • {getPageName(user.current_page)}
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Active indicator */}
                                    <motion.div
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        className="flex-shrink-0"
                                    >
                                        <Circle className="w-2 h-2 fill-green-500 text-green-500" />
                                    </motion.div>
                                </motion.div>
                            ))}
                        </div>

                        {/* Footer */}
                        <div className="px-4 py-2 bg-[var(--background)] border-t border-[var(--card-border)] text-center">
                            <p className="text-xs text-muted">
                                Live presence powered by Supabase Realtime
                            </p>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

// Helper function to get friendly page names
function getPageName(pathname: string): string {
    if (pathname === '/') return 'Dashboard';
    if (pathname === '/orders' || pathname.startsWith('/orders')) return 'Orders';
    if (pathname === '/customers' || pathname.startsWith('/customers')) return 'Customers';
    if (pathname === '/products' || pathname.startsWith('/products')) return 'Products';
    if (pathname === '/analytics') return 'Analytics';
    if (pathname === '/reports') return 'Reports';
    if (pathname === '/settings') return 'Settings';
    return pathname.split('/')[1] || 'Unknown';
}
