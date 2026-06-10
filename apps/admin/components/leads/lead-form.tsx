"use client";

import { useEffect } from "react";
import { cn, formatIQD } from "@/lib/utils";
import type {
  LeadFormData,
  LeadSourcePlatform,
  LeadPriority,
} from "@/types/leads";
import { PLATFORM_CONFIG, LEAD_PRIORITY_CONFIG } from "@/types/leads";
import {
  X,
  Plus,
  Trash2,
  TrendingUp,
  Search,
  Loader2,
  Sparkles,
  UserPlus,
  Building2,
  Phone,
  BarChart3,
  MapPin,
  Flag,
  ChevronDown,
  RotateCcw,
  Check,
  AlertCircle,
  MessageCircle,
  Instagram,
  Facebook,
  Youtube,
  Twitter,
  Linkedin,
  Globe,
  Music2,
  Ghost,
  MoreHorizontal,
  type LucideIcon,
} from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import { normalizeIraqiPhone } from "./lead-phone";
import {
  useLeadFormController,
  ANALYZABLE_PLATFORMS,
} from "./use-lead-form-controller";

interface LeadFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Persist the lead. Resolve `true` on success, `false` on failure. */
  onSubmit: (data: LeadFormData) => Promise<boolean> | boolean | void;
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

const FIELD =
  "w-full h-10 px-3.5 rounded-xl bg-[var(--card-bg)] border border-[var(--card-border)] text-sm text-[var(--foreground)] placeholder:text-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20 focus:border-[var(--primary)]/40 transition-shadow";
const LABEL = "block text-[11px] font-medium text-[var(--muted)] mb-1.5";

/** A grouped section card with an icon + title header bar. */
function Section({
  icon: Icon,
  title,
  badge,
  children,
}: {
  icon: LucideIcon;
  title: string;
  badge?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-[var(--card-border)] overflow-hidden bg-[var(--card-bg)]/30">
      <header className="flex items-center gap-2 px-4 py-2.5 border-b border-[var(--card-border)] bg-[var(--card-bg)]/60">
        <Icon className="w-3.5 h-3.5 text-[var(--muted)]" />
        <span className="text-[11px] font-bold text-[var(--foreground)] uppercase tracking-wider">
          {title}
        </span>
        {badge}
      </header>
      <div className="p-4 space-y-3.5">{children}</div>
    </section>
  );
}

/** A compact pill toggle for header-level booleans (e.g. "Online shop only"). */
function PillToggle({
  active,
  onClick,
  icon: Icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: LucideIcon;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "ml-auto flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-semibold transition-all",
        active
          ? "border-[#A78BFA]/50 bg-[#A78BFA]/10 text-[#A78BFA]"
          : "border-[var(--card-border)] text-[var(--muted)] hover:text-[var(--foreground)] hover:border-[var(--muted)]/40",
      )}
    >
      <Icon className="w-3 h-3" />
      {children}
    </button>
  );
}

