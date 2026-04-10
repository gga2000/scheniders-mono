"use client";

import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Building2,
  CreditCard,
  Clock,
  Activity,
  FileText,
  Settings,
  TrendingUp,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Shield,
  X,
  LogOut,
  UserPlus,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";

const NAV_ITEMS = [
  { label: "Dashboard", icon: LayoutDashboard, href: "/" },
  { label: "Merchants", icon: Building2, href: "/merchants" },
  { label: "Prospects", icon: UserPlus, href: "/leads" },
  { label: "Team", icon: Users, href: "/team" },
  { label: "Billing", icon: CreditCard, href: "/billing" },
  { label: "Trials", icon: Clock, href: "/trials" },
  { label: "Health", icon: Activity, href: "/health" },
  { label: "Activity Log", icon: FileText, href: "/activity" },
  { label: "Settings", icon: Settings, href: "/settings" },
];

const ANALYTICS_ITEMS = [
  { label: "Revenue", icon: TrendingUp, href: "/revenue" },
  { label: "Usage Heatmap", icon: BarChart3, href: "/usage" },
];

interface AdminSidebarProps {
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
  isMobile?: boolean;
  mobileMenuOpen?: boolean;
  setMobileMenuOpen?: (v: boolean) => void;
  user: { email: string; full_name: string | null } | null;
  onSignOut: () => void;
}

