"use client";

import { Search, Sun, Moon, Menu } from "lucide-react";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";

const PAGE_TITLES: Record<string, string> = {
  "/": "Command Center",
  "/merchants": "Merchants",
  "/billing": "Billing",
  "/trials": "Trials",
  "/health": "Health",
  "/activity": "Activity Log",
  "/settings": "Settings",
};

interface AdminTopbarProps {
  user: { email: string; full_name: string | null; role: string } | null;
  onMenuClick?: () => void;
  isMobile?: boolean;
}

export function AdminTopbar({ user, onMenuClick, isMobile }: AdminTopbarProps) {
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();

  const pageTitle = PAGE_TITLES[pathname ?? "/"] ?? "Admin";

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
        <h1 className="text-lg font-semibold text-foreground">{pageTitle}</h1>
      </div>

      {/* Center: Search */}
      <div className="hidden md:flex flex-1 max-w-md mx-auto">
        <div className="relative w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground-muted" />
          <input
            type="text"
            placeholder="Search merchants..."
            className="w-full h-10 pl-10 pr-4 rounded-xl bg-black/5 dark:bg-white/5 border border-transparent focus:border-[var(--primary)] focus:outline-none text-sm text-foreground placeholder:text-foreground-muted transition-colors"
          />
        </div>
      </div>

      {/* Right: Theme toggle, role badge, avatar */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
          aria-label="Toggle theme"
        >
          {theme === "dark" ? (
            <Sun className="w-4 h-4 text-foreground" />
          ) : (
            <Moon className="w-4 h-4 text-foreground" />
          )}
        </button>

        {user && (
          <div className="flex items-center gap-2">
            <span className="hidden sm:inline-block text-xs font-medium px-2.5 py-1 rounded-lg bg-[var(--primary)]/10 text-[var(--primary)]">
              {user.role}
            </span>
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#FBE38E] to-[#F4C7CF] flex items-center justify-center flex-shrink-0">
              <span className="text-[#1E1E1E] font-semibold text-xs">
                {(user.full_name || user.email)?.charAt(0).toUpperCase()}
              </span>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