export function LeadForm({ open, onOpenChange, onSubmit, initialData }: LeadFormProps) {
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
    viewsBasedDailyOrders,
    isOrdersOverride,
    estimatedDailyOrders,
    estimatedMonthlyRevenue,
    hasPrediction,
    update,
    resetForm,
    handleAnalyze,
    addPhone,
    removePhone,
    updatePhone,
    addBranch,
    removeBranch,
    updateBranch,
    addBranchPhone,
    removeBranchPhone,
    updateBranchPhone,
    submit,
    setErrors,
  } = useLeadFormController({ open, onSubmit, initialData, onClose: () => onOpenChange(false) });

  const handleOpenChange = (v: boolean) => {
    if (!v && submitting) return;
    onOpenChange(v);
  };

  // Cmd/Ctrl + Enter to submit
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        submit(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, form, submitting]);

  const PlatformIcon = PLATFORM_ICONS[form.platform];

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm lead-overlay-in" />
        <Dialog.Content
          aria-describedby={undefined}
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            setTimeout(() => nameRef.current?.focus(), 80);
          }}
          className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 flex max-h-[92vh] w-[calc(100vw-2rem)] max-w-2xl flex-col overflow-hidden rounded-2xl border border-[var(--card-border)] bg-[var(--background)] shadow-2xl lead-modal-in"
        >
          {/* Header */}
          <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-[var(--card-border)]">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#FF8899]/20 to-[#A78BFA]/20 flex items-center justify-center">
                <UserPlus className="w-5 h-5 text-[#FF8899]" />
              </div>
              <div>
                <Dialog.Title className="text-lg font-bold text-[var(--foreground)] leading-tight">
                  {isEdit ? "Edit Lead" : "Add New Lead"}
                </Dialog.Title>
                <p className="text-xs text-[var(--muted)] mt-0.5">
                  {isEdit ? "Update this prospect's details" : "Capture a prospect for your pipeline"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              {!isEdit && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--card-bg)] transition-colors"
                  title="Clear all fields"
                >
                  <RotateCcw className="w-3 h-3" />
                  Clear
                </button>
              )}
              <button
                type="button"
                onClick={() => handleOpenChange(false)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--card-bg)] transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Scrollable body */}
          <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
            {/* Business Information */}
            <Section icon={Building2} title="Business">
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
                      {(Object.entries(PLATFORM_CONFIG) as [LeadSourcePlatform, (typeof PLATFORM_CONFIG)["instagram"]][]).map(
                        ([key, config]) => (
                          <option key={key} value={key}>
                            {config.label}
                          </option>
                        ),
                      )}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted)] pointer-events-none" />
                  </div>
                </div>
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
              </div>

              <div className="grid grid-cols-2 gap-3">
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
                <div>
                  <label className={LABEL}>Platform URL</label>
                  <input
                    type="url"
                    dir="ltr"
                    value={form.platform_url}
                    onChange={(e) => update("platform_url", e.target.value)}
                    className={FIELD}
                    placeholder="https://…"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={LABEL}>Follower Count</label>
                  <input
                    type="number"
                    min={0}
                    value={form.follower_count || ""}
                    onChange={(e) => update("follower_count", Number(e.target.value) || 0)}
                    className={cn(FIELD, "font-mono")}
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className={LABEL}>Posts</label>
                  <input
                    type="number"
                    min={0}
                    value={form.post_count || ""}
                    onChange={(e) => update("post_count", Number(e.target.value) || 0)}
                    className={cn(FIELD, "font-mono")}
                    placeholder="0"
                  />
                </div>
              </div>

              {/* Auto-fill strip */}
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
                        "flex items-center gap-2 px-4 h-10 rounded-xl text-sm font-bold transition-all whitespace-nowrap text-white",
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
            </Section>

            {/* Contact Information */}
            <Section
              icon={Phone}
              title="Contact"
              badge={
                <PillToggle
                  active={form.contact_via_dm}
                  icon={MessageCircle}
                  onClick={() => {
                    const next = !form.contact_via_dm;
                    update("contact_via_dm", next);
                    if (next)
                      setErrors((p) => {
                        const cleared = { ...p };
                        delete cleared.page_phone;
                        for (const k of Object.keys(cleared))
                          if (k.startsWith("phone_")) delete cleared[k];
                        return cleared;
                      });
                  }}
                >
                  DMs only
                </PillToggle>
              }
            >
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={LABEL}>Management Name</label>
                  <input
                    type="text"
                    value={form.management_name}
                    onChange={(e) => update("management_name", e.target.value)}
                    className={FIELD}
                    placeholder="Owner / Manager"
                  />
                </div>
                <div>
                  <label className={LABEL}>Page Phone</label>
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
                        onBlur={() =>
                          form.page_phone && update("page_phone", normalizeIraqiPhone(form.page_phone))
                        }
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
              </div>

              {/* Additional phone numbers — hidden for DM-only pages */}
              {!form.contact_via_dm && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[11px] font-medium text-[var(--muted)]">
                    Additional Numbers
                  </label>
                  {form.phone_numbers.length < 3 && (
                    <button
                      type="button"
                      onClick={addPhone}
                      className="flex items-center gap-1 text-[11px] font-medium text-[#A78BFA] hover:underline"
                    >
                      <Plus className="w-3 h-3" /> Add
                    </button>
                  )}
                </div>
                <div className="space-y-2">
                  {form.phone_numbers.map((phone, idx) => (
                    <div key={idx} className="flex items-start gap-2">
                      <input
                        type="text"
                        value={phone.title}
                        onChange={(e) => updatePhone(idx, "title", e.target.value)}
                        className={cn(FIELD, "w-1/3 h-9")}
                        placeholder="Label"
                      />
                      <div className="flex-1">
                        <input
                          type="tel"
                          inputMode="tel"
                          dir="ltr"
                          value={phone.number}
                          onChange={(e) => updatePhone(idx, "number", e.target.value)}
                          onBlur={() =>
                            phone.number && updatePhone(idx, "number", normalizeIraqiPhone(phone.number))
                          }
                          className={cn(
                            FIELD,
                            "h-9 font-mono",
                            errors[`phone_${idx}`] && "field-error animate-shake",
                          )}
                          data-error={!!errors[`phone_${idx}`]}
                          placeholder="07XXXXXXXXX"
                        />
                        {errors[`phone_${idx}`] && (
                          <p className="field-error-text">
                            <AlertCircle className="w-3 h-3" /> {errors[`phone_${idx}`]}
                          </p>
                        )}
                      </div>
                      {form.phone_numbers.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removePhone(idx)}
                          className="w-9 h-9 shrink-0 rounded-lg flex items-center justify-center text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              )}

              <div className="grid grid-cols-2 gap-3">
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
              </div>

              <div>
                <label className={LABEL}>Notes</label>
                <textarea
                  value={form.management_info}
                  onChange={(e) => update("management_info", e.target.value)}
                  className={cn(FIELD, "h-auto py-2.5 resize-none")}
                  rows={2}
                  placeholder="Additional management details…"
                />
              </div>
            </Section>

            {/* Audience & Prediction */}
            <Section
              icon={BarChart3}
              title="Audience"
              badge={
                hasPrediction ? (
                  <span className="ml-auto flex items-center gap-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                    <TrendingUp className="w-3 h-3" />~{estimatedDailyOrders}/day
                  </span>
                ) : undefined
              }
            >
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
                      className={cn(
                        FIELD,
                        "font-mono",
                        key === "avg_order_count" && isOrdersOverride && "border-emerald-400/60",
                      )}
                      placeholder="0"
                    />
                    {key === "avg_order_count" && (
                      <p className="mt-1 text-[10px] text-[var(--muted)]">
                        Overrides the views-based forecast
                      </p>
                    )}
                  </div>
                ))}
              </div>

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
                      [`${(estimatedMonthlyRevenue / 1000).toFixed(0)}K`, "IQD/month"],
                    ].map(([value, label]) => (
                      <div key={label}>
                        <div className="text-xl font-black text-emerald-700 dark:text-emerald-300 tabular-nums">
                          {value}
                        </div>
                        <div className="text-[10px] text-emerald-600/70 dark:text-emerald-400/70">
                          {label}
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="mt-2.5 text-[10px] text-emerald-700/70 dark:text-emerald-300/70">
                    {isOrdersOverride
                      ? `Manual override · views forecast ~${viewsBasedDailyOrders.toLocaleString()}/day`
                      : "Based on avg views ÷ 10,000 (1% interested × 1% buy)"}
                  </p>
                </div>
              )}
            </Section>

            {/* Location & Assignment */}
            <Section
              icon={MapPin}
              title="Location & Priority"
              badge={
                <PillToggle
                  active={form.is_online_only}
                  icon={Globe}
                  onClick={() => update("is_online_only", !form.is_online_only)}
                >
                  Online shop only
                </PillToggle>
              }
            >
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={LABEL}>City</label>
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
                <div>
                  <label className={LABEL}>Source Medium</label>
                  <input
                    type="text"
                    value={form.source_medium}
                    onChange={(e) => update("source_medium", e.target.value)}
                    className={FIELD}
                    placeholder="e.g. social, direct"
                  />
                </div>
              </div>

              {!form.is_online_only && (
                <div>
                  <label className={LABEL}>Address</label>
                  <textarea
                    value={form.address}
                    onChange={(e) => update("address", e.target.value)}
                    className={cn(FIELD, "h-auto py-2.5 resize-none")}
                    rows={2}
                    placeholder="Full address (optional)"
                  />
                </div>
              )}

              {/* Branches — additional physical locations, each with its own phone(s) */}
              {!form.is_online_only && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="flex items-center gap-1.5 text-[11px] font-medium text-[var(--muted)]">
                      <Building2 className="w-3 h-3" /> Branches
                    </label>
                    <button
                      type="button"
                      onClick={addBranch}
                      className="flex items-center gap-1 text-[11px] font-medium text-[#A78BFA] hover:underline"
                    >
                      <Plus className="w-3 h-3" /> Add branch
                    </button>
                  </div>

                  {form.branches.length === 0 ? (
                    <p className="text-[11px] text-[var(--muted)] italic">
                      Single location — the fields above are the main branch. Add more for
                      multi-branch stores.
                    </p>
                  ) : (
                    <div className="space-y-2.5">
                      {form.branches.map((branch, bi) => (
                        <div
                          key={bi}
                          className="rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)]/40 p-3 space-y-2.5"
                        >
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={branch.name}
                              onChange={(e) => updateBranch(bi, "name", e.target.value)}
                              className={cn(FIELD, "h-9 flex-1")}
                              placeholder="Branch name (e.g. Mansour)"
                            />
                            <button
                              type="button"
                              onClick={() => removeBranch(bi)}
                              className="w-9 h-9 shrink-0 rounded-lg flex items-center justify-center text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                              title="Remove branch"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>

                          <div className="grid grid-cols-2 gap-2">
                            <input
                              type="text"
                              value={branch.city}
                              onChange={(e) => updateBranch(bi, "city", e.target.value)}
                              className={cn(FIELD, "h-9")}
                              placeholder="City"
                            />
                            <input
                              type="text"
                              value={branch.address}
                              onChange={(e) => updateBranch(bi, "address", e.target.value)}
                              className={cn(FIELD, "h-9")}
                              placeholder="Address (optional)"
                            />
                          </div>

                          <div className="space-y-1.5">
                            {branch.phones.map((phone, pi) => {
                              const errKey = `branch_${bi}_phone_${pi}`;
                              return (
                                <div key={pi} className="flex items-start gap-2">
                                  <input
                                    type="text"
                                    value={phone.title}
                                    onChange={(e) => updateBranchPhone(bi, pi, "title", e.target.value)}
                                    className={cn(FIELD, "h-9 w-1/3")}
                                    placeholder="Label"
                                  />
                                  <div className="flex-1">
                                    <input
                                      type="tel"
                                      inputMode="tel"
                                      dir="ltr"
                                      value={phone.number}
                                      onChange={(e) => updateBranchPhone(bi, pi, "number", e.target.value)}
                                      onBlur={() =>
                                        phone.number &&
                                        updateBranchPhone(bi, pi, "number", normalizeIraqiPhone(phone.number))
                                      }
                                      className={cn(
                                        FIELD,
                                        "h-9 font-mono",
                                        errors[errKey] && "field-error animate-shake",
                                      )}
                                      data-error={!!errors[errKey]}
                                      placeholder="07XXXXXXXXX"
                                    />
                                    {errors[errKey] && (
                                      <p className="field-error-text">
                                        <AlertCircle className="w-3 h-3" /> {errors[errKey]}
                                      </p>
                                    )}
                                  </div>
                                  {branch.phones.length > 1 && (
                                    <button
                                      type="button"
                                      onClick={() => removeBranchPhone(bi, pi)}
                                      className="w-9 h-9 shrink-0 rounded-lg flex items-center justify-center text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  )}
                                </div>
                              );
                            })}
                            {branch.phones.length < 3 && (
                              <button
                                type="button"
                                onClick={() => addBranchPhone(bi)}
                                className="flex items-center gap-1 text-[11px] font-medium text-[#A78BFA] hover:underline"
                              >
                                <Plus className="w-3 h-3" /> Add number
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div>
                <label className="flex items-center gap-1.5 text-[11px] font-medium text-[var(--muted)] mb-2">
                  <Flag className="w-3 h-3" /> Priority
                </label>
                <div className="flex items-center gap-2">
                  {(Object.entries(LEAD_PRIORITY_CONFIG) as [LeadPriority, (typeof LEAD_PRIORITY_CONFIG)["low"]][]).map(
                    ([key, cfg]) => {
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
                    },
                  )}
                </div>
              </div>
            </Section>
          </div>

          {/* Sticky Footer */}
          <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-t border-[var(--card-border)] bg-[var(--card-bg)]/50">
            <button
              type="button"
              onClick={() => handleOpenChange(false)}
              disabled={submitting}
              className="text-sm font-medium text-[var(--muted)] hover:text-[var(--foreground)] transition-colors disabled:opacity-50"
            >
              Cancel
            </button>

            {/* Live prediction chip */}
            {hasPrediction ? (
              <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-100 dark:border-emerald-500/20">
                <TrendingUp className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300 tabular-nums">
                  ~{estimatedDailyOrders}/day · {formatIQD(estimatedMonthlyRevenue)}/mo
                </span>
              </div>
            ) : (
              <span className="hidden sm:block text-[11px] text-[var(--muted)]">
                Add audience metrics to forecast orders
              </span>
            )}

            <div className="flex items-center gap-2">
              {!isEdit && (
                <button
                  type="button"
                  onClick={() => submit(true)}
                  disabled={submitting}
                  className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-semibold text-[var(--foreground)] bg-[var(--card-bg)] border border-[var(--card-border)] hover:brightness-105 transition-all disabled:opacity-50"
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
                  "flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white transition-all shadow-sm",
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
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
