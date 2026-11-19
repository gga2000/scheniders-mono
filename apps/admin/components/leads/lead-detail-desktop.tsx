"use client";

import { PlatformChip } from "@/components/leads/lead-chips";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { useLeadDetail } from "@/hooks/use-lead-detail";
import { loadFailureKind } from "@/lib/load-failure";
import { LoadFailedLine } from "@/components/shared/load-failed-line";
import { LEAD_GONE } from "@/lib/lead-update";
import {
  LEAD_STATUS_CONFIG,
  LEAD_STATUS_UI,
  LEAD_PRIORITY_CONFIG,
  LEAD_TIER_CONFIG,
  LEAD_TIER_UI,
} from "@/types/leads";
import {
  ArrowLeft,
  Phone,
  MessageCircle,
  Edit3,
  MoreVertical,
  Loader2,
  Calendar,
  TrendingUp,
  Users,
  Target,
  Store,
  AlertTriangle,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { LeadActivityTimeline } from "@/components/leads/lead-activity-timeline";
import { LeadFollowUpList } from "@/components/leads/lead-follow-up-list";
import { LeadBuildStoreDialog } from "@/components/leads/lead-build-store-dialog";
import { LeadConvertDialog } from "@/components/leads/lead-convert-dialog";
import { LeadForm } from "@/components/leads/lead-form";
import { leadToFormData, listsAsOpened } from "@/components/leads/lead-form-data";
import { useUpdateLead } from "@/hooks/use-lead-mutations";
import {
  OverviewContent,
  SocialContent,
  CompetitorsContent,
  StoreContent,
  daysBetween,
  SCORE_KEYS,
} from "@/components/leads/lead-detail-tabs";
import { formatCount, formatDay, formatIQD } from "@/lib/format";
import { leadPhone, toIntlIraqi } from "@/components/leads/lead-phone";
import { toast } from "sonner";

// ── Tabs ───────────────────────────────────────────────────────────────

const tabs = ["Overview", "Activity", "Follow-ups", "Social", "Competitors", "Store"] as const;
type Tab = (typeof tabs)[number];

// ── Component ──────────────────────────────────────────────────────────

export function LeadDetailDesktop() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, isError, error, refetch, isFetching } = useLeadDetail(id);
  const [activeTab, setActiveTab] = useState<Tab>("Overview");
  // "Add Note" in the ⋮ menu: opens Activity with its note box focused.
  const [noteRequest, setNoteRequest] = useState(0);
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
  // A lead that does not exist (404) falls through to "not found" below. A
  // failed read again (after a save, or a colleague's clash) keeps the lead
  // and any open form on screen, with a line that says so.
  if (isError && !data && loadFailureKind(error) !== "missing") {
    return (
      <div className="p-4 md:p-6 space-y-4">
        <Link
          href="/leads"
          className="inline-flex items-center gap-1.5 text-sm text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Leads
        </Link>
        <div className="flex flex-col items-center justify-center py-20 text-[var(--ink-red)]">
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
  const statusUi = LEAD_STATUS_UI[lead.status];
  const priorityCfg = LEAD_PRIORITY_CONFIG[lead.priority];
  const tierCfg = LEAD_TIER_CONFIG[lead.tier];

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
      {isError && (
        <LoadFailedLine
          what="this lead again"
          error={error}
          gone={LEAD_GONE}
          onRetry={() => void refetch()}
          retrying={isFetching}
        />
      )}

      {/* ── Header Card ──────────────────────────────────────────── */}
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-5 md:p-6">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-5">
          {/* Left: Avatar + name */}
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-foreground/10 flex items-center justify-center text-foreground font-bold text-2xl shrink-0">
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
                <PlatformChip platform={lead.platform} />
              </div>
            </div>
          </div>

          {/* Right: Badges + actions */}
          <div className="flex flex-col items-start lg:items-end gap-3">
            {/* Badge row */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Tier */}
              <span
                className="px-2.5 py-1 rounded-lg text-xs font-bold"
                style={{ backgroundColor: LEAD_TIER_UI[lead.tier].soft, color: LEAD_TIER_UI[lead.tier].solid }}
              >
                {tierCfg.label}
              </span>

              {/* Priority */}
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-white/5 text-[var(--foreground)]">
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: priorityCfg.color }}
                />
                {priorityCfg.label}
              </span>

              {/* Status */}
              <span
                className="px-3 py-1 rounded-full text-xs font-bold"
                style={{ backgroundColor: statusUi.soft, color: statusUi.solid }}
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
                <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-[var(--foreground)]">
                  {lead.lead_score}
                </span>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex flex-wrap items-center gap-2">
              {showBuildStore && (
                <button
                  onClick={() => setBuildStoreOpen(true)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-[var(--ink-violet)] text-[var(--card-bg)] hover:brightness-110 transition-all shadow-sm"
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
                  type="button"
                  aria-label="More actions"
                  aria-expanded={dropdownOpen}
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
                      {/* Each item does what it says, as the Leads list's quick actions do. */}
                      <button
                        onClick={() => {
                          setDropdownOpen(false);
                          const phone = leadPhone(lead);
                          if (phone) window.location.href = `tel:${phone}`;
                          else toast.info("No phone number on file");
                        }}
                        className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-[var(--foreground)] hover:bg-white/5 transition-colors"
                      >
                        <Phone className="w-4 h-4" />
                        Call
                      </button>
                      <button
                        onClick={() => {
                          setDropdownOpen(false);
                          const phone = leadPhone(lead);
                          const intl = phone && toIntlIraqi(phone);
                          if (intl) window.open(`https://wa.me/${intl}`, "_blank", "noopener,noreferrer");
                          else toast.info("No WhatsApp number on file");
                        }}
                        className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-[var(--foreground)] hover:bg-white/5 transition-colors"
                      >
                        <MessageCircle className="w-4 h-4" />
                        WhatsApp
                      </button>
                      <button
                        onClick={() => {
                          setDropdownOpen(false);
                          setActiveTab("Activity");
                          setNoteRequest((n) => n + 1);
                        }}
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
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-5 md:p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-[var(--muted)] mb-2">
              Their sales, estimated
            </p>
            <p className="text-3xl font-black text-[var(--foreground)]">
              ~{lead.estimated_daily_orders} orders/day
            </p>
            <p className="text-lg font-semibold text-[var(--muted)] mt-1">
              ~{formatCount(estMonthlyOrders)} orders/month
            </p>
            <p className="text-lg font-bold text-[var(--ink-green)] mt-1">
              ~{formatIQD(lead.estimated_monthly_revenue)} in sales a month
            </p>
          </div>
          <div className="bg-black/10 dark:bg-white/5 rounded-xl px-4 py-3 text-sm text-[var(--muted)]">
            <p className="font-semibold text-[var(--foreground)] mb-1">Calculation</p>
            {lead.avg_order_count > 0 ? (
              <p>Manual override &middot; {formatCount(lead.avg_order_count)} orders/day</p>
            ) : (
              <p>{formatCount(lead.avg_view_count)} avg views &divide; 10,000</p>
            )}
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
            {formatCount(lead.follower_count)}
          </p>
          <span
            className="text-xs font-bold px-1.5 py-0.5 rounded mt-1 inline-block"
            style={{ backgroundColor: LEAD_TIER_UI[lead.tier].soft, color: LEAD_TIER_UI[lead.tier].solid }}
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
          <span className="text-xs text-[var(--muted)] mt-1 inline-block">
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
          <span className="text-xs text-[var(--muted)] mt-1 inline-block">
            Since {formatDay(lead.created_at)}
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
            onClick={() => {
              setActiveTab(tab);
              setNoteRequest(0);
            }}
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
            <LeadActivityTimeline activities={activities} leadId={lead.id} noteRequest={noteRequest} />
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
          {activeTab === "Store" && (
            <StoreContent lead={lead} onBuildStore={showBuildStore ? () => setBuildStoreOpen(true) : undefined} />
          )}
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
        onSubmit={(_, changes, opened) =>
          // Only the fields this person changed: a colleague's edit since the form opened stays.
          // A list is sent whole, so it goes with the copy it was changed from.
          Object.keys(changes).length === 0
            ? "unchanged"
            : updateLead.mutateAsync({ id: lead.id, data: changes, was: listsAsOpened(opened, changes) }).then(() => true)
        }
        initialData={leadToFormData(lead)}
      />
    </div>
  );
}
