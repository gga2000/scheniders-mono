"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/components/auth/auth-provider";
import {
    useCustomerSearchQuery,
    useOrderSearchQuery,
    useProductSearchQuery,
} from "@/hooks/use-order-search-query";
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
    MoreHorizontal,
    Settings as SettingsIcon,
    LogOut,
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
import { useHeadroom } from "@/hooks/use-headroom";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@scheniders/ui/dropdown-menu";
import { HEADER_ACTION_CLASS } from "./header-action-button";

type SearchCategory = "all" | "orders" | "customers" | "products";

interface SearchResult {
    type: "order" | "customer" | "product";
    id: string;
    title: string;
    subtitle: string;
    meta?: string;
    href: string;
}

export function GlobalSearch({ onOpenChange }: { onOpenChange?: (open: boolean) => void }) {
    const router = useRouter();
    // PERF-D1: this component is mounted in the app shell, so it renders on
    // EVERY route. It used to read the whole order book from context and filter
    // ~4,700 rows in the browser, which is what forced OrdersProvider into the
    // root layout and a 9.7 MB fetch onto every page load. It now asks the
    // server for matches.
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

    const orderMatches = useOrderSearchQuery(query, 8);
    const customerMatches = useCustomerSearchQuery(query, 8);
    const productMatches = useProductSearchQuery(query, 8);

    // Search logic
    useEffect(() => {
        if (!query.trim()) {
            setResults([]); // eslint-disable-line react-hooks/set-state-in-effect
            return;
        }

        const searchResults: SearchResult[] = [];

        if (category === "all" || category === "orders") {
            orderMatches.forEach((order) => {
                const normalizedOrderId = getBaseOrderId(order.order_id);
                searchResults.push({
                    type: "order",
                    id: order.id,
                    title: `#${normalizedOrderId} - ${order.customer_name ?? ""}`,
                    subtitle: order.phone ?? "",
                    // SEC-D2: price is null for a role that may not see money.
                    meta: order.price === null ? "" : formatIQD(Number(order.price)),
                    href: `/orders?search=${normalizedOrderId}`,
                });
            });
        }

        if (category === "all" || category === "customers") {
            customerMatches.forEach((c) => {
                searchResults.push({
                    type: "customer",
                    id: c.customer_phone,
                    title: c.latest_name ?? c.customer_phone,
                    subtitle: c.customer_phone,
                    // This count is now the customer's REAL order total. It used
                    // to be "how many of their orders matched the search term".
                    meta: `${c.total_orders} orders`,
                    href: `/customers?search=${c.customer_phone}`,
                });
            });
        }

        if (category === "all" || category === "products") {
            productMatches.forEach((p) => {
                searchResults.push({
                    type: "product",
                    id: p.id,
                    title: p.name,
                    subtitle: p.price === null ? "" : formatIQD(p.price),
                    href: `/products?search=${encodeURIComponent(p.name)}`,
                });
            });
        }

        setResults(searchResults.slice(0, 8)); // eslint-disable-line react-hooks/set-state-in-effect
    }, [query, category, orderMatches, customerMatches, productMatches]);

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

    useEffect(() => { onOpenChange?.(isOpen); }, [isOpen, onOpenChange]);

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
                        className="absolute top-full left-0 right-0 mt-2 bg-(--card-bg) rounded-2xl border border-(--card-border) shadow-xl overflow-hidden"
                        style={{ zIndex: "var(--z-header-overlay)" }}
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
    const { user, profile, signOut } = useAuth();
    const router = useRouter();

    const [scrolled, setScrolled] = useState(false);
    const [searchOpen, setSearchOpen] = useState(false);
    const [notifOpen, setNotifOpen] = useState(false);
    const anyOverlayOpen = searchOpen || notifOpen;
    const { hidden } = useHeadroom({ locked: anyOverlayOpen, disabled: isMobile });

    useEffect(() => {
        if (typeof window === "undefined") return;
        let ticking = false;
        const onScroll = () => {
            if (ticking) return;
            ticking = true;
            requestAnimationFrame(() => {
                ticking = false;
                setScrolled(window.scrollY > 0);
            });
        };
        onScroll();
        window.addEventListener("scroll", onScroll, { passive: true });
        return () => window.removeEventListener("scroll", onScroll);
    }, []);

    return (
        <header className="app-header backdrop-blur-md backdrop-saturate-150" data-scrolled={scrolled} data-hidden={hidden}>
            {/* Header Content */}
            <div className="relative flex items-center justify-between gap-3 md:gap-6 w-full px-4 md:px-6 py-3 md:py-4">
                {/* Left: merchant code badge */}
                <div className="flex items-center w-auto md:flex-1 md:min-w-[200px]">
                    <MerchantCodeBadge />
                </div>

                {/* Global Search Centered - Hidden on mobile */}
                <div className="hidden md:flex flex-1 justify-center w-full max-w-2xl mx-auto">
                    <GlobalSearch onOpenChange={setSearchOpen} />
                </div>

                {/* Right Side Actions */}
                <div className="flex items-center justify-end gap-2 md:flex-1 md:min-w-[200px]">
                    {/* Desktop Actions - Hidden on mobile */}
                    <div className="hidden md:flex items-center gap-2">
                        {/* Work tools */}
                        <AutoSendToggle variant="navbar" />

                        {/* Divider: work tools | identity & comms */}
                        <div className="w-px h-6 bg-[var(--card-border)]/60 mx-1" />

                        {/* Presence · Chat · Notifications */}
                        <LivePresenceStack />
                        <ChatTrigger />
                        <NotificationsDropdown onOpenChange={setNotifOpen} />

                        {/* Overflow: Theme + Language */}
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <button className={HEADER_ACTION_CLASS} title="More" aria-label="More options">
                                    <MoreHorizontal className="w-5 h-5" />
                                </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" style={{ zIndex: "var(--z-header-overlay)" }} className="w-48">
                                <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="flex items-center justify-between gap-3 cursor-pointer">
                                    <span className="text-sm">Theme</span>
                                    <ThemeToggle />
                                </DropdownMenuItem>
                                <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="flex items-center justify-between gap-3 cursor-pointer">
                                    <span className="text-sm">Language</span>
                                    <LanguageToggle />
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>

                        {/* Account menu (replaces the duplicate Settings gear) */}
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <button
                                    className="w-10 h-10 rounded-full bg-linear-to-br from-[#FBE38E] to-[#F4C7CF] flex items-center justify-center text-[#1E1E1E] font-bold text-sm hover:scale-105 transition-transform overflow-hidden shadow-sm"
                                    title="Account"
                                    aria-label="Account menu"
                                >
                                    {profile?.avatar_url ? (
                                        <img src={profile.avatar_url} alt={profile.display_name || "User"} className="w-full h-full object-cover" />
                                    ) : (
                                        <span>{(profile?.display_name || user?.email || "U")?.charAt(0).toUpperCase()}</span>
                                    )}
                                </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" style={{ zIndex: "var(--z-header-overlay)" }} className="w-48">
                                <DropdownMenuItem asChild className="cursor-pointer">
                                    <Link href="/settings" className="flex items-center gap-2">
                                        <SettingsIcon className="w-4 h-4" /> Settings
                                    </Link>
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                    onSelect={async () => { await signOut(); router.push("/login"); }}
                                    className="flex items-center gap-2 text-rose-600 cursor-pointer"
                                >
                                    <LogOut className="w-4 h-4" /> Sign out
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>

                    {/* Mobile-only actions — the desktop block above is hidden on mobile,
                        so without this chat + notifications are unreachable on phones. */}
                    <div className="flex md:hidden items-center gap-2">
                        <ChatTrigger />
                        <NotificationsDropdown onOpenChange={setNotifOpen} />
                    </div>
                </div>
            </div>
        </header>
    );
}