export function AdminSidebar({
  collapsed,
  setCollapsed,
  isMobile = false,
  mobileMenuOpen = false,
  setMobileMenuOpen,
  user,
  onSignOut,
}: AdminSidebarProps) {
  const pathname = usePathname();

  const isCollapsed = isMobile ? false : collapsed;

  const handleNavClick = () => {
    if (isMobile && setMobileMenuOpen) {
      setMobileMenuOpen(false);
    }
  };

  // Desktop sidebar
  if (!isMobile) {
    return (
      <aside
        className={cn(
          "fixed left-4 top-4 bottom-4 bg-[#1E1E1E] rounded-[32px] flex flex-col py-6 text-white shadow-lg shadow-black/20 z-50 border border-white/5",
          "transition-all duration-500 ease-in-out",
          collapsed ? "w-[72px]" : "w-64 px-6"
        )}
      >
        {/* Collapse Toggle Button */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="absolute -right-3 top-16 z-10 w-8 h-8 rounded-full bg-[#E4B5D1] hover:bg-[#d9a0c4] flex items-center justify-center transition-all duration-300 shadow-md hover:shadow-lg border-[3px] border-[#1E1E1E]"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <ChevronRight className="w-4 h-4 text-zinc-800" strokeWidth={2.5} />
          ) : (
            <ChevronLeft className="w-4 h-4 text-zinc-800" strokeWidth={2.5} />
          )}
        </button>

        {/* Logo Section */}
        <div
          className={cn(
            "flex items-center mb-8 transition-all duration-500",
            collapsed ? "justify-center flex-col gap-2" : "gap-3 px-2"
          )}
        >
          <div className="w-9 h-9 rounded-xl bg-[var(--primary)] text-[var(--primary-fg)] flex items-center justify-center flex-shrink-0">
            <Shield className="w-5 h-5" />
          </div>
          <span
            className={cn(
              "font-bold tracking-tight transition-all duration-500 overflow-hidden whitespace-nowrap",
              collapsed ? "text-[0px] w-0 opacity-0" : "text-lg opacity-100"
            )}
          >
            Scheniders Admin
          </span>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1.5 overflow-y-auto overflow-x-hidden scrollbar-hide px-2">
          {!collapsed && (
            <div className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest mb-3 px-1 transition-opacity duration-300">
              Navigation
            </div>
          )}

          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={handleNavClick}
                className={cn(
                  "flex items-center py-3 rounded-2xl transition-all duration-300 group relative overflow-hidden",
                  collapsed ? "justify-center w-full" : "gap-3 px-3",
                  isActive
                    ? "bg-white/10 text-white"
                    : "text-zinc-500 hover:text-white hover:bg-white/[0.03]"
                )}
                title={collapsed ? item.label : undefined}
              >
                <item.icon
                  className={cn(
                    "w-[22px] h-[22px] transition-colors flex-shrink-0",
                    isActive ? "text-white" : "text-zinc-500 group-hover:text-white"
                  )}
                />

                <span
                  className={cn(
                    "font-medium text-[15px] transition-all duration-500 whitespace-nowrap",
                    collapsed ? "w-0 opacity-0 hidden" : "opacity-100"
                  )}
                >
                  {item.label}
                </span>

                {isActive && !collapsed && (
                  <div className="ml-auto w-1.5 h-1.5 rounded-[2px] bg-[var(--primary)] shadow-[0_0_10px_rgba(239,255,0,0.6)]" />
                )}

                {isActive && collapsed && (
                  <div className="absolute right-1.5 top-1.5 w-1.5 h-1.5 rounded-[2px] bg-[var(--primary)] shadow-[0_0_10px_rgba(239,255,0,0.6)]" />
                )}
              </Link>
            );
          })}

          {/* Analytics Section Divider */}
          <div className={cn("my-3", collapsed ? "mx-auto w-6 h-px bg-white/10" : "h-px bg-white/10 mx-1")} />
          {!collapsed && (
            <div className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest mb-3 px-1 transition-opacity duration-300">
              Analytics
            </div>
          )}
          {ANALYTICS_ITEMS.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={handleNavClick}
                className={cn(
                  "flex items-center py-3 rounded-2xl transition-all duration-300 group relative overflow-hidden",
                  collapsed ? "justify-center w-full" : "gap-3 px-3",
                  isActive
                    ? "bg-white/10 text-white"
                    : "text-zinc-500 hover:text-white hover:bg-white/[0.03]"
                )}
                title={collapsed ? item.label : undefined}
              >
                <item.icon
                  className={cn(
                    "w-[22px] h-[22px] transition-colors flex-shrink-0",
                    isActive ? "text-white" : "text-zinc-500 group-hover:text-white"
                  )}
                />
                <span
                  className={cn(
                    "font-medium text-[15px] transition-all duration-500 whitespace-nowrap",
                    collapsed ? "w-0 opacity-0 hidden" : "opacity-100"
                  )}
                >
                  {item.label}
                </span>
                {isActive && !collapsed && (
                  <div className="ml-auto w-1.5 h-1.5 rounded-[2px] bg-[var(--primary)] shadow-[0_0_10px_rgba(239,255,0,0.6)]" />
                )}
                {isActive && collapsed && (
                  <div className="absolute right-1.5 top-1.5 w-1.5 h-1.5 rounded-[2px] bg-[var(--primary)] shadow-[0_0_10px_rgba(239,255,0,0.6)]" />
                )}
              </Link>
            );
          })}
        </nav>

        {/* User Section */}
        {user && (
          <div
            className={cn(
              "mt-4 pt-4 border-t border-white/10 px-2",
              collapsed ? "flex flex-col items-center" : ""
            )}
          >
            {/* User Info */}
            <div
              className={cn(
                "flex items-center gap-3 mb-3",
                collapsed ? "justify-center" : "px-3"
              )}
            >
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#FBE38E] to-[#F4C7CF] flex items-center justify-center flex-shrink-0 overflow-hidden">
                <span className="text-[#1E1E1E] font-semibold text-sm">
                  {(user.full_name || user.email)?.charAt(0).toUpperCase()}
                </span>
              </div>
              {!collapsed && (
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium truncate">
                    {user.full_name || user.email?.split("@")[0]}
                  </p>
                  <p className="text-zinc-500 text-xs truncate">{user.email}</p>
                </div>
              )}
            </div>

            {/* Logout Button */}
            <button
              onClick={onSignOut}
              className={cn(
                "flex items-center gap-3 py-3 rounded-2xl transition-all duration-200 w-full",
                "text-zinc-500 hover:text-white hover:bg-white/[0.05]",
                collapsed ? "justify-center" : "px-3"
              )}
              title={collapsed ? "Sign out" : undefined}
            >
              <LogOut className="w-[20px] h-[20px]" />
              {!collapsed && (
                <span className="text-sm font-medium">Sign out</span>
              )}
            </button>
          </div>
        )}
      </aside>
    );
  }

  // Mobile sidebar drawer
  return (
    <AnimatePresence>
      {mobileMenuOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setMobileMenuOpen?.(false)}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
          />

          {/* Drawer */}
          <motion.aside
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed left-0 top-0 bottom-0 w-[280px] max-w-[85vw] bg-[#1E1E1E] flex flex-col py-6 px-4 text-white shadow-2xl z-[60]"
          >
            {/* Header with Close Button */}
            <div className="flex items-center justify-between mb-8 px-2">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-[var(--primary)] text-[var(--primary-fg)] flex items-center justify-center flex-shrink-0">
                  <Shield className="w-5 h-5" />
                </div>
                <span className="font-bold text-xl tracking-tight">
                  Scheniders Admin
                </span>
              </div>
              <button
                onClick={() => setMobileMenuOpen?.(false)}
                className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Navigation */}
            <nav className="flex-1 space-y-1 overflow-y-auto scrollbar-hide">
              <div className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest mb-3 px-3">
                Navigation
              </div>

              {NAV_ITEMS.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={handleNavClick}
                    className={cn(
                      "flex items-center gap-4 py-4 px-4 rounded-2xl transition-all duration-200",
                      isActive
                        ? "bg-white/10 text-white"
                        : "text-zinc-400 hover:text-white hover:bg-white/5"
                    )}
                  >
                    <item.icon className="w-5 h-5 flex-shrink-0" />
                    <span className="font-medium text-base">{item.label}</span>
                    {isActive && (
                      <div className="ml-auto w-2 h-2 rounded-[2px] bg-[var(--primary)] shadow-[0_0_10px_rgba(239,255,0,0.6)]" />
                    )}
                  </Link>
                );
              })}

              {/* Analytics Section */}
              <div className="h-px bg-white/10 my-2 mx-3" />
              <div className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest mb-3 px-3">
                Analytics
              </div>
              {ANALYTICS_ITEMS.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={handleNavClick}
                    className={cn(
                      "flex items-center gap-4 py-4 px-4 rounded-2xl transition-all duration-200",
                      isActive
                        ? "bg-white/10 text-white"
                        : "text-zinc-400 hover:text-white hover:bg-white/5"
                    )}
                  >
                    <item.icon className="w-5 h-5 flex-shrink-0" />
                    <span className="font-medium text-base">{item.label}</span>
                    {isActive && (
                      <div className="ml-auto w-2 h-2 rounded-[2px] bg-[var(--primary)] shadow-[0_0_10px_rgba(239,255,0,0.6)]" />
                    )}
                  </Link>
                );
              })}
            </nav>

            {/* Mobile User Section */}
            {user && (
              <div className="mt-auto border-t border-white/10 p-4">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#FBE38E] to-[#F4C7CF] flex items-center justify-center flex-shrink-0 overflow-hidden">
                    <span className="text-[#1E1E1E] font-semibold text-base">
                      {(user.full_name || user.email)?.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-base font-medium truncate">
                      {user.full_name || user.email?.split("@")[0]}
                    </p>
                    <p className="text-zinc-500 text-sm truncate">{user.email}</p>
                  </div>
                </div>

                <button
                  onClick={onSignOut}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-white/10 text-white font-medium hover:bg-white/20 transition-colors"
                >
                  <LogOut className="w-5 h-5" />
                  <span>Sign out</span>
                </button>
              </div>
            )}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
