"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowLeft,
  Phone,
  MessageCircle,
  StickyNote,
  ChevronRight,
  Loader2,
  AlertTriangle,
  Target,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useLeadDetail } from "@/hooks/use-lead-detail";
import {
  LEAD_STATUS_CONFIG,
  LEAD_PRIORITY_CONFIG,
  LEAD_TIER_CONFIG,
  PLATFORM_CONFIG,
} from "@/types/leads";
import {
  OverviewContent,
  SocialContent,
  CompetitorsContent,
  StoreContent,
} from "@/components/leads/lead-detail-tabs";
import { LeadActivityTimeline } from "@/components/leads/lead-activity-timeline";
import { LeadFollowUpList } from "@/components/leads/lead-follow-up-list";
import { QuickNoteSheet } from "@/components/leads/mobile/quick-note-sheet";
import { AdvanceStageSheet } from "@/components/leads/mobile/advance-stage-sheet";

// ── Helpers ──────────────────────────────────────────────────────────────

function toIntlIraqi(raw: string): string | null {
  const d = raw.replace(/\D/g, "");
  if (d.startsWith("964")) return d;
  const n = d.replace(/^0+/, "");
  return n.startsWith("7") ? `964${n}` : null;
}

// ── Tabs ─────────────────────────────────────────────────────────────────

const tabs = ["Overview", "Activity", "Follow-ups", "Social", "Competitors", "Store"] as const;
type Tab = (typeof tabs)[number];

// ── Component ─────────────────────────────────────────────────────────────

