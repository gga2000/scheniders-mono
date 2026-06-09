"use client";

import { useState, useEffect, useRef, useCallback, type ReactNode } from "react";
import { Search, Sun, Moon, Menu, Loader2, Shield, UserPlus } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { NotificationBell } from "@/components/shared/notification-bell";
import { usePageHeader } from "@/store/use-page-header";

const PAGE_TITLES: Record<string, string> = {
  "/": "Command Center",
  "/merchants": "Merchants",
  "/leads": "Prospects",
  "/team": "Team",
  "/billing": "Billing",
  "/trials": "Trials",
  "/health": "Health",
  "/activity": "Activity Log",
  "/settings": "Settings",
  "/revenue": "Revenue Analytics",
  "/usage": "Usage Heatmap",
};

/** Friendly labels for the admin-console roles (stored as snake_case). */
const ROLE_LABELS: Record<string, string> = {
  super_admin: "Super Admin",
  support_staff: "Support",
};

/** Per-route header icon, rendered beside the title (mirrors PAGE_TITLES). */
const PAGE_ICONS: Record<string, ReactNode> = {
  "/leads": (
    <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#FF8899]/25 to-[#A78BFA]/25 shadow-[0_0_18px_-4px_rgba(255,136,153,0.45)]">
      <span className="absolute inset-0 rounded-xl ring-1 ring-inset ring-white/20" />
      <UserPlus className="h-[18px] w-[18px] text-[#FF8899]" />
    </span>
  ),
};

interface MerchantResult {
  id: string;
  business_name: string;
  plan: string;
  status: string;
  city: string | null;
}

const PLAN_COLORS: Record<string, string> = {
  free: "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300",
  starter: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  pro: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300",
  enterprise: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",
};

const STATUS_COLORS: Record<string, string> = {
  active: "bg-emerald-500",
  inactive: "bg-gray-400",
  suspended: "bg-red-500",
  trial: "bg-blue-500",
};

interface AdminTopbarProps {
  user: { email: string; full_name: string | null; avatar_url: string | null; role: string } | null;
  onMenuClick?: () => void;
  isMobile?: boolean;
  onOpenCommandPalette?: () => void;
}

