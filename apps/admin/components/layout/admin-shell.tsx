"use client";

import React, {
  createContext,
  useContext,
  useState,
  useSyncExternalStore,
  useEffect,
  useCallback,
} from "react";
import { useRouter } from "next/navigation";
import { AdminSidebar } from "./admin-sidebar";
import { AdminTopbar } from "./admin-topbar";
import { useAdminAuth } from "@/hooks/use-admin-auth";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { cn } from "@/lib/utils";
import { CommandPalette, useCommandPalette } from "@/components/shared/command-palette";
import { PageTransition } from "@/components/shared/page-transition";
import { WatchlistSync } from "@/components/merchants/watchlist-sync";

// ---------------------------------------------------------------------------
// Sidebar Context
// ---------------------------------------------------------------------------

interface AdminSidebarContextValue {
  isCollapsed: boolean;
  setIsCollapsed: (v: boolean) => void;
  isMobileMenuOpen: boolean;
  setMobileMenuOpen: (v: boolean) => void;
}

const AdminSidebarContext = createContext<AdminSidebarContextValue>({
  isCollapsed: true,
  setIsCollapsed: () => {},
  isMobileMenuOpen: false,
  setMobileMenuOpen: () => {},
});

export function useAdminSidebar() {
  return useContext(AdminSidebarContext);
}

// ---------------------------------------------------------------------------
// AdminShell
// ---------------------------------------------------------------------------

/** The name a Google sign-in leaves in the user's metadata, if any. */
function metadataName(metadata: Record<string, unknown> | undefined): string | null {
  const name = metadata?.full_name;
  return typeof name === "string" && name ? name : null;
}

// ---------------------------------------------------------------------------
// Saved sidebar choice (browser storage, read without a hydration mismatch)
// ---------------------------------------------------------------------------

const SIDEBAR_KEY = "adminSidebarCollapsed";
const sidebarListeners = new Set<() => void>();

function subscribeSidebar(listener: () => void) {
  sidebarListeners.add(listener);
  return () => {
    sidebarListeners.delete(listener);
  };
}

function readSidebarCollapsed() {
  return localStorage.getItem(SIDEBAR_KEY) !== "false";
}

function setSidebarCollapsed(collapsed: boolean) {
  localStorage.setItem(SIDEBAR_KEY, String(collapsed));
  for (const listener of sidebarListeners) listener();
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, profile, role, signOut } = useAdminAuth();
  const commandPalette = useCommandPalette();

  // The server renders the sidebar collapsed; the saved choice is read once
  // the page is live. Reading it during the first render drew a different
  // sidebar than the server sent (React error 418) on every page load for
  // anyone who keeps the sidebar open.
  const isCollapsed = useSyncExternalStore(subscribeSidebar, readSidebarCollapsed, () => true);
  const [mounted, setMounted] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isMobile = useIsMobile();

  const handleSetMobileMenuOpen = useCallback((open: boolean) => {
    setMobileMenuOpen(open);
  }, []);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isMobile && mobileMenuOpen) {
      setMobileMenuOpen(false);
    }
  }, [isMobile, mobileMenuOpen]);

  const handleSignOut = async () => {
    await signOut();
    router.push("/login");
  };

  const getMainMargin = () => {
    if (!mounted) return "0px";
    if (isMobile) return "0px";
    return isCollapsed ? "88px" : "272px";
  };

  const sidebarUser = user
    ? {
        email: user.email ?? "",
        full_name: profile?.display_name ?? metadataName(user.user_metadata) ?? null,
        avatar_url: profile?.avatar_url ?? null,
      }
    : null;

  const topbarUser = user
    ? {
        email: user.email ?? "",
        full_name: profile?.display_name ?? metadataName(user.user_metadata) ?? null,
        avatar_url: profile?.avatar_url ?? null,
        // The real admin-console role (super_admin / support_staff), NOT the
        // Supabase JWT role which is always "authenticated".
        role: role ?? "",
      }
    : null;

  return (
    <AdminSidebarContext.Provider
      value={{
        isCollapsed,
        setIsCollapsed: setSidebarCollapsed,
        isMobileMenuOpen: mobileMenuOpen,
        setMobileMenuOpen: handleSetMobileMenuOpen,
      }}
    >
      <div className="flex min-h-screen bg-background text-foreground">
        <AdminSidebar
          collapsed={isCollapsed}
          setCollapsed={setSidebarCollapsed}
          isMobile={isMobile}
          mobileMenuOpen={mobileMenuOpen}
          setMobileMenuOpen={handleSetMobileMenuOpen}
          user={sidebarUser}
          onSignOut={handleSignOut}
        />

        <main
          className={cn(
            "flex-1 min-w-0 transition-all duration-500 ease-in-out"
          )}
          style={{ marginLeft: getMainMargin() }}
        >
          <AdminTopbar
            user={topbarUser}
            onMenuClick={() => handleSetMobileMenuOpen(true)}
            isMobile={isMobile}
            onOpenCommandPalette={commandPalette.open}
          />

          <div className="max-w-[1800px] mx-auto">
            <PageTransition>{children}</PageTransition>
          </div>
        </main>

        <CommandPalette
          isOpen={commandPalette.isOpen}
          onClose={commandPalette.close}
        />
        <WatchlistSync />
      </div>
    </AdminSidebarContext.Provider>
  );
}
