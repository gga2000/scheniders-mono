"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import { useRouter } from "next/navigation";
import { AdminSidebar } from "./admin-sidebar";
import { AdminTopbar } from "./admin-topbar";
import { useAdminAuth } from "@/hooks/use-admin-auth";
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
// useIsMobile hook
// ---------------------------------------------------------------------------

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  return isMobile;
}

// ---------------------------------------------------------------------------
// AdminShell
// ---------------------------------------------------------------------------

export function AdminShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, signOut } = useAdminAuth();
  const commandPalette = useCommandPalette();

  const [isCollapsed, setIsCollapsed] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("adminSidebarCollapsed");
      return saved !== "false";
    }
    return true;
  });
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
    if (mounted) {
      localStorage.setItem("adminSidebarCollapsed", String(isCollapsed));
    }
  }, [isCollapsed, mounted]);

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
    ? { email: user.email ?? "", full_name: (user as any).full_name ?? null }
    : null;

  const topbarUser = user
    ? {
        email: user.email ?? "",
        full_name: (user as any).full_name ?? null,
        role: (user as any).role ?? "admin",
      }
    : null;

  return (
    <AdminSidebarContext.Provider
      value={{
        isCollapsed,
        setIsCollapsed,
        isMobileMenuOpen: mobileMenuOpen,
        setMobileMenuOpen: handleSetMobileMenuOpen,
      }}
    >
      <div className="flex min-h-screen bg-background text-foreground">
        <AdminSidebar
          collapsed={isCollapsed}
          setCollapsed={setIsCollapsed}
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
