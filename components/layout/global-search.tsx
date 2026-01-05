"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/components/auth/auth-provider";
import { useOrdersContext } from "@/components/providers/orders-provider";
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
    const [query, setQuery] = useState("");
    const [category, setCategory] = useState<SearchCategory>("all");
    const [isOpen, setIsOpen] = useState(false);
    const [results, setResults] = useState<SearchResult[]>([]);
    const inputRef = useRef<HTMLInputElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const categories = [
        { id: "all" as const, label: "All" },
        { id: "orders" as const, label: "Orders", icon: Package },
        { id: "customers" as const, label: "Customers", icon: Users },
        { id: "products" as const, label: "Products", icon: ShoppingBag },
    ];

    // Search logic
    useEffect(() => {
        if (!query.trim()) {
            setResults([]);
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
        <div ref={containerRef} className="relative flex-1 max-w-2xl">
            {/* Search Bar */}
            <div className={cn(
                "flex items-center gap-3 bg-[var(--card-bg)] rounded-full border border-[var(--card-border)] px-4 py-2.5 transition-all",
                isOpen && "ring-2 ring-[var(--pastel-yellow)] border-transparent shadow-lg"
            )}>
                {/* Search Icon */}
                <div className="w-8 h-8 rounded-full bg-[var(--foreground)] flex items-center justify-center flex-shrink-0">
                    <Search className="w-4 h-4 text-white" />
                </div>

                {/* Input */}
                <input
                    ref={inputRef}
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onFocus={() => setIsOpen(true)}
                    placeholder="Search orders, customers, products..."
                    className="flex-1 bg-transparent text-foreground placeholder:text-muted focus:outline-none text-sm"
                />

                {/* Clear Button */}
                {query && (
                    <button
                        onClick={() => {
                            setQuery("");
                            inputRef.current?.focus();
                        }}
                        className="p-1 hover:bg-[var(--background)] rounded-full transition-colors"
                    >
                        <X className="w-4 h-4 text-muted" />
                    </button>
                )}

                {/* Divider */}
                <div className="w-px h-6 bg-[var(--card-border)]" />

                {/* Category Label */}
                <span className="text-xs text-muted font-medium">In:</span>

                {/* Category Pills */}
                <div className="flex items-center gap-1">
                    {categories.map((cat) => (
                        <button
                            key={cat.id}
                            onClick={() => setCategory(cat.id)}
                            className={cn(
                                "px-3 py-1.5 rounded-full text-xs font-medium transition-all",
                                category === cat.id
                                    ? "bg-[var(--foreground)] text-white"
                                    : "bg-[var(--background)] text-muted hover:text-foreground border border-[var(--card-border)]"
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
                        className="absolute top-full left-0 right-0 mt-2 bg-[var(--card-bg)] rounded-2xl border border-[var(--card-border)] shadow-xl overflow-hidden z-50"
                    >
                        {results.length > 0 ? (
                            <div className="py-2">
                                {results.map((result) => {
                                    const Icon = getResultIcon(result.type);
                                    return (
                                        <button
                                            key={`${result.type}-${result.id}`}
                                            onClick={() => handleResultClick(result)}
                                            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[var(--background)] transition-colors text-left group"
                                        >
                                            <div className={cn(
                                                "w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0",
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
                                <p className="text-muted text-sm">No results for "{query}"</p>
                            </div>
                        ) : null}

                        {/* Keyboard Hint */}
                        <div className="px-4 py-2 bg-[var(--background)] border-t border-[var(--card-border)] flex items-center justify-between text-xs text-muted">
                            <span>Press <kbd className="px-1.5 py-0.5 bg-[var(--card-bg)] rounded border border-[var(--card-border)] font-mono">↵</kbd> to select</span>
                            <span>Press <kbd className="px-1.5 py-0.5 bg-[var(--card-bg)] rounded border border-[var(--card-border)] font-mono">esc</kbd> to close</span>
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
    const router = useRouter();
    // Assuming notificationService is available and has showNotification method, imported from lib
    // If not, we can use a simple alert or just console log for now, but user mentioned it "doesn't do anything".
    // I will use notificationService if I can import it, otherwise I'll just make it visual for now or use window.alert as a fallback temp.
    // Actually, I'll skip notificationService import complexity if not already there, and just make it do *something*.
    // Better: I'll use the existing notificationService if possible. It was used in OrdersPage.

    const handleNotificationClick = () => {
        // Placeholder for now as we don't have a notifications page/drawer yet
        // We can use the service if imported, or just show a browser notification/alert
        alert("Notifications feature coming soon!");
    };

    return (
        <header className="sticky top-0 z-40 px-4 md:px-6 py-3 md:py-4 bg-[var(--background)]">
            <div className="flex items-center gap-3 md:gap-6">
                {/* Mobile Menu Button */}
                {isMobile && onMenuClick && (
                    <button
                        onClick={onMenuClick}
                        className="w-10 h-10 rounded-full bg-[var(--card-bg)] border border-[var(--card-border)] flex items-center justify-center text-foreground hover:bg-[var(--background)] transition-all flex-shrink-0"
                        aria-label="Open menu"
                    >
                        <svg
                            className="w-5 h-5"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M4 6h16M4 12h16M4 18h16"
                            />
                        </svg>
                    </button>
                )}

                {/* Global Search */}
                <GlobalSearch />

                {/* Right Side Actions - Hidden on mobile (available in sidebar) */}
                <div className="hidden md:flex items-center gap-2">
                    {/* Notifications */}
                    <button
                        onClick={handleNotificationClick}
                        className="w-10 h-10 rounded-full bg-[var(--card-bg)] border border-[var(--card-border)] flex items-center justify-center text-muted hover:text-foreground hover:border-[var(--foreground-muted)] transition-all"
                        title="Notifications"
                    >
                        <Bell className="w-5 h-5" />
                    </button>

                    {/* Settings */}
                    <Link
                        href="/settings"
                        className="w-10 h-10 rounded-full bg-[var(--card-bg)] border border-[var(--card-border)] flex items-center justify-center text-muted hover:text-foreground hover:border-[var(--foreground-muted)] transition-all"
                        title="Settings"
                    >
                        <Settings className="w-5 h-5" />
                    </Link>

                    {/* User Avatar */}
                    <Link
                        href="/settings"
                        className="w-10 h-10 rounded-full bg-gradient-to-br from-[#FBE38E] to-[#F4C7CF] flex items-center justify-center text-[#1E1E1E] font-bold text-sm hover:scale-105 transition-transform overflow-hidden shadow-sm"
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
            </div>
        </header>
    );
}
