"use client";

import { useState } from "react";
import { cn, formatIQD } from "@/lib/utils";
import type { LeadFormData, LeadSourcePlatform, LeadPriority } from "@/types/leads";
import { PLATFORM_CONFIG, LEAD_PRIORITY_CONFIG } from "@/types/leads";
import {
  Sparkles,
  Loader2,
  Search,
  AlertCircle,
  Check,
  MessageCircle,
  ChevronDown,
  ChevronUp,
  TrendingUp,
  Globe,
  Flag,
  Plus,
  UserPlus,
  Instagram,
  Facebook,
  Youtube,
  Twitter,
  Linkedin,
  Music2,
  Ghost,
  Phone,
  MoreHorizontal,
  type LucideIcon,
} from "lucide-react";
import { BottomSheet } from "./bottom-sheet";
import {
  useLeadFormController,
  ANALYZABLE_PLATFORMS,
} from "../use-lead-form-controller";

interface LeadRegisterSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: LeadFormData) => Promise<boolean>;
  initialData?: Partial<LeadFormData>;
}

const PLATFORM_ICONS: Record<LeadSourcePlatform, LucideIcon> = {
  instagram: Instagram,
  facebook: Facebook,
  tiktok: Music2,
  snapchat: Ghost,
  youtube: Youtube,
  twitter: Twitter,
  linkedin: Linkedin,
  website: Globe,
  referral: UserPlus,
  cold_call: Phone,
  other: MoreHorizontal,
};

// Touch-first: h-11 instead of h-10
const FIELD =
  "w-full h-11 px-3.5 rounded-xl bg-[var(--card-bg)] border border-[var(--card-border)] text-sm text-[var(--foreground)] placeholder:text-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20 focus:border-[var(--primary)]/40 transition-shadow";
const LABEL = "block text-[11px] font-medium text-[var(--muted)] mb-1.5";