export function LeadMobileDetail() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, isError } = useLeadDetail(id);
  const [tab, setTab] = useState<Tab>("Overview");
  const [noteOpen, setNoteOpen] = useState(false);
  const [stageOpen, setStageOpen] = useState(false);

  // Loading
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--muted)]" />
      </div>
    );
  }

  // Error
  if (isError) {
    return (
      <div className="p-4 space-y-4">
        <Link
          href="/leads"
          className="inline-flex items-center gap-1.5 text-sm text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Leads
        </Link>
        <div className="flex flex-col items-center justify-center py-20 text-red-400">
          <AlertTriangle className="w-12 h-12 mb-3" />
          <p className="text-lg font-semibold">Failed to load lead</p>
          <p className="text-sm text-[var(--muted)] mt-1">Something went wrong. Please try again later.</p>
        </div>
      </div>
    );
  }

  // Not found
  if (!data) {
    return (
      <div className="p-4 space-y-4">
        <Link
          href="/leads"
          className="inline-flex items-center gap-1.5 text-sm text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Leads
        </Link>
        <div className="flex flex-col items-center justify-center py-20 text-[var(--muted)]">
          <Target className="w-12 h-12 mb-3" />
          <p className="text-lg font-semibold">Lead not found</p>
        </div>
      </div>
    );
  }

  const { lead, activities, follow_ups, social_links, competitors } = data;

  const statusCfg = LEAD_STATUS_CONFIG[lead.status];
  const priorityCfg = LEAD_PRIORITY_CONFIG[lead.priority];
  const tierCfg = LEAD_TIER_CONFIG[lead.tier];
  const platformCfg = PLATFORM_CONFIG[lead.platform];

  // Phone helpers
  const phone =
    lead.page_phone?.trim() ||
    lead.phone_numbers?.find((p) => p.number?.trim())?.number?.trim() ||
    null;
  const intl = phone ? toIntlIraqi(phone) : null;

  return (
    <div className="p-4 space-y-4 pb-24">
      {/* ── Back Link ─────────────────────────────────────────────── */}
      <Link
        href="/leads"
        className="inline-flex items-center gap-1.5 text-sm text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back
      </Link>

      {/* ── Header Card ───────────────────────────────────────────── */}
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-5">
        {/* Avatar + name */}
        <div className="flex items-center gap-4 mb-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#FF8899] to-[#A78BFA] flex items-center justify-center text-white font-bold text-2xl shrink-0 shadow-lg">
            {lead.merchant_name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-[var(--foreground)] truncate">
              {lead.merchant_name}
            </h1>
            {lead.management_name && (
              <p className="text-sm text-[var(--muted)] mt-0.5 truncate">
                {lead.management_name}
              </p>
            )}
          </div>
        </div>

        {/* Badge row */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Platform */}
          <span
            className="px-2.5 py-1 rounded-lg text-[11px] font-bold"
            style={{ backgroundColor: `${platformCfg.color}20`, color: platformCfg.color }}
          >
            {platformCfg.label}
          </span>

          {/* Tier */}
          <span
            className="px-2.5 py-1 rounded-lg text-[11px] font-bold"
            style={{ backgroundColor: `${tierCfg.color}20`, color: tierCfg.color }}
          >
            {tierCfg.label}
          </span>

          {/* Priority */}
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-white/5 text-[var(--foreground)]">
            <span
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: priorityCfg.color }}
            />
            {priorityCfg.label}
          </span>

          {/* Status */}
          <span
            className="px-3 py-1 rounded-full text-[11px] font-bold"
            style={{ backgroundColor: statusCfg.bgColor, color: statusCfg.color }}
          >
            {statusCfg.label}
          </span>

          {/* Lead Score Ring */}
          <div className="relative w-10 h-10">
            <svg className="w-10 h-10 -rotate-90" viewBox="0 0 36 36">
              <circle
                cx="18" cy="18" r="15"
                fill="none"
                stroke="var(--card-border)"
                strokeWidth="3"
              />
              <circle
                cx="18" cy="18" r="15"
                fill="none"
                stroke="var(--primary)"
                strokeWidth="3"
                strokeDasharray={`${(lead.lead_score / 100) * 94.25} 94.25`}
                strokeLinecap="round"
              />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-[var(--foreground)]">
              {lead.lead_score}
            </span>
          </div>
        </div>
      </div>

      {/* ── Scrollable Tab Bar ────────────────────────────────────── */}
      <div className="flex gap-1 overflow-x-auto border-b border-[var(--card-border)]">
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "whitespace-nowrap px-4 py-2.5 text-sm font-semibold transition-colors relative shrink-0",
              tab === t
                ? "text-[var(--foreground)] border-b-2 border-[var(--primary)]"
                : "text-[var(--muted)] hover:text-[var(--foreground)]"
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {/* ── Tab Content ───────────────────────────────────────────── */}
      <div>
        {tab === "Overview" && <OverviewContent lead={lead} />}
        {tab === "Activity" && (
          <LeadActivityTimeline activities={activities} leadId={lead.id} />
        )}
        {tab === "Follow-ups" && (
          <LeadFollowUpList followUps={follow_ups} leadId={lead.id} />
        )}
        {tab === "Social" && (
          <SocialContent socialLinks={social_links} />
        )}
        {tab === "Competitors" && (
          <CompetitorsContent competitors={competitors} />
        )}
        {tab === "Store" && <StoreContent lead={lead} />}
      </div>

      {/* ── Sticky Bottom Action Bar ──────────────────────────────── */}
      <div className="fixed inset-x-0 bottom-0 z-30 flex gap-2 border-t border-[var(--card-border)] bg-[var(--background)]/95 px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur">
        {/* Call */}
        <button
          onClick={() => {
            if (phone) {
              window.location.href = `tel:${phone}`;
            } else {
              toast.info("No phone number on file");
            }
          }}
          className="flex-1 flex flex-col items-center justify-center gap-1 rounded-xl py-2.5 text-xs font-semibold text-[var(--foreground)] border border-[var(--card-border)] hover:bg-white/5 transition-colors active:scale-95"
        >
          <Phone className="w-4 h-4" />
          Call
        </button>

        {/* WhatsApp */}
        <button
          onClick={() => {
            if (intl) {
              window.open(`https://wa.me/${intl}`, "_blank");
            } else {
              toast.info("No WhatsApp number on file");
            }
          }}
          className="flex-1 flex flex-col items-center justify-center gap-1 rounded-xl py-2.5 text-xs font-semibold text-[var(--foreground)] border border-[var(--card-border)] hover:bg-white/5 transition-colors active:scale-95"
        >
          <MessageCircle className="w-4 h-4" />
          WhatsApp
        </button>

        {/* Note */}
        <button
          onClick={() => setNoteOpen(true)}
          className="flex-1 flex flex-col items-center justify-center gap-1 rounded-xl py-2.5 text-xs font-semibold text-[var(--foreground)] border border-[var(--card-border)] hover:bg-white/5 transition-colors active:scale-95"
        >
          <StickyNote className="w-4 h-4" />
          Note
        </button>

        {/* Advance */}
        <button
          onClick={() => setStageOpen(true)}
          className="flex-1 flex flex-col items-center justify-center gap-1 rounded-xl py-2.5 text-xs font-semibold text-[var(--foreground)] border border-[var(--card-border)] hover:bg-white/5 transition-colors active:scale-95"
        >
          <ChevronRight className="w-4 h-4" />
          Advance
        </button>
      </div>

      {/* ── Sheets ────────────────────────────────────────────────── */}
      <QuickNoteSheet
        leadId={noteOpen ? lead.id : null}
        leadName={lead.merchant_name}
        onClose={() => setNoteOpen(false)}
      />
      <AdvanceStageSheet
        lead={stageOpen ? lead : null}
        onClose={() => setStageOpen(false)}
      />
    </div>
  );
}
