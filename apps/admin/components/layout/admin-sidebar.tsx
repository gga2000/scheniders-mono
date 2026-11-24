"use client";

import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight, LogOut, Shield, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { m, AnimatePresence } from "framer-motion";
import { useSupportWaitingCount } from "@/hooks/use-support-cases";
import { useLeadsWithNoOwner } from "@/hooks/use-leads";
import { useTopupRequests } from "@/components/shared/topup-requests-section";
import {
  MENU,
  SETTINGS_SECTION,
  activeLink,
  activeSection,
  linksFor,
  waitingBadge,
  type MenuBadge,
  type MenuCount,
  type MenuSection,
} from "@/lib/admin-menu";
import { MENU_ICONS } from "./menu-icons";
import { useAdminAuth } from "@/hooks/use-admin-auth";


/** The pink mark of the merchant app, used for the open place. */
const MARK = "#E4B5D1";

interface AdminSidebarProps {
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
  isMobile?: boolean;
  mobileMenuOpen?: boolean;
  setMobileMenuOpen?: (v: boolean) => void;
  user: { email: string; full_name: string | null; avatar_url: string | null } | null;
  onSignOut: () => void;
}

type Waiting = Record<MenuCount, MenuBadge>;

function useWaiting(): Waiting {
  const leads = useLeadsWithNoOwner();
  const support = useSupportWaitingCount();
  const payments = useTopupRequests();
  return {
    leads: waitingBadge(leads, "leads with no owner", "the leads with no owner"),
    support: waitingBadge(support, "waiting on us", "the support inbox"),
    payments: waitingBadge(
      { data: payments.data?.length, isError: payments.isError, errorUpdateCount: payments.errorUpdateCount },
      "receipts to check",
      "the receipts",
    ),
  };
}

