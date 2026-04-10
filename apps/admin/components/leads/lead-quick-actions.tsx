"use client";

import { cn } from "@/lib/utils";
import type { Lead } from "@/types/leads";
import { Phone, MessageCircle, StickyNote } from "lucide-react";

interface LeadQuickActionsProps {
  lead: Lead;
  onCall?: () => void;
  onWhatsApp?: () => void;
  onNote?: () => void;
  size?: "sm" | "md";
}

export function LeadQuickActions({
  lead,
  onCall,
  onWhatsApp,
  onNote,
  size = "md",
}: LeadQuickActionsProps) {
  const iconSize = size === "sm" ? "w-3.5 h-3.5" : "w-4 h-4";
  const btnPadding = size === "sm" ? "p-1.5" : "p-2";

  const handleCall = () => {
    if (onCall) {
      onCall();
    } else if (lead.page_phone) {
      window.open(`tel:${lead.page_phone}`, "_self");
    }
  };

  const handleWhatsApp = () => {
    if (onWhatsApp) {
      onWhatsApp();
    } else if (lead.page_phone) {
      const phone = lead.page_phone.replace(/[^0-9+]/g, "");
      window.open(`https://wa.me/${phone}`, "_blank");
    }
  };

  const handleNote = () => {
    onNote?.();
  };

  return (
    <div className="inline-flex items-center gap-1">
      <button
        type="button"
        onClick={handleCall}
        disabled={!lead.page_phone && !onCall}
        className={cn(
          "rounded-lg flex items-center justify-center transition-colors",
          "text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/10",
          "disabled:opacity-30 disabled:cursor-not-allowed",
          btnPadding
        )}
        title={lead.page_phone ? `Call ${lead.page_phone}` : "No phone number"}
      >
        <Phone className={iconSize} />
      </button>

      <button
        type="button"
        onClick={handleWhatsApp}
        disabled={!lead.page_phone && !onWhatsApp}
        className={cn(
          "rounded-lg flex items-center justify-center transition-colors",
          "text-green-600 hover:bg-green-50 dark:hover:bg-green-500/10",
          "disabled:opacity-30 disabled:cursor-not-allowed",
          btnPadding
        )}
        title={lead.page_phone ? `WhatsApp ${lead.page_phone}` : "No phone number"}
      >
        <MessageCircle className={iconSize} />
      </button>

      <button
        type="button"
        onClick={handleNote}
        disabled={!onNote}
        className={cn(
          "rounded-lg flex items-center justify-center transition-colors",
          "text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-500/10",
          "disabled:opacity-30 disabled:cursor-not-allowed",
          btnPadding
        )}
        title="Add note"
      >
        <StickyNote className={iconSize} />
      </button>
    </div>
  );
}
