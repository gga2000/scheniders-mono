"use client";

import React, {
  useState,
  useSyncExternalStore,
  useEffect,
  useCallback,
} from "react";
import { useRouter } from "next/navigation";
import { AdminSidebar } from "./admin-sidebar";
import { AdminTopbar } from "./admin-topbar";
import { AccessCheckNotice } from "./access-check-notice";
import { useAdminAuth } from "@/hooks/use-admin-auth";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { cn } from "@/lib/utils";
import { readMenuCollapsed, writeMenuCollapsed } from "@/lib/menu-choice";
import { CommandPalette, useCommandPalette } from "@/components/shared/command-palette";
import { PageTransition } from "@/components/shared/page-transition";
import { WatchlistSync } from "@/components/merchants/watchlist-sync";

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

const sidebarListeners = new Set<() => void>();

function subscribeSidebar(listener: () => void) {
  sidebarListeners.add(listener);
  return () => {
    sidebarListeners.delete(listener);
  };
}

function setSidebarCollapsed(collapsed: boolean) {
  writeMenuCollapsed(collapsed);
  for (const listener of sidebarListeners) listener();
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, profile, role, signOut } = useAdminAuth();
  const commandPalette = useCommandPalette();

  // The server renders the menu open; the saved choice is read once the page
  // is live. Reading it during the first render drew a different sidebar than
  // the server sent (React error 418) on every page load for anyone who had
  // changed it.
  const isCollapsed = useSyncExternalStore(subscribeSidebar, readMenuCollapsed, () => false);
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

      {/*
        The room for the fixed menu is set in CSS, so the server's page
        already has it. It used to start at 0 and slide to 272px for half a
        second after every page load, pushing the whole page sideways. It
        slides only when someone opens or closes the menu. For staff who
        chose icons, data-admin-main takes the narrow room before the page
        comes alive (lib/menu-choice.ts).
      */}
      <main
        data-admin-main
        className={cn(
          "flex-1 min-w-0",
          isCollapsed ? "md:ml-[88px]" : "md:ml-[272px]",
          mounted && "transition-[margin-left] duration-500 ease-in-out",
        )}
      >
        <AdminTopbar
          user={topbarUser}
          onMenuClick={() => handleSetMobileMenuOpen(true)}
          isMobile={isMobile}
          onOpenCommandPalette={commandPalette.open}
        />

        <div className="max-w-[1800px] mx-auto">
          <AccessCheckNotice />
          <PageTransition>{children}</PageTransition>
        </div>
      </main>

      <CommandPalette
        isOpen={commandPalette.isOpen}
        onClose={commandPalette.close}
      />
      <WatchlistSync />
    </div>
  );
}
