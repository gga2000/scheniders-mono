"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { useLeadDetail } from "@/hooks/use-lead-detail";
import {
  LEAD_STATUS_CONFIG,
  LEAD_PRIORITY_CONFIG,
  LEAD_TIER_CONFIG,
  PLATFORM_CONFIG,
} from "@/types/leads";
import type { Lead, LeadFormData } from "@/types/leads";
import {
  ArrowLeft,
  Phone,
  MessageCircle,
  Edit3,
  MoreVertical,
  Loader2,
  MapPin,
  Calendar,
  TrendingUp,
  Users,
  Star,
  Target,
  ExternalLink,
  Copy,
  Store,
  Globe,
  Building2,
  AlertTriangle,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { LeadActivityTimeline } from "@/components/leads/lead-activity-timeline";
import { LeadFollowUpList } from "@/components/leads/lead-follow-up-list";
import { LeadBuildStoreDialog } from "@/components/leads/lead-build-store-dialog";
import { LeadConvertDialog } from "@/components/leads/lead-convert-dialog";
import { LeadForm } from "@/components/leads/lead-form";
import { useUpdateLead } from "@/hooks/use-lead-mutations";

// ── Helpers ────────────────────────────────────────────────────────────

function relativeTime(dateStr: string | null | undefined): string {
  if (!dateStr) return "Never";
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return "Just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  const diffMonth = Math.floor(diffDay / 30);
  if (diffMonth < 12) return `${diffMonth}mo ago`;
  return `${Math.floor(diffMonth / 12)}y ago`;
}

function daysBetween(from: string, to: Date = new Date()): number {
  return Math.floor((to.getTime() - new Date(from).getTime()) / 86_400_000);
}

function stalenessColor(dateStr: string | null | undefined): string {
  if (!dateStr) return "#EF4444"; // red - never contacted
  const days = daysBetween(dateStr);
  if (days <= 3) return "#22C55E"; // green
  if (days <= 7) return "#F59E0B"; // amber
  return "#EF4444"; // red
}

const fmt = (n: number) => n.toLocaleString();

// ── Tabs ───────────────────────────────────────────────────────────────

const tabs = ["Overview", "Activity", "Follow-ups", "Social", "Competitors", "Store"] as const;
type Tab = (typeof tabs)[number];

// ── Score Breakdown Keys ───────────────────────────────────────────────

const SCORE_KEYS: { key: keyof Lead["score_breakdown"]; label: string; color: string }[] = [
  { key: "followers", label: "Followers", color: "#60A5FA" },
  { key: "engagement", label: "Engagement", color: "#34D399" },
  { key: "orders", label: "Orders", color: "#F59E0B" },
  { key: "contact", label: "Contact", color: "#A78BFA" },
  { key: "platform", label: "Platform", color: "#F97316" },
  { key: "responsiveness", label: "Responsiveness", color: "#EC4899" },
  { key: "store", label: "Store", color: "#06B6D4" },
];

// ── Page ───────────────────────────────────────────────────────────────

export default function LeadDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, isError } = useLeadDetail(id);
  const [activeTab, setActiveTab] = useState<Tab>("Overview");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [buildStoreOpen, setBuildStoreOpen] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);
  const [editFormOpen, setEditFormOpen] = useState(false);
  const updateLead = useUpdateLead();

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
      <div className="p-4 md:p-6 space-y-4">
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
      <div className="p-4 md:p-6 space-y-4">
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

  const engagementRate =
    ((lead.avg_like_count + lead.avg_comments_count) /
      Math.max(lead.follower_count, 1)) *
    100;

  const daysInPipeline = daysBetween(lead.created_at);
  const estMonthlyOrders = lead.estimated_daily_orders * 30;

  const showBuildStore = !["store_built", "converted"].includes(lead.status);
  const showConvert = ["store_built", "interested"].includes(lead.status);

  return (
    <div className="p-4 md:p-6 space-y-5">
      {/* ── Back Button ──────────────────────────────────────────── */}
      <Link
        href="/leads"
        className="inline-flex items-center gap-1.5 text-sm text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Leads
      </Link>

      {/* ── Header Card ──────────────────────────────────────────── */}
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-5 md:p-6">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-5">
          {/* Left: Avatar + name */}
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#FF8899] to-[#A78BFA] flex items-center justify-center text-white font-bold text-2xl shrink-0 shadow-lg">
              {lead.merchant_name.charAt(0).toUpperCase()}
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-bold text-[var(--foreground)]">
                {lead.merchant_name}
              </h1>
              {lead.management_name && (
                <p className="text-sm text-[var(--muted)] mt-0.5">
                  {lead.management_name}
                </p>
              )}
              <div className="flex items-center gap-2 mt-2">
                <span
                  className="px-2.5 py-1 rounded-lg text-[11px] font-bold"
                  style={{ backgroundColor: `${platformCfg.color}20`, color: platformCfg.color }}
                >
                  {platformCfg.label}
                </span>
              </div>
            </div>
          </div>

          {/* Right: Badges + actions */}
          <div className="flex flex-col items-start lg:items-end gap-3">
            {/* Badge row */}
            <div className="flex flex-wrap items-center gap-2">
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

              {/* Lead Score Circle */}
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

            {/* Action buttons */}
            <div className="flex flex-wrap items-center gap-2">
              {showBuildStore && (
                <button
                  onClick={() => setBuildStoreOpen(true)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-[#A78BFA] text-white hover:brightness-110 transition-all shadow-sm"
                >
                  <Store className="w-3.5 h-3.5" />
                  Build Store
                </button>
              )}
              {showConvert && (
                <button
                  onClick={() => setConvertOpen(true)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-emerald-500 text-white hover:brightness-110 transition-all shadow-sm"
                >
                  <TrendingUp className="w-3.5 h-3.5" />
                  Convert
                </button>
              )}
              <button
                onClick={() => setEditFormOpen(true)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold border border-[var(--card-border)] text-[var(--foreground)] hover:bg-white/5 transition-all"
              >
                <Edit3 className="w-3.5 h-3.5" />
                Edit
              </button>

              {/* Dropdown */}
              <div className="relative">
                <button
                  onClick={() => setDropdownOpen(!dropdownOpen)}
                  className="w-9 h-9 rounded-xl flex items-center justify-center border border-[var(--card-border)] text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
                >
                  <MoreVertical className="w-4 h-4" />
                </button>
                {dropdownOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setDropdownOpen(false)}
                    />
                    <div className="absolute right-0 top-full mt-1 z-50 w-44 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl shadow-xl py-1">
                      <button
                        onClick={() => setDropdownOpen(false)}
                        className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-[var(--foreground)] hover:bg-white/5 transition-colors"
                      >
                        <Phone className="w-4 h-4" />
                        Call
                      </button>
                      <button
                        onClick={() => setDropdownOpen(false)}
                        className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-[var(--foreground)] hover:bg-white/5 transition-colors"
                      >
                        <MessageCircle className="w-4 h-4" />
                        WhatsApp
                      </button>
                      <button
                        onClick={() => setDropdownOpen(false)}
                        className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-[var(--foreground)] hover:bg-white/5 transition-colors"
                      >
                        <Edit3 className="w-4 h-4" />
                        Add Note
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Prediction Card ──────────────────────────────────────── */}
      <div className="bg-gradient-to-r from-[#A78BFA]/10 to-[#34D399]/10 border border-[#A78BFA]/20 rounded-2xl p-5 md:p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-[var(--muted)] mb-2">
              Revenue Prediction
            </p>
            <p className="text-3xl font-black text-[var(--foreground)]">
              ~{lead.estimated_daily_orders} orders/day
            </p>
            <p className="text-lg font-semibold text-[var(--muted)] mt-1">
              ~{fmt(estMonthlyOrders)} orders/month
            </p>
            <p className="text-lg font-bold text-emerald-400 mt-1">
              ~{fmt(lead.estimated_monthly_revenue)} IQD/month potential revenue
            </p>
          </div>
          <div className="bg-black/10 dark:bg-white/5 rounded-xl px-4 py-3 text-sm text-[var(--muted)]">
            <p className="font-semibold text-[var(--foreground)] mb-1">Calculation</p>
            <p>{fmt(lead.avg_view_count)} avg views &divide; 1000</p>
          </div>
        </div>
      </div>

      {/* ── Quick Stats Row ──────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {/* Lead Score */}
        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-4">
          <div className="flex items-center gap-2 text-[var(--muted)] mb-2">
            <Target className="w-4 h-4" />
            <span className="text-xs font-semibold">Lead Score</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative w-12 h-12">
              <svg className="w-12 h-12 -rotate-90" viewBox="0 0 36 36">
                <circle cx="18" cy="18" r="15" fill="none" stroke="var(--card-border)" strokeWidth="2.5" />
                <circle
                  cx="18" cy="18" r="15" fill="none"
                  stroke="var(--primary)" strokeWidth="2.5"
                  strokeDasharray={`${(lead.lead_score / 100) * 94.25} 94.25`}
                  strokeLinecap="round"
                />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-[var(--foreground)]">
                {lead.lead_score}
              </span>
            </div>
            <span className="text-xs text-[var(--muted)]">/ 100</span>
          </div>
        </div>

        {/* Followers */}
        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-4">
          <div className="flex items-center gap-2 text-[var(--muted)] mb-2">
            <Users className="w-4 h-4" />
            <span className="text-xs font-semibold">Followers</span>
          </div>
          <p className="text-xl font-bold text-[var(--foreground)]">
            {fmt(lead.follower_count)}
          </p>
          <span
            className="text-[10px] font-bold px-1.5 py-0.5 rounded mt-1 inline-block"
            style={{ backgroundColor: `${tierCfg.color}15`, color: tierCfg.color }}
          >
            {tierCfg.label}
          </span>
        </div>

        {/* Engagement Rate */}
        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-4">
          <div className="flex items-center gap-2 text-[var(--muted)] mb-2">
            <TrendingUp className="w-4 h-4" />
            <span className="text-xs font-semibold">Engagement Rate</span>
          </div>
          <p className="text-xl font-bold text-[var(--foreground)]">
            {engagementRate.toFixed(1)}%
          </p>
          <span className="text-[10px] text-[var(--muted)] mt-1 inline-block">
            Likes + Comments / Followers
          </span>
        </div>

        {/* Days in Pipeline */}
        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-4">
          <div className="flex items-center gap-2 text-[var(--muted)] mb-2">
            <Calendar className="w-4 h-4" />
            <span className="text-xs font-semibold">Days in Pipeline</span>
          </div>
          <p className="text-xl font-bold text-[var(--foreground)]">
            {daysInPipeline}
          </p>
          <span className="text-[10px] text-[var(--muted)] mt-1 inline-block">
            Since {new Date(lead.created_at).toLocaleDateString()}
          </span>
        </div>
      </div>

      {/* ── Score Breakdown ──────────────────────────────────────── */}
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-5">
        <h3 className="text-sm font-bold text-[var(--foreground)] mb-4">Score Breakdown</h3>
        <div className="space-y-3">
          {SCORE_KEYS.map(({ key, label, color }) => {
            const value = lead.score_breakdown?.[key] ?? 0;
            return (
              <div key={key} className="flex items-center gap-3">
                <span className="text-xs text-[var(--muted)] w-28 shrink-0">{label}</span>
                <div className="flex-1 h-2 rounded-full bg-white/5 overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${value}%` }}
                    transition={{ duration: 0.6, ease: "easeOut" }}
                    className="h-full rounded-full"
                    style={{ backgroundColor: color }}
                  />
                </div>
                <span className="text-xs font-bold text-[var(--foreground)] w-8 text-right">
                  {value}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Tab Navigation ───────────────────────────────────────── */}
      <div className="flex gap-1 border-b border-[var(--card-border)]">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "px-4 py-2.5 text-sm font-semibold transition-colors relative",
              activeTab === tab
                ? "text-[var(--foreground)]"
                : "text-[var(--muted)] hover:text-[var(--foreground)]"
            )}
          >
            {tab}
            {activeTab === tab && (
              <motion.div
                layoutId="lead-tab-underline"
                className="absolute bottom-0 left-0 right-0 h-0.5 bg-[var(--primary)]"
                transition={{ duration: 0.2 }}
              />
            )}
          </button>
        ))}
      </div>

      {/* ── Tab Content ──────────────────────────────────────────── */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2 }}
        >
          {activeTab === "Overview" && <OverviewContent lead={lead} />}
          {activeTab === "Activity" && (
            <LeadActivityTimeline activities={activities} leadId={lead.id} />
          )}
          {activeTab === "Follow-ups" && (
            <LeadFollowUpList followUps={follow_ups} leadId={lead.id} />
          )}
          {activeTab === "Social" && (
            <SocialContent socialLinks={social_links} />
          )}
          {activeTab === "Competitors" && (
            <CompetitorsContent competitors={competitors} />
          )}
          {activeTab === "Store" && <StoreContent lead={lead} />}
        </motion.div>
      </AnimatePresence>

      {/* ── Dialogs ─────────────────────────────────────────────── */}
      <LeadBuildStoreDialog
        isOpen={buildStoreOpen}
        onClose={() => setBuildStoreOpen(false)}
        lead={lead}
      />
      <LeadConvertDialog
        isOpen={convertOpen}
        onClose={() => setConvertOpen(false)}
        lead={lead}
      />
      <LeadForm
        open={editFormOpen}
        onOpenChange={setEditFormOpen}
        onSubmit={(formData: LeadFormData) => {
          updateLead.mutate(
            { id: lead.id, data: formData },
            { onSuccess: () => setEditFormOpen(false) }
          );
        }}
        initialData={{
          merchant_name: lead.merchant_name,
          industry_id: lead.industry_id,
          platform: lead.platform,
          platform_url: lead.platform_url ?? "",
          follower_count: lead.follower_count,
          management_name: lead.management_name ?? "",
          management_info: lead.management_info ?? "",
          page_phone: lead.page_phone ?? "",
          phone_numbers: lead.phone_numbers,
          avg_view_count: lead.avg_view_count,
          avg_like_count: lead.avg_like_count,
          avg_comments_count: lead.avg_comments_count,
          avg_order_count: lead.avg_order_count,
          address: lead.address ?? "",
          city: lead.city ?? "",
          governorate_code: lead.governorate_code ?? "",
          priority: lead.priority,
          assigned_to: lead.assigned_to,
          tags: lead.tags,
          source_campaign: lead.source_campaign ?? "",
          source_medium: lead.source_medium ?? "",
        }}
        isLoading={updateLead.isPending}
      />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Tab Content Components
// ═══════════════════════════════════════════════════════════════════════

// ── Overview Tab ───────────────────────────────────────────────────────

function OverviewContent({ lead }: { lead: Lead }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      {/* Contact Info */}
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-5">
        <h3 className="text-sm font-bold text-[var(--foreground)] mb-4 flex items-center gap-2">
          <Phone className="w-4 h-4 text-[var(--muted)]" />
          Contact Information
        </h3>
        <div className="space-y-3">
          {lead.page_phone && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-[var(--muted)]">Page Phone</span>
              <a
                href={`tel:${lead.page_phone}`}
                className="text-sm font-medium text-[var(--foreground)] hover:text-[var(--primary)] transition-colors"
              >
                {lead.page_phone}
              </a>
            </div>
          )}
          {lead.phone_numbers?.length > 0 && (
            <div>
              <span className="text-xs text-[var(--muted)] block mb-2">Additional Numbers</span>
              {lead.phone_numbers.map((pn, i) => (
                <div key={i} className="flex items-center justify-between py-1">
                  <span className="text-xs text-[var(--muted)]">{pn.title}</span>
                  <a
                    href={`tel:${pn.number}`}
                    className="text-sm font-medium text-[var(--foreground)] hover:text-[var(--primary)] transition-colors"
                  >
                    {pn.number}
                  </a>
                </div>
              ))}
            </div>
          )}
          {lead.management_info && (
            <div className="flex items-start justify-between gap-4">
              <span className="text-xs text-[var(--muted)] shrink-0">Management Info</span>
              <p className="text-sm text-[var(--foreground)] text-right">{lead.management_info}</p>
            </div>
          )}
          {!lead.page_phone && !lead.phone_numbers?.length && !lead.management_info && (
            <p className="text-sm text-[var(--muted)] italic">No contact info available</p>
          )}
        </div>
      </div>

      {/* Location */}
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-5">
        <h3 className="text-sm font-bold text-[var(--foreground)] mb-4 flex items-center gap-2">
          <MapPin className="w-4 h-4 text-[var(--muted)]" />
          Location
        </h3>
        <div className="space-y-3">
          {lead.city && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-[var(--muted)]">City</span>
              <span className="text-sm font-medium text-[var(--foreground)]">{lead.city}</span>
            </div>
          )}
          {lead.address && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-[var(--muted)]">Address</span>
              <span className="text-sm font-medium text-[var(--foreground)]">{lead.address}</span>
            </div>
          )}
          {lead.governorate_code && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-[var(--muted)]">Governorate</span>
              <span className="text-sm font-medium text-[var(--foreground)]">{lead.governorate_code}</span>
            </div>
          )}
          {!lead.city && !lead.address && !lead.governorate_code && (
            <p className="text-sm text-[var(--muted)] italic">No location info available</p>
          )}
        </div>
      </div>

      {/* Social Metrics */}
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-5">
        <h3 className="text-sm font-bold text-[var(--foreground)] mb-4 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-[var(--muted)]" />
          Social Metrics
        </h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <span className="text-xs text-[var(--muted)] block">Avg Views</span>
            <span className="text-lg font-bold text-[var(--foreground)]">{fmt(lead.avg_view_count)}</span>
          </div>
          <div>
            <span className="text-xs text-[var(--muted)] block">Avg Likes</span>
            <span className="text-lg font-bold text-[var(--foreground)]">{fmt(lead.avg_like_count)}</span>
          </div>
          <div>
            <span className="text-xs text-[var(--muted)] block">Avg Comments</span>
            <span className="text-lg font-bold text-[var(--foreground)]">{fmt(lead.avg_comments_count)}</span>
          </div>
          <div>
            <span className="text-xs text-[var(--muted)] block">Avg Orders</span>
            <span className="text-lg font-bold text-[var(--foreground)]">{fmt(lead.avg_order_count)}</span>
          </div>
        </div>
      </div>

      {/* Tags */}
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-5">
        <h3 className="text-sm font-bold text-[var(--foreground)] mb-4 flex items-center gap-2">
          <Star className="w-4 h-4 text-[var(--muted)]" />
          Tags
        </h3>
        {lead.tags?.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {lead.tags.map((tag) => (
              <span
                key={tag}
                className="px-3 py-1 rounded-full text-xs font-medium bg-[var(--primary)]/10 text-[var(--primary)] border border-[var(--primary)]/20"
              >
                {tag}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-sm text-[var(--muted)] italic">No tags</p>
        )}
      </div>

      {/* Source Info */}
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-5">
        <h3 className="text-sm font-bold text-[var(--foreground)] mb-4 flex items-center gap-2">
          <Globe className="w-4 h-4 text-[var(--muted)]" />
          Source Information
        </h3>
        <div className="space-y-3">
          {lead.source_campaign && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-[var(--muted)]">Campaign</span>
              <span className="text-sm font-medium text-[var(--foreground)]">{lead.source_campaign}</span>
            </div>
          )}
          {lead.source_medium && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-[var(--muted)]">Medium</span>
              <span className="text-sm font-medium text-[var(--foreground)]">{lead.source_medium}</span>
            </div>
          )}
          {lead.source_referrer && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-[var(--muted)]">Referrer</span>
              <span className="text-sm font-medium text-[var(--foreground)] truncate max-w-[200px]">{lead.source_referrer}</span>
            </div>
          )}
          {!lead.source_campaign && !lead.source_medium && !lead.source_referrer && (
            <p className="text-sm text-[var(--muted)] italic">No source info available</p>
          )}
        </div>
      </div>

      {/* Assignment & Staleness */}
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-5">
        <h3 className="text-sm font-bold text-[var(--foreground)] mb-4 flex items-center gap-2">
          <Users className="w-4 h-4 text-[var(--muted)]" />
          Assignment & Staleness
        </h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-[var(--muted)]">Assigned To</span>
            <span className="text-sm font-medium text-[var(--foreground)]">
              {lead.assigned_user?.display_name ?? lead.assigned_user?.email ?? "Unassigned"}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-[var(--muted)]">Last Contacted</span>
            <span className="flex items-center gap-2 text-sm font-medium">
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: stalenessColor(lead.last_contacted_at) }}
              />
              <span className="text-[var(--foreground)]">{relativeTime(lead.last_contacted_at)}</span>
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-[var(--muted)]">Next Follow-up</span>
            <span className="flex items-center gap-2 text-sm font-medium">
              {lead.next_follow_up_at ? (
                <>
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{
                      backgroundColor:
                        new Date(lead.next_follow_up_at) < new Date() ? "#EF4444" : "#22C55E",
                    }}
                  />
                  <span className="text-[var(--foreground)]">
                    {new Date(lead.next_follow_up_at).toLocaleDateString()}
                  </span>
                </>
              ) : (
                <span className="text-[var(--muted)] italic">Not scheduled</span>
              )}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Social Tab ─────────────────────────────────────────────────────────

