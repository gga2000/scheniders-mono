"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/components/auth/auth-provider";
import { useOrdersContext } from "@/components/providers/orders-provider";
import { useLanguage } from "@/components/providers/language-provider";
import { motion, AnimatePresence } from "framer-motion";
import {
    Search,
    X,
    Package,
    Users,
    ShoppingBag,
    Phone,
    User,
    Hash,
    Bell,
    Settings,
    ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatIQD, getBaseOrderId } from "@/lib/utils";
import { ThemeToggle } from "./theme-toggle";
import { LanguageToggle } from "./language-toggle";
import { LivePresenceStack } from "@/components/chat/live-presence-stack";
import { ChatTrigger } from "@/components/chat/chat-trigger";
import { NotificationsDropdown } from "./notifications-dropdown";
import { AutoSendToggle } from "@/components/orders/auto-send-toggle";
import { MerchantCodeBadge } from "./merchant-code-badge";

type SearchCategory = "all" | "orders" | "customers" | "products";

interface SearchResult {
    type: "order" | "customer" | "product";
    id: string;
    title: string;
    subtitle: string;
    meta?: string;
    href: string;
}

export function GlobalSearch() {
    const router = useRouter();
    // Use shared context instead of direct useOrders() call
    const { orders } = useOrdersContext();
    const { t } = useLanguage();
    const [query, setQuery] = useState("");
    const [category, setCategory] = useState<SearchCategory>("all");
    const [isOpen, setIsOpen] = useState(false);
    const [results, setResults] = useState<SearchResult[]>([]);
    const inputRef = useRef<HTMLInputElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const categories = [
        { id: "all" as const, label: t("common.all") },
        { id: "orders" as const, label: t("nav.orders"), icon: Package },
        { id: "customers" as const, label: t("nav.customers"), icon: Users },
        { id: "products" as const, label: t("nav.products"), icon: ShoppingBag },
    ];

    // Search logic
    useEffect(() => {
        if (!query.trim()) {
            setResults([]); // eslint-disable-line react-hooks/set-state-in-effect
            return;
        }

        const searchResults: SearchResult[] = [];
        const lowerQuery = query.toLowerCase();

        // Search orders
        if (category === "all" || category === "orders") {
            orders.forEach((order) => {
                // Normalize order ID for search (handles both old LF-XXXXX and new #XXXXX formats)
                const normalizedOrderId = getBaseOrderId(order.order_id);
                const matchesId = normalizedOrderId.toString().includes(query) || order.order_id?.toString().includes(query);
                const matchesPhone = order.phone.includes(query);
                const matchesName = order.customer_name.toLowerCase().includes(lowerQuery);

                if (matchesId || matchesPhone || matchesName) {
                    searchResults.push({
                        type: "order",
                        id: order.id,
                        title: `#${normalizedOrderId} - ${order.customer_name}`,
                        subtitle: order.phone,
                        meta: formatIQD(Number(order.price)),
                        href: `/orders?search=${normalizedOrderId}`,
                    });
                }
            });
        }

        // Search customers (unique by phone)
        if (category === "all" || category === "customers") {
            const seenPhones = new Set<string>();
            orders.forEach((order) => {
                if (seenPhones.has(order.phone)) return;

                const matchesPhone = order.phone.includes(query);
                const matchesName = order.customer_name.toLowerCase().includes(lowerQuery);

                if (matchesPhone || matchesName) {
                    seenPhones.add(order.phone);
                    const customerOrders = orders.filter((o) => o.phone === order.phone);
                    searchResults.push({
                        type: "customer",
                        id: order.phone,
                        title: order.customer_name,
                        subtitle: order.phone,
                        meta: `${customerOrders.length} orders`,
                        href: `/customers?search=${order.phone}`,
                    });
                }
            });
        }

        // Search products
        if (category === "all" || category === "products") {
            const seenProducts = new Set<string>();
            orders.forEach((order) => {
                order.items?.forEach((item) => {
                    const key = item.name.toLowerCase();
                    if (seenProducts.has(key)) return;

                    if (item.name.toLowerCase().includes(lowerQuery)) {
                        seenProducts.add(key);
                        searchResults.push({
                            type: "product",
                            id: key,
                            title: item.name,
                            subtitle: formatIQD(item.price),
                            href: `/products?search=${encodeURIComponent(item.name)}`,
                        });
                    }
                });
            });
        }

        setResults(searchResults.slice(0, 8));
    }, [query, category, orders]);

    // Close on click outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }

        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    // Keyboard shortcuts
    useEffect(() => {
        function handleKeyDown(event: KeyboardEvent) {
            if ((event.metaKey || event.ctrlKey) && event.key === "k") {
                event.preventDefault();
                inputRef.current?.focus();
                setIsOpen(true);
            }
            if (event.key === "Escape") {
                setIsOpen(false);
                inputRef.current?.blur();
            }
        }

        document.addEventListener("keydown", handleKeyDown);
        return () => document.removeEventListener("keydown", handleKeyDown);
    }, []);

    const handleResultClick = (result: SearchResult) => {
        router.push(result.href);
        setIsOpen(false);
        setQuery("");
    };

    const getResultIcon = (type: SearchResult["type"]) => {
        switch (type) {
            case "order": return Hash;
            case "customer": return User;
            case "product": return ShoppingBag;
        }
    };

    const getResultColor = (type: SearchResult["type"]) => {
        switch (type) {
            case "order": return "bg-[var(--pastel-yellow)] text-amber-900";
            case "customer": return "bg-[var(--pastel-green)] text-green-900";
            case "product": return "bg-[var(--pastel-mint)] text-teal-900";
        }
    };

    return (
        <div ref={containerRef} className="relative w-full max-w-2xl">
            {/* Search Bar */}
            <div className={cn(
                "flex items-center gap-3 bg-(--card-bg) rounded-full border border-(--card-border) px-4 py-2.5 transition-all",
                isOpen && "ring-2 ring-(--pastel-yellow) border-transparent shadow-lg"
            )}>
                {/* Search Icon */}
                <div className="w-8 h-8 rounded-full bg-(--ink) flex items-center justify-center shrink-0">
                    <Search className="w-4 h-4 text-white" />
                </div>

                {/* Input */}
                <input
                    ref={inputRef}
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onFocus={() => setIsOpen(true)}
                    placeholder={t("search.placeholder")}
                    className="flex-1 bg-transparent text-foreground placeholder:text-muted focus:outline-none text-sm"
                />

                {/* Clear Button */}
                {query && (
                    <button
                        onClick={() => {
                            setQuery("");
                            inputRef.current?.focus();
                        }}
                        className="p-1 hover:bg-background rounded-full transition-colors"
                    >
                        <X className="w-4 h-4 text-muted" />
                    </button>
                )}

                {/* Divider */}
                <div className="w-px h-6 bg-(--card-border)" />

                {/* Category Label */}
                <span className="text-xs text-muted font-medium">{t("search.in")}</span>

                {/* Category Pills */}
                <div className="flex items-center gap-1">
                    {categories.map((cat) => (
                        <button
                            key={cat.id}
                            onClick={() => setCategory(cat.id)}
                            className={cn(
                                "px-3 py-1.5 rounded-full text-xs font-medium transition-all",
                                category === cat.id
                                    ? "bg-(--ink) text-white"
                                    : "bg-background text-muted hover:text-foreground border border-(--card-border)"
                            )}
                        >
                            {cat.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Search Results Dropdown */}
            <AnimatePresence>
                {isOpen && (query.trim() || results.length > 0) && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.15 }}
                        className="absolute top-full left-0 right-0 mt-2 bg-(--card-bg) rounded-2xl border border-(--card-border) shadow-xl overflow-hidden z-50"
                    >
                        {results.length > 0 ? (
                            <div className="py-2">
                                {results.map((result) => {
                                    const Icon = getResultIcon(result.type);
                                    return (
                                        <button
                                            key={`${result.type}-${result.id}`}
                                            onClick={() => handleResultClick(result)}
                                            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-background transition-colors text-left group"
                                        >
                                            <div className={cn(
                                                "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
                                                getResultColor(result.type)
                                            )}>
                                                <Icon className="w-5 h-5" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="font-semibold text-foreground truncate">
                                                    {result.title}
                                                </p>
                                                <p className="text-sm text-muted truncate flex items-center gap-2">
                                                    <Phone className="w-3 h-3" />
                                                    {result.subtitle}
                                                </p>
                                            </div>
                                            {result.meta && (
                                                <span className="text-sm font-medium text-foreground">
                                                    {result.meta}
                                                </span>
                                            )}
                                            <ChevronRight className="w-4 h-4 text-muted opacity-0 group-hover:opacity-100 transition-opacity" />
                                        </button>
                                    );
                                })}
                            </div>
                        ) : query.trim() ? (
                            <div className="py-8 text-center">
                                <Search className="w-8 h-8 text-muted mx-auto mb-2" />
                                <p className="text-muted text-sm">{t("search.noResults")} &ldquo;{query}&rdquo;</p>
                            </div>
                        ) : null}

                        {/* Keyboard Hint */}
                        <div className="px-4 py-2 bg-background border-t border-(--card-border) flex items-center justify-between text-xs text-muted">
                            {t("search.hint.select").split("↵").map((part, i, arr) => 
                                i === arr.length - 1 ? part : <span key={i}>{part}<kbd className="px-1.5 py-0.5 bg-(--card-bg) rounded border border-(--card-border) font-mono mx-1">↵</kbd></span>
                            )}
                            {t("search.hint.close").split("esc").map((part, i, arr) => 
                                i === arr.length - 1 ? part : <span key={i}>{part}<kbd className="px-1.5 py-0.5 bg-(--card-bg) rounded border border-(--card-border) font-mono mx-1">esc</kbd></span>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

interface TopBarProps {
    onMenuClick?: () => void;
    isMobile?: boolean;
}

export function TopBar({ onMenuClick, isMobile }: TopBarProps) {
    const { user, profile } = useAuth();

    return (
        <header className="sticky top-0 z-40">
            {/* Header Background - Removed blur to stop flashing/glitching issues */}
            <div
                className="absolute inset-0 bg-background border-b border-(--card-border)/80 pointer-events-none"
            />
            {/* Header Content */}
            <div className="relative flex items-center justify-between gap-3 md:gap-6 w-full px-4 md:px-6 py-3 md:py-4">
                {/* Left: merchant code badge */}
                <div className="flex items-center w-auto md:flex-1 md:min-w-[200px]">
                    <MerchantCodeBadge />
                </div>

                {/* Global Search Centered - Hidden on mobile */}
                <div className="hidden md:flex flex-1 justify-center w-full max-w-2xl mx-auto">
                    <GlobalSearch />
                </div>

                {/* Right Side Actions */}
                <div className="flex items-center justify-end gap-2 md:flex-1 md:min-w-[200px]">
                    {/* Desktop Actions - Hidden on mobile */}
                    <div className="hidden md:flex items-center gap-2">
                        {/* Auto-Send WhatsApp Toggle */}
                        <AutoSendToggle variant="navbar" />

                        {/* Theme Toggle */}
                        <ThemeToggle />

                        {/* Language Toggle */}
                        <LanguageToggle />

                        {/* Live Presence Stack */}
                        <LivePresenceStack />

                        {/* Team Chat Trigger */}
                        <ChatTrigger />

                        {/* Notifications Dropdown */}
                        <NotificationsDropdown />

                        {/* Settings */}
                        <Link
                            href="/settings"
                            className="w-10 h-10 rounded-full bg-(--card-bg) border border-(--card-border) flex items-center justify-center text-muted hover:text-foreground hover:border-(--foreground-muted) transition-all"
                            title="Settings"
                        >
                            <Settings className="w-5 h-5" />
                        </Link>

                        {/* User Avatar */}
                        <Link
                            href="/settings"
                            className="w-10 h-10 rounded-full bg-linear-to-br from-[#FBE38E] to-[#F4C7CF] flex items-center justify-center text-[#1E1E1E] font-bold text-sm hover:scale-105 transition-transform overflow-hidden shadow-sm"
                            title="Profile"
                        >
                            {profile?.avatar_url ? (
                                <img
                                    src={profile.avatar_url}
                                    alt={profile.display_name || "User"}
                                    className="w-full h-full object-cover"
                                />
                            ) : (
                                <span>
                                    {(profile?.display_name || user?.email || "U")?.charAt(0).toUpperCase()}
                                </span>
                            )}
                        </Link>
                    </div>

                    {/* Mobile-only actions — the desktop block above is hidden on mobile,
                        so without this chat + notifications are unreachable on phones. */}
                    <div className="flex md:hidden items-center gap-2">
                        <ChatTrigger />
                        <NotificationsDropdown />
                    </div>
                </div>
            </div>
        </header>
    );
}
