"use client";

import { useIsMobile } from "@/hooks/use-is-mobile";
import { LeadDetailDesktop } from "@/components/leads/lead-detail-desktop";
import { LeadMobileDetail } from "@/components/leads/mobile/lead-mobile-detail";

export default function LeadDetailPage() {
  const isMobile = useIsMobile();
  return isMobile ? <LeadMobileDetail /> : <LeadDetailDesktop />;
}