export function LeadRegisterSheet({
  open,
  onOpenChange,
  onSubmit,
  initialData,
}: LeadRegisterSheetProps) {
  const [moreOpen, setMoreOpen] = useState(false);

  const {
    form,
    errors,
    submitting,
    isEdit,
    industries,
    nameRef,
    analyzeHandle,
    setAnalyzeHandle,
    isAnalyzing,
    analyzeError,
    setAnalyzeError,
    analyzeSuccess,
    setAnalyzeSuccess,
    estimatedDailyOrders,
    estimatedMonthlyRevenue,
    hasPrediction,
    update,
    handleAnalyze,
    submit,
  } = useLeadFormController({
    open,
    onSubmit,
    initialData,
    onClose: () => onOpenChange(false),
  });

  const PlatformIcon = PLATFORM_ICONS[form.platform];

  const footer = (
    <div className="flex items-center gap-2">
      {!isEdit && (
        <button
          type="button"
          onClick={() => submit(true)}
          disabled={submitting}
          className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-semibold text-[var(--foreground)] bg-[var(--card-bg)] border border-[var(--card-border)] hover:brightness-105 transition-all disabled:opacity-50 shrink-0"
        >
          <Plus className="w-3.5 h-3.5" />
          Save &amp; New
        </button>
      )}
      <button
        type="button"
        onClick={() => submit(false)}
        disabled={submitting}
        className={cn(
          "flex flex-1 items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white transition-all shadow-sm",
          "bg-gradient-to-r from-[#FF8899] to-[#A78BFA] hover:brightness-105",
          submitting && "opacity-70 cursor-not-allowed",
        )}
      >
        {submitting ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <UserPlus className="w-4 h-4" />
        )}
        {submitting ? "Saving…" : isEdit ? "Save Changes" : "Add Lead"}
      </button>
    </div>
  );

  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      fullHeight
      title={isEdit ? "Edit Lead" : "Add Lead"}
      footer={footer}
    >
      <div className="space-y-4 pt-1">
        {/* 1. Analyze hero — Instagram only */}
        {ANALYZABLE_PLATFORMS.has(form.platform) && (
          <div className="rounded-xl border border-dashed border-[#A78BFA]/40 bg-[#A78BFA]/[0.05] p-3 space-y-2.5">
            <div className="flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 text-[#A78BFA]" />
              <span className="text-[11px] font-bold text-[#A78BFA] uppercase tracking-wider">
                Auto-fill from {PLATFORM_CONFIG[form.platform].label}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={analyzeHandle}
                onChange={(e) => {
                  setAnalyzeHandle(e.target.value);
                  setAnalyzeError(null);
                  setAnalyzeSuccess(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAnalyze();
                  }
                }}
                className={cn(FIELD, "flex-1")}
                placeholder="@username or profile URL"
                disabled={isAnalyzing}
              />
              <button
                type="button"
                onClick={handleAnalyze}
                disabled={isAnalyzing || !analyzeHandle.trim()}
                className={cn(
                  "flex items-center gap-2 px-4 h-11 rounded-xl text-sm font-bold transition-all whitespace-nowrap text-white",
                  "bg-gradient-to-r from-[#FF8899] to-[#A78BFA] hover:brightness-105",
                  (isAnalyzing || !analyzeHandle.trim()) && "opacity-50 cursor-not-allowed",
                )}
              >
                {isAnalyzing ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Search className="w-4 h-4" />
                )}
                {isAnalyzing ? "Analyzing…" : "Analyze"}
              </button>
            </div>
            {analyzeError && (
              <p className="text-[11px] text-red-500 font-medium flex items-center gap-1">
                <AlertCircle className="w-3 h-3" /> {analyzeError}
              </p>
            )}
            {analyzeSuccess && (
              <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
                <Check className="w-3 h-3" /> Profile loaded — fields below were auto-filled.
              </p>
            )}
          </div>
        )}

        {/* 2. Merchant name */}
        <div>
          <label className={LABEL}>
            Merchant Name <span className="text-red-500">*</span>
          </label>
          <input
            ref={nameRef}
            type="text"
            value={form.merchant_name}
            onChange={(e) => update("merchant_name", e.target.value)}
            className={cn(FIELD, errors.merchant_name && "field-error animate-shake")}
            data-error={!!errors.merchant_name}
            placeholder="e.g. عالم القلعة"
          />
          {errors.merchant_name && (
            <p className="field-error-text">
              <AlertCircle className="w-3 h-3" /> {errors.merchant_name}
            </p>
          )}
        </div>

        {/* 3. Platform + Followers */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={LABEL}>Platform</label>
            <div className="relative">
              <span
                className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                style={{ color: PLATFORM_CONFIG[form.platform].color }}
              >
                <PlatformIcon className="w-4 h-4" />
              </span>
              <select
                value={form.platform}
                onChange={(e) => update("platform", e.target.value as LeadSourcePlatform)}
                className={cn(FIELD, "appearance-none pl-9 pr-9 cursor-pointer")}
              >
                {(
                  Object.entries(PLATFORM_CONFIG) as [
                    LeadSourcePlatform,
                    (typeof PLATFORM_CONFIG)["instagram"],
                  ][]
                ).map(([key, config]) => (
                  <option key={key} value={key}>
                    {config.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted)] pointer-events-none" />
            </div>
          </div>
          <div>
            <label className={LABEL}>Followers</label>
            <input
              type="number"
              min={0}
              value={form.follower_count || ""}
              onChange={(e) => update("follower_count", Number(e.target.value) || 0)}
              className={cn(FIELD, "font-mono")}
              placeholder="0"
            />
          </div>
        </div>

        {/* 4. Phone with DMs only pill */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className={cn(LABEL, "mb-0")}>Phone</label>
            <button
              type="button"
              onClick={() => update("contact_via_dm", !form.contact_via_dm)}
              aria-pressed={form.contact_via_dm}
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-semibold transition-all",
                form.contact_via_dm
                  ? "border-[#A78BFA]/50 bg-[#A78BFA]/10 text-[#A78BFA]"
                  : "border-[var(--card-border)] text-[var(--muted)] hover:text-[var(--foreground)] hover:border-[var(--muted)]/40",
              )}
            >
              <MessageCircle className="w-3 h-3" />
              DMs only
            </button>
          </div>
          {form.contact_via_dm ? (
            <div
              className={cn(
                FIELD,
                "flex items-center gap-2 text-[var(--muted)] cursor-default select-none",
              )}
            >
              <MessageCircle className="w-4 h-4 text-[#A78BFA] shrink-0" />
              Direct messages only
            </div>
          ) : (
            <>
              <input
                type="tel"
                inputMode="tel"
                dir="ltr"
                value={form.page_phone}
                onChange={(e) => update("page_phone", e.target.value)}
                className={cn(FIELD, "font-mono", errors.page_phone && "field-error animate-shake")}
                data-error={!!errors.page_phone}
                placeholder="07XXXXXXXXX"
              />
              {errors.page_phone && (
                <p className="field-error-text">
                  <AlertCircle className="w-3 h-3" /> {errors.page_phone}
                </p>
              )}
            </>
          )}
        </div>

        {/* 5. Priority chips */}
        <div>
          <label className="flex items-center gap-1.5 text-[11px] font-medium text-[var(--muted)] mb-2">
            <Flag className="w-3 h-3" /> Priority
          </label>
          <div className="flex items-center gap-2 flex-wrap">
            {(
              Object.entries(LEAD_PRIORITY_CONFIG) as [
                LeadPriority,
                (typeof LEAD_PRIORITY_CONFIG)["low"],
              ][]
            ).map(([key, cfg]) => {
              const active = form.priority === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => update("priority", key)}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold transition-all",
                    !active &&
                      "border-[var(--card-border)] text-[var(--muted)] hover:text-[var(--foreground)] hover:border-[var(--muted)]/40",
                  )}
                  style={
                    active
                      ? {
                          borderColor: cfg.color,
                          backgroundColor: `${cfg.color}1A`,
                          color: cfg.color,
                        }
                      : undefined
                  }
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ backgroundColor: cfg.color }}
                  />
                  {cfg.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* 6. Collapsible "More details" */}
        <div>
          <button
            type="button"
            onClick={() => setMoreOpen((v) => !v)}
            className="flex items-center gap-2 text-xs font-semibold text-[var(--muted)] hover:text-[var(--foreground)] transition-colors w-full py-1"
          >
            {moreOpen ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
            More details
          </button>

          {moreOpen && (
            <div className="space-y-4 mt-3">
              {/* Industry */}
              <div>
                <label className={LABEL}>Industry</label>
                <div className="relative">
                  <select
                    value={form.industry_id ?? ""}
                    onChange={(e) => update("industry_id", e.target.value || null)}
                    className={cn(FIELD, "appearance-none pr-9 cursor-pointer")}
                  >
                    <option value="">Select industry</option>
                    {(industries ?? [])
                      .filter((i) => i.is_active)
                      .map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.name}
                        </option>
                      ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted)] pointer-events-none" />
                </div>
              </div>

              {/* Audience metrics 2-col */}
              <div>
                <label className={LABEL}>Audience Metrics</label>
                <div className="grid grid-cols-2 gap-3">
                  {(
                    [
                      ["avg_view_count", "Avg Views"],
                      ["avg_like_count", "Avg Likes"],
                      ["avg_comments_count", "Avg Comments"],
                      ["avg_order_count", "Avg Orders / Day"],
                    ] as const
                  ).map(([key, label]) => (
                    <div key={key}>
                      <label className={LABEL}>{label}</label>
                      <input
                        type="number"
                        min={0}
                        value={form[key] || ""}
                        onChange={(e) => update(key, Number(e.target.value) || 0)}
                        className={cn(FIELD, "font-mono")}
                        placeholder="0"
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Order Prediction card */}
              {hasPrediction && (
                <div className="rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 p-3.5">
                  <div className="flex items-center gap-2 mb-2.5">
                    <TrendingUp className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                    <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300 uppercase tracking-wider">
                      Order Prediction
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      [estimatedDailyOrders.toLocaleString(), "orders/day"],
                      [(estimatedDailyOrders * 30).toLocaleString(), "orders/month"],
                      [formatIQD(estimatedMonthlyRevenue), "per month"],
                    ].map(([value, label]) => (
                      <div key={label}>
                        <div className="text-xl font-black text-emerald-700 dark:text-emerald-300 tabular-nums break-all">
                          {value}
                        </div>
                        <div className="text-[10px] text-emerald-600/70 dark:text-emerald-400/70">
                          {label}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Handle / username */}
              <div>
                <label className={LABEL}>Handle</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[var(--muted)] pointer-events-none">
                    @
                  </span>
                  <input
                    type="text"
                    dir="ltr"
                    value={form.handle}
                    onChange={(e) => update("handle", e.target.value)}
                    className={cn(FIELD, "pl-7")}
                    placeholder="username"
                  />
                </div>
              </div>

              {/* Website */}
              <div>
                <label className={LABEL}>Website</label>
                <input
                  type="url"
                  dir="ltr"
                  value={form.website_url}
                  onChange={(e) => update("website_url", e.target.value)}
                  className={FIELD}
                  placeholder="https://yourshop.com"
                />
              </div>

              {/* Email */}
              <div>
                <label className={LABEL}>Email</label>
                <input
                  type="email"
                  inputMode="email"
                  dir="ltr"
                  value={form.email}
                  onChange={(e) => update("email", e.target.value)}
                  className={cn(FIELD, errors.email && "field-error animate-shake")}
                  data-error={!!errors.email}
                  placeholder="shop@example.com"
                />
                {errors.email && (
                  <p className="field-error-text">
                    <AlertCircle className="w-3 h-3" /> {errors.email}
                  </p>
                )}
              </div>

              {/* City with Online shop only pill */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className={cn(LABEL, "mb-0")}>City</label>
                  <button
                    type="button"
                    onClick={() => update("is_online_only", !form.is_online_only)}
                    aria-pressed={form.is_online_only}
                    className={cn(
                      "flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-semibold transition-all",
                      form.is_online_only
                        ? "border-[#A78BFA]/50 bg-[#A78BFA]/10 text-[#A78BFA]"
                        : "border-[var(--card-border)] text-[var(--muted)] hover:text-[var(--foreground)] hover:border-[var(--muted)]/40",
                    )}
                  >
                    <Globe className="w-3 h-3" />
                    Online shop only
                  </button>
                </div>
                {form.is_online_only ? (
                  <div
                    className={cn(
                      FIELD,
                      "flex items-center gap-2 text-[var(--muted)] cursor-default select-none",
                    )}
                  >
                    <Globe className="w-4 h-4 text-[#A78BFA] shrink-0" />
                    No physical location
                  </div>
                ) : (
                  <input
                    type="text"
                    value={form.city}
                    onChange={(e) => update("city", e.target.value)}
                    className={FIELD}
                    placeholder="e.g. Baghdad"
                  />
                )}
              </div>

              {/* Notes */}
              <div>
                <label className={LABEL}>Notes</label>
                <textarea
                  value={form.management_info}
                  onChange={(e) => update("management_info", e.target.value)}
                  className={cn(FIELD, "h-auto py-2.5 resize-none")}
                  rows={3}
                  placeholder="Additional management details…"
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </BottomSheet>
  );
}