export function AdminTopbar({ user, onMenuClick, isMobile, onOpenCommandPalette }: AdminTopbarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, setTheme } = useTheme();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MerchantResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const searchRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { title: pageHeaderTitle, subtitle: pageHeaderSubtitle } = usePageHeader();
  const pageTitle = pageHeaderTitle ?? PAGE_TITLES[pathname ?? "/"] ?? "Admin";
  const pageIcon = PAGE_ICONS[pathname ?? "/"] ?? null;

  // The global merchant search queries /api/merchants and jumps to a merchant
  // profile — it only belongs on the Merchants directory, not every page.
  const showSearch = pathname === "/merchants" || (pathname?.startsWith("/merchants/") ?? false);

  const fetchResults = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setResults([]);
      setIsOpen(false);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch(
        `/api/merchants?search=${encodeURIComponent(searchQuery)}&limit=5`
      );
      const data = await res.json();
      setResults(data.merchants ?? []);
      setIsOpen(true);
    } catch {
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    if (!query.trim()) {
      setResults([]);
      setIsOpen(false);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    debounceRef.current = setTimeout(() => {
      fetchResults(query);
    }, 300);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [query, fetchResults]);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      setIsOpen(false);
    }
  }

  function handleSelect(id: string) {
    setIsOpen(false);
    setQuery("");
    setResults([]);
    router.push(`/merchants/${id}`);
  }

  return (
    <header className="h-16 flex items-center justify-between px-6 gap-4">
      {/* Left: Mobile menu + Page title */}
      <div className="flex items-center gap-3">
        {isMobile && (
          <button
            onClick={onMenuClick}
            className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
            aria-label="Open menu"
          >
            <Menu className="w-5 h-5 text-foreground" />
          </button>
        )}
        {pageIcon}
        {pageTitle && (
          <div className="min-w-0">
            <h1 className="text-lg font-semibold text-foreground leading-tight truncate">
              {pageTitle}
            </h1>
            {pageHeaderSubtitle && (
              <p className="hidden sm:flex items-center gap-1.5 text-[11px] text-foreground-muted leading-tight mt-0.5">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
                </span>
                {pageHeaderSubtitle}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Center: Search — merchant directory search, shown only on Merchants pages */}
      {showSearch && (
      <div className="hidden md:flex flex-1 max-w-md mx-auto">
        <div ref={searchRef} className="relative w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground-muted" />
          {isLoading && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground-muted animate-spin" />
          )}
          <input
            type="text"
            placeholder="Search merchants..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => {
              if (results.length > 0) setIsOpen(true);
            }}
            className="w-full h-10 pl-10 pr-20 rounded-xl bg-black/5 dark:bg-white/5 border border-transparent focus:border-[var(--primary)] focus:outline-none text-sm text-foreground placeholder:text-foreground-muted transition-colors"
          />
          {!query && (
            <button
              onClick={onOpenCommandPalette}
              className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 text-[10px] text-foreground/30 hover:text-foreground/50 transition-colors"
            >
              <kbd className="bg-foreground/5 px-1.5 py-0.5 rounded font-mono">⌘K</kbd>
            </button>
          )}

          {/* Search results dropdown */}
          {isOpen && (
            <div className="absolute top-full left-0 right-0 mt-1 z-50 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl shadow-xl overflow-hidden">
              {results.length === 0 && !isLoading ? (
                <div className="px-4 py-3 text-sm text-foreground-muted text-center">
                  No results
                </div>
              ) : (
                results.map((merchant) => (
                  <button
                    key={merchant.id}
                    type="button"
                    onClick={() => handleSelect(merchant.id)}
                    className="w-full px-4 py-3 hover:bg-foreground/5 cursor-pointer flex items-center gap-3 transition-colors border-b border-[var(--card-border)] last:border-0 text-left"
                  >
                    {/* Status dot */}
                    <span
                      className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_COLORS[merchant.status] ?? "bg-gray-400"}`}
                    />

                    {/* Business name */}
                    <span className="text-sm font-bold text-foreground truncate flex-1 min-w-0">
                      {merchant.business_name}
                    </span>

                    {/* Plan badge */}
                    <span
                      className={`text-[11px] font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${PLAN_COLORS[merchant.plan] ?? "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300"}`}
                    >
                      {merchant.plan}
                    </span>

                    {/* City */}
                    {merchant.city && (
                      <span className="text-xs text-foreground-muted flex-shrink-0">
                        {merchant.city}
                      </span>
                    )}
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      </div>
      )}

      {/* Right: Notifications, Theme toggle, user chip */}
      <div className="flex items-center gap-1">
        <NotificationBell />
        <button
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className="w-9 h-9 flex items-center justify-center rounded-xl text-foreground/70 hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
          aria-label="Toggle theme"
        >
          {theme === "dark" ? (
            <Sun className="w-[18px] h-[18px]" />
          ) : (
            <Moon className="w-[18px] h-[18px]" />
          )}
        </button>

        {user && (
          <>
            <div className="w-px h-6 bg-[var(--card-border)] mx-1.5" />
            <div className="flex items-center gap-2.5">
              <div className="hidden sm:flex flex-col items-end leading-tight">
                <span className="text-[13px] font-semibold text-foreground truncate max-w-[160px]">
                  {user.full_name || user.email?.split("@")[0]}
                </span>
                {(ROLE_LABELS[user.role] || user.role) && (
                  <span className="inline-flex items-center gap-1 text-[10.5px] font-medium text-[var(--primary)]">
                    <Shield className="w-2.5 h-2.5" strokeWidth={2.5} />
                    {ROLE_LABELS[user.role] ?? "Admin"}
                  </span>
                )}
              </div>
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#FBE38E] to-[#F4C7CF] flex items-center justify-center flex-shrink-0 overflow-hidden ring-2 ring-[var(--primary)]/20 shadow-sm">
                {user.avatar_url ? (
                  <img
                    src={user.avatar_url}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-[#1E1E1E] font-semibold text-xs">
                    {(user.full_name || user.email)?.charAt(0).toUpperCase()}
                  </span>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </header>
  );
}