function SocialContent({
  socialLinks,
}: {
  socialLinks: { id: string; platform: string; url: string; username: string | null; follower_count: number }[];
}) {
  if (!socialLinks?.length) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-[var(--muted)]">
        <Globe className="w-10 h-10 mb-3" />
        <p className="text-sm font-semibold">No social links added</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {socialLinks.map((link) => {
        const cfg = PLATFORM_CONFIG[link.platform as keyof typeof PLATFORM_CONFIG];
        return (
          <div
            key={link.id}
            className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-5"
          >
            <div className="flex items-center gap-3 mb-3">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ backgroundColor: `${cfg?.color ?? "#6B7280"}15` }}
              >
                <Globe className="w-5 h-5" style={{ color: cfg?.color ?? "#6B7280" }} />
              </div>
              <div>
                <p className="text-sm font-bold text-[var(--foreground)]">
                  {cfg?.label ?? link.platform}
                </p>
                {link.username && (
                  <p className="text-xs text-[var(--muted)]">@{link.username}</p>
                )}
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-[var(--muted)]">
                {fmt(link.follower_count)} followers
              </span>
              <a
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs font-medium text-[var(--primary)] hover:underline"
              >
                Visit <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Competitors Tab ────────────────────────────────────────────────────

function CompetitorsContent({
  competitors,
}: {
  competitors: {
    id: string;
    relationship_type: string;
    notes: string | null;
    competitor_lead?: { id: string; merchant_name: string; follower_count: number; tier: string } | null;
    competitor_tenant?: { id: string; business_name: string; slug: string } | null;
  }[];
}) {
  const relationshipColors: Record<string, { bg: string; text: string }> = {
    direct: { bg: "rgba(239,68,68,0.15)", text: "#EF4444" },
    indirect: { bg: "rgba(245,158,11,0.15)", text: "#F59E0B" },
    substitute: { bg: "rgba(96,165,250,0.15)", text: "#60A5FA" },
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-bold text-[var(--foreground)]">
          Competitors ({competitors.length})
        </h3>
        <button className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold border border-[var(--card-border)] text-[var(--foreground)] hover:bg-white/5 transition-all">
          <Building2 className="w-3.5 h-3.5" />
          Link Competitor
        </button>
      </div>

      {competitors.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-[var(--muted)]">
          <Building2 className="w-10 h-10 mb-3" />
          <p className="text-sm font-semibold">No competitors linked</p>
        </div>
      ) : (
        <div className="space-y-3">
          {competitors.map((comp) => {
            const name =
              comp.competitor_lead?.merchant_name ??
              comp.competitor_tenant?.business_name ??
              "Unknown";
            const relColors = relationshipColors[comp.relationship_type] ?? {
              bg: "rgba(107,114,128,0.15)",
              text: "#6B7280",
            };

            return (
              <div
                key={comp.id}
                className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-4 flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-zinc-600 to-zinc-800 flex items-center justify-center text-white font-bold text-sm">
                    {name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-[var(--foreground)]">{name}</p>
                    {comp.notes && (
                      <p className="text-xs text-[var(--muted)] mt-0.5 line-clamp-1">
                        {comp.notes}
                      </p>
                    )}
                  </div>
                </div>
                <span
                  className="px-2.5 py-1 rounded-full text-[10px] font-bold capitalize"
                  style={{ backgroundColor: relColors.bg, color: relColors.text }}
                >
                  {comp.relationship_type}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Store Tab ──────────────────────────────────────────────────────────

function StoreContent({ lead }: { lead: Lead }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!lead.prospect_tenant_id) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-[var(--muted)]">
        <Store className="w-10 h-10 mb-3" />
        <p className="text-lg font-bold text-[var(--foreground)] mb-2">No store built yet</p>
        <p className="text-sm text-[var(--muted)] mb-6 max-w-sm text-center">
          Build a prospect store to showcase what their online presence could look like.
        </p>
        <button className="flex items-center gap-2 px-6 py-3 rounded-xl bg-[#A78BFA] text-white text-sm font-bold hover:brightness-110 transition-all shadow-sm">
          <Store className="w-4 h-4" />
          Build Store
        </button>
      </div>
    );
  }

  const storeUrl = `/merchants/${lead.prospect_tenant_id}`;

  return (
    <div className="space-y-4">
      {/* Store Info Card */}
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-5">
        <h3 className="text-sm font-bold text-[var(--foreground)] mb-4 flex items-center gap-2">
          <Store className="w-4 h-4 text-[var(--muted)]" />
          Store Details
        </h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-[var(--muted)]">Tenant ID</span>
            <span className="text-sm font-mono font-medium text-[var(--foreground)]">
              {lead.prospect_tenant_id}
            </span>
          </div>
          {lead.store_built_at && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-[var(--muted)]">Built At</span>
              <span className="text-sm font-medium text-[var(--foreground)]">
                {new Date(lead.store_built_at).toLocaleDateString()} ({relativeTime(lead.store_built_at)})
              </span>
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-xs text-[var(--muted)]">Merchant Page</span>
            <Link
              href={storeUrl}
              className="flex items-center gap-1 text-sm font-medium text-[var(--primary)] hover:underline"
            >
              View Merchant <ExternalLink className="w-3 h-3" />
            </Link>
          </div>
        </div>
      </div>

      {/* Store Preview Card */}
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-[var(--foreground)]">Store Preview</h3>
          <button
            onClick={() => handleCopy(`${window.location.origin}${storeUrl}`)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all",
              copied
                ? "border-emerald-500/30 text-emerald-400 bg-emerald-500/10"
                : "border-[var(--card-border)] text-[var(--muted)] hover:text-[var(--foreground)]"
            )}
          >
            <Copy className="w-3.5 h-3.5" />
            {copied ? "Copied!" : "Copy Link"}
          </button>
        </div>
        <div className="rounded-xl border border-[var(--card-border)] bg-black/5 dark:bg-white/5 p-8 flex flex-col items-center justify-center text-center">
          <Store className="w-8 h-8 text-[var(--muted)] mb-2" />
          <p className="text-sm font-medium text-[var(--foreground)]">{lead.merchant_name}</p>
          <p className="text-xs text-[var(--muted)] mt-1">Prospect Store</p>
        </div>
      </div>
    </div>
  );
}
