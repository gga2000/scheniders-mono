"use client";

import { useIsMobile } from "@/hooks/use-is-mobile";
import { LeadDetailDesktop } from "@/components/leads/lead-detail-desktop";

export default function LeadDetailPage() {
  const isMobile = useIsMobile();
  if (isMobile) return <div className="p-5 text-sm text-[var(--muted)]">Mobile detail — coming in Task 14.</div>;
  return <LeadDetailDesktop />;
}
