"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, SearchX } from "lucide-react";
import { usePageHeader } from "@/store/use-page-header";

/**
 * A wrong or old link inside the console: says which address has no page and
 * leads back to the Dashboard. Drawn like LoadError's "Could not find" state,
 * so a missing page and a missing shop look alike. app/not-found.tsx puts it
 * inside the console's menu.
 */
export function ConsoleNotFound() {
  const pathname = usePathname();
  const setTab = usePageHeader((s) => s.setTab);

  useEffect(() => {
    setTab("Page not found");
    return () => setTab(null);
  }, [setTab]);

  return (
    <div className="p-4 md:p-6 flex items-center justify-center min-h-[60vh]">
      <div className="text-center space-y-4 max-w-md">
        <div className="w-16 h-16 rounded-2xl border bg-foreground/5 border-[var(--card-border)] flex items-center justify-center mx-auto">
          <SearchX className="w-8 h-8 text-foreground/70" aria-hidden="true" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-foreground">This page does not exist</h1>
          <p className="text-sm text-[var(--muted)] mt-2 break-words">
            The console has no page at <span className="font-semibold text-foreground">{pathname}</span>. It may
            have moved, or the link is wrong.
          </p>
        </div>
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-foreground text-background text-sm font-semibold hover:opacity-90 transition-all"
        >
          <LayoutDashboard className="w-4 h-4" aria-hidden="true" />
          Go to the Dashboard
        </Link>
      </div>
    </div>
  );
}
