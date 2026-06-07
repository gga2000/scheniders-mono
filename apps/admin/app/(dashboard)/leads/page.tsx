"use client";

import { useIsMobile } from "@/hooks/use-is-mobile";
import { LeadsDesktopView } from "@/components/leads/leads-desktop-view";
import { LeadsMobileView } from "@/components/leads/mobile/leads-mobile-view";

export default function LeadsPage() {
  const isMobile = useIsMobile();
  return isMobile ? <LeadsMobileView /> : <LeadsDesktopView />;
}
