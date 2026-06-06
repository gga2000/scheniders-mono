"use client";

import { useIsMobile } from "@/hooks/use-is-mobile";
import { LeadsDesktopView } from "@/components/leads/leads-desktop-view";

export default function LeadsPage() {
  const isMobile = useIsMobile();
  // `useIsMobile` is false until mounted, so SSR/first paint renders desktop markup;
  // on a phone it swaps to the mobile view after mount (no hydration mismatch).
  if (isMobile) {
    return (
      <div className="p-5 text-sm text-[var(--muted)]">Mobile leads — coming in Task 12.</div>
    );
  }
  return <LeadsDesktopView />;
}