/** One place on the menu, with its pages under it while it is open. */
function MenuEntry({
  section,
  pathname,
  collapsed,
  waiting,
  onNavigate,
}: {
  section: MenuSection;
  pathname: string;
  collapsed: boolean;
  waiting: Waiting;
  onNavigate: () => void;
}) {
  const Icon = MENU_ICONS[section.icon];
  const links = linksFor(section, useAdminAuth().role);
  const open = activeSection(pathname)?.href === section.href;
  const page = activeLink(pathname);
  const waits = section.count ? waiting[section.count] : null;
  const badge = waits && waits.count !== 0 ? waits : null;

  return (
    <div>
      <Link
        href={section.href}
        onClick={onNavigate}
        aria-current={open && page === section.href ? "page" : undefined}
        title={collapsed ? section.label : undefined}
        className={cn(
          "relative flex items-center rounded-xl py-2.5 transition-colors",
          collapsed ? "justify-center" : "gap-3 px-3",
          open ? "bg-white/10 text-white" : "text-zinc-400 hover:bg-white/[0.04] hover:text-white",
        )}
      >
        {open && (
          <span aria-hidden className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full" style={{ background: MARK }} />
        )}
        <Icon className="h-5 w-5 flex-shrink-0" />
        {!collapsed && <span className="text-[15px] font-medium">{section.label}</span>}
        {badge && (
          <span
            aria-label={badge.label}
            title={badge.count === null ? badge.label : undefined}
            className={cn(
              "flex items-center justify-center rounded-full font-semibold text-white tabular-nums",
              badge.count === null ? "bg-zinc-600" : "bg-red-600",
              collapsed ? "absolute right-2 top-2 h-2 w-2 text-[0px]" : "ml-auto h-6 min-w-6 px-1.5 text-[13px]",
            )}
          >
            {badge.count === null ? "?" : badge.count > 99 ? "99+" : badge.count}
          </span>
        )}
      </Link>

      {open && !collapsed && links.length > 1 && (
        <div className="mt-1 mb-2 ml-[22px] space-y-0.5 border-l border-white/10 pl-3">
          {links.map((link) => {
            const here = page === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={onNavigate}
                aria-current={here ? "page" : undefined}
                className={cn(
                  "block rounded-lg px-2 py-1.5 text-[14px] transition-colors",
                  here ? "font-medium text-white" : "text-zinc-400 hover:text-white",
                )}
              >
                {link.label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MenuList({
  pathname,
  collapsed,
  waiting,
  onNavigate,
}: {
  pathname: string;
  collapsed: boolean;
  waiting: Waiting;
  onNavigate: () => void;
}) {
  return (
    <nav aria-label="Console" className="flex flex-1 flex-col overflow-y-auto overflow-x-hidden scrollbar-hide">
      <div className="space-y-1">
        {MENU.map((section) => (
          <MenuEntry
            key={section.href}
            section={section}
            pathname={pathname}
            collapsed={collapsed}
            waiting={waiting}
            onNavigate={onNavigate}
          />
        ))}
      </div>
      <div className="mt-auto pt-4">
        <MenuEntry
          section={SETTINGS_SECTION}
          pathname={pathname}
          collapsed={collapsed}
          waiting={waiting}
          onNavigate={onNavigate}
        />
      </div>
    </nav>
  );
}

function Avatar({ user, size }: { user: NonNullable<AdminSidebarProps["user"]>; size: "sm" | "md" }) {
  return (
    <div
      className={cn(
        "flex flex-shrink-0 items-center justify-center overflow-hidden rounded-full",
        size === "sm" ? "h-8 w-8 text-sm" : "h-10 w-10 text-base",
      )}
      style={{ background: MARK }}
    >
      {user.avatar_url ? (
        <img src={user.avatar_url} alt="" className="h-full w-full object-cover" />
      ) : (
        <span className="font-semibold text-[#1E1E1E]">{(user.full_name || user.email)?.charAt(0).toUpperCase()}</span>
      )}
    </div>
  );
}

function Brand({ collapsed }: { collapsed: boolean }) {
  return (
    <div className={cn("flex items-center gap-3", collapsed ? "justify-center" : "px-1")}>
      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-[var(--primary)] text-[var(--primary-fg)]">
        <Shield className="h-5 w-5" />
      </div>
      {!collapsed && <span className="whitespace-nowrap text-lg font-bold tracking-tight">Scheniders Admin</span>}
    </div>
  );
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
  const waiting = useWaiting();
  const closeMobile = () => {
    if (isMobile) setMobileMenuOpen?.(false);
  };

  if (!isMobile) {
    return (
      <aside
        data-admin-menu
        data-collapsed={collapsed || undefined}
        className={cn(
          "fixed left-4 top-4 bottom-4 z-50 flex flex-col rounded-[28px] border border-white/5 bg-[#1E1E1E] py-6 text-white shadow-lg shadow-black/20",
          "transition-[width] duration-300 ease-out",
          collapsed ? "w-[72px] px-2" : "w-64 px-4",
        )}
      >
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="absolute -right-3 top-16 z-10 flex h-8 w-8 items-center justify-center rounded-full border-[3px] border-[#1E1E1E] shadow-md"
          style={{ background: MARK }}
          aria-label={collapsed ? "Show the menu's words" : "Show icons only"}
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4 text-zinc-800" strokeWidth={2.5} />
          ) : (
            <ChevronLeft className="h-4 w-4 text-zinc-800" strokeWidth={2.5} />
          )}
        </button>

        <div className="mb-8">
          <Brand collapsed={collapsed} />
        </div>

        <MenuList pathname={pathname} collapsed={collapsed} waiting={waiting} onNavigate={closeMobile} />

        {user && (
          <div className={cn("mt-4 border-t border-white/10 pt-4", collapsed && "flex flex-col items-center")}>
            <div className={cn("mb-2 flex items-center gap-3", collapsed ? "justify-center" : "px-2")}>
              <Avatar user={user} size="sm" />
              {!collapsed && (
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-white" title={user.full_name || user.email?.split("@")[0]}>{user.full_name || user.email?.split("@")[0]}</p>
                  <p className="truncate text-[13px] text-zinc-400" title={user.email}>{user.email}</p>
                </div>
              )}
            </div>
            <button
              onClick={onSignOut}
              className={cn(
                "flex w-full items-center gap-3 rounded-xl py-2.5 text-zinc-400 transition-colors hover:bg-white/[0.05] hover:text-white",
                collapsed ? "justify-center" : "px-3",
              )}
              title={collapsed ? "Sign out" : undefined}
            >
              <LogOut className="h-5 w-5" />
              {!collapsed && <span className="text-sm font-medium">Sign out</span>}
            </button>
          </div>
        )}
      </aside>
    );
  }

  return (
    <AnimatePresence>
      {mobileMenuOpen && (
        <>
          <m.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setMobileMenuOpen?.(false)}
            className="fixed inset-0 z-50 bg-black/50"
          />
          <m.aside
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed left-0 top-0 bottom-0 z-[60] flex w-[280px] max-w-[85vw] flex-col bg-[#1E1E1E] px-4 py-6 text-white shadow-2xl"
          >
            <div className="mb-8 flex items-center justify-between">
              <Brand collapsed={false} />
              <button
                onClick={() => setMobileMenuOpen?.(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 transition-colors hover:bg-white/20"
                aria-label="Close the menu"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <MenuList pathname={pathname} collapsed={false} waiting={waiting} onNavigate={closeMobile} />

            {user && (
              <div className="mt-4 border-t border-white/10 pt-4">
                <div className="mb-4 flex items-center gap-3 px-1">
                  <Avatar user={user} size="md" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-base font-medium text-white" title={user.full_name || user.email?.split("@")[0]}>{user.full_name || user.email?.split("@")[0]}</p>
                    <p className="truncate text-sm text-zinc-400" title={user.email}>{user.email}</p>
                  </div>
                </div>
                <button
                  onClick={onSignOut}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-white/10 py-3 font-medium text-white transition-colors hover:bg-white/20"
                >
                  <LogOut className="h-5 w-5" />
                  <span>Sign out</span>
                </button>
              </div>
            )}
          </m.aside>
        </>
      )}
    </AnimatePresence>
  );
}
