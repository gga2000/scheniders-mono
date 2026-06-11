"use client";

import { useEffect, useState } from "react";
import { cn, formatIQD } from "@/lib/utils";
import type { LeadFormData, LeadSourcePlatform } from "@/types/leads";
import { PLATFORM_CONFIG } from "@/types/leads";
import { IRAQ_GOVERNORATES } from "@scheniders/shared";
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
  Store,
  Phone,
  BarChart3,
  MapPin,
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
  Hash,
  Type,
  Link2,
  Mail,
  AtSign,
  List,
  Settings2,
  StickyNote,
  Tag,
  type LucideIcon,
} from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import { normalizeIraqiPhone } from "./lead-phone";
import { LeadIndustryManager } from "./lead-industry-manager";
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
  /**
   * If provided, an *accidental* dismissal (Escape / click-outside) with unsaved
   * content auto-saves the in-progress lead as a draft instead of discarding it.
   * The explicit Cancel/✕ buttons always discard.
   */
  onSaveDraft?: (data: LeadFormData) => void;
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

// ── Visual language ────────────────────────────────────────────────────────
// Each section owns an accent (header tint + border) so the four steps read as
// distinct zones. Field *types* are signalled by a colored leading icon, so an
// employee can tell a text box from a number box from a dropdown at a glance.

const ACCENTS = {
  indigo: {
    border: "border-indigo-200/70 dark:border-indigo-500/20",
    header: "bg-indigo-50/70 dark:bg-indigo-500/[0.07]",
    chip: "bg-indigo-500/12 text-indigo-500",
    title: "text-indigo-600 dark:text-indigo-300",
  },
  emerald: {
    border: "border-emerald-200/70 dark:border-emerald-500/20",
    header: "bg-emerald-50/70 dark:bg-emerald-500/[0.07]",
    chip: "bg-emerald-500/12 text-emerald-600",
    title: "text-emerald-700 dark:text-emerald-300",
  },
  violet: {
    border: "border-violet-200/70 dark:border-violet-500/20",
    header: "bg-violet-50/70 dark:bg-violet-500/[0.07]",
    chip: "bg-violet-500/12 text-violet-500",
    title: "text-violet-600 dark:text-violet-300",
  },
  amber: {
    border: "border-amber-200/70 dark:border-amber-500/20",
    header: "bg-amber-50/70 dark:bg-amber-500/[0.07]",
    chip: "bg-amber-500/14 text-amber-600",
    title: "text-amber-700 dark:text-amber-300",
  },
} as const;

type AccentKey = keyof typeof ACCENTS;

const BASE_INPUT =
  "w-full h-11 pr-3.5 rounded-xl bg-white dark:bg-[var(--card-bg)] border border-[var(--card-border)] text-sm text-[var(--foreground)] placeholder:text-[var(--muted)]/60 focus:outline-none focus:ring-4 focus:ring-[var(--primary)]/10 focus:border-[var(--primary)]/40 transition-all";

const BRANCH_INPUT =
  "w-full h-9 px-3 rounded-lg bg-white dark:bg-[var(--card-bg)] border border-[var(--card-border)] text-sm text-[var(--foreground)] placeholder:text-[var(--muted)]/60 focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/15 focus:border-[var(--primary)]/40 transition-all";

/** Per-type leading icon + tint, the visual cue for the field kind. */
const KIND_META: Record<string, { icon: LucideIcon; color: string }> = {
  text: { icon: Type, color: "text-slate-400" },
  number: { icon: Hash, color: "text-blue-500" },
  tel: { icon: Phone, color: "text-emerald-500" },
  url: { icon: Link2, color: "text-sky-500" },
  email: { icon: Mail, color: "text-amber-500" },
};

function FieldLabel({
  children,
  required,
}: {
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <label className="mb-1.5 block text-[11px] font-semibold text-[var(--muted)]">
      {children}
      {required && <span className="text-rose-500"> *</span>}
    </label>
  );
}

type Kind = "text" | "number" | "tel" | "url" | "email";

function InputField({
  label,
  kind = "text",
  value,
  onChange,
  onBlur,
  placeholder,
  required,
  error,
  hint,
  icon,
  iconColor,
  dir,
  inputRef,
  onHide,
}: {
  label?: React.ReactNode;
  kind?: Kind;
  value: string | number;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onBlur?: () => void;
  placeholder?: string;
  required?: boolean;
  error?: string;
  hint?: string;
  icon?: LucideIcon;
  iconColor?: string;
  dir?: "ltr" | "rtl";
  inputRef?: React.Ref<HTMLInputElement>;
  onHide?: () => void;
}) {
  const meta = KIND_META[kind];
  const Icon = icon ?? meta.icon;
  return (
    <div>
      {label !== undefined && <FieldLabel required={required}>{label}</FieldLabel>}
      <div className="relative">
        <span
          className={cn(
            "pointer-events-none absolute left-3 top-1/2 -translate-y-1/2",
            iconColor ?? meta.color,
          )}
        >
          <Icon className="h-4 w-4" />
        </span>
        <input
          ref={inputRef}
          type={kind === "number" ? "number" : kind}
          inputMode={
            kind === "number" ? "numeric" : kind === "tel" ? "tel" : kind === "email" ? "email" : undefined
          }
          min={kind === "number" ? 0 : undefined}
          dir={dir}
          value={value}
          onChange={onChange}
          onBlur={onBlur}
          placeholder={placeholder}
          data-error={!!error}
          className={cn(
            BASE_INPUT,
            "pl-9",
            kind === "number" && "font-mono tabular-nums",
            onHide && "pr-9",
            error && "field-error animate-shake",
          )}
        />
        {onHide && (
          <button
            type="button"
            onClick={onHide}
            aria-label="Remove field"
            className="absolute right-2 top-1/2 -translate-y-1/2 flex h-6 w-6 items-center justify-center rounded-md text-[var(--muted)] hover:bg-[var(--card-bg)] hover:text-[var(--foreground)] transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {error && (
        <p className="field-error-text">
          <AlertCircle className="h-3 w-3" /> {error}
        </p>
      )}
      {hint && !error && <p className="mt-1 text-[10px] text-[var(--muted)]">{hint}</p>}
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  children,
  required,
  leading,
}: {
  label?: React.ReactNode;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  children: React.ReactNode;
  required?: boolean;
  leading?: React.ReactNode;
}) {
  return (
    <div>
      {label !== undefined && <FieldLabel required={required}>{label}</FieldLabel>}
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2">
          {leading ?? <List className="h-4 w-4 text-violet-500" />}
        </span>
        <select
          value={value}
          onChange={onChange}
          className={cn(
            BASE_INPUT,
            "cursor-pointer appearance-none pl-9 pr-9 bg-[var(--card-bg)]/70 dark:bg-white/[0.03]",
          )}
        >
          {children}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--muted)]" />
      </div>
    </div>
  );
}

function TextAreaField({
  label,
  value,
  onChange,
  placeholder,
  rows = 2,
  onHide,
}: {
  label: React.ReactNode;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
  rows?: number;
  onHide?: () => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <FieldLabel>{label}</FieldLabel>
        {onHide && (
          <button
            type="button"
            onClick={onHide}
            aria-label="Remove field"
            className="-mt-1 flex h-6 w-6 items-center justify-center rounded-md text-[var(--muted)] hover:bg-[var(--card-bg)] hover:text-[var(--foreground)] transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <textarea
        value={value}
        onChange={onChange}
        rows={rows}
        placeholder={placeholder}
        className={cn(BASE_INPUT, "h-auto resize-none px-3.5 py-2.5")}
      />
    </div>
  );
}

/** Dashed pill that reveals an optional field on click. */
function AddChip({
  icon: Icon,
  onClick,
  children,
}: {
  icon: LucideIcon;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1.5 rounded-full border border-dashed border-[var(--card-border)] px-3 py-1.5 text-xs font-medium text-[var(--muted)] transition-colors hover:border-[var(--primary)]/50 hover:bg-[var(--card-bg)] hover:text-[var(--foreground)]"
    >
      <Plus className="h-3 w-3" />
      <Icon className="h-3.5 w-3.5" />
      {children}
    </button>
  );
}

/** A grouped, color-accented section card. */
function Section({
  icon: Icon,
  title,
  accent,
  subtitle,
  badge,
  children,
}: {
  icon: LucideIcon;
  title: string;
  accent: AccentKey;
  subtitle?: string;
  badge?: React.ReactNode;
  children: React.ReactNode;
}) {
  const a = ACCENTS[accent];
  return (
    <section className={cn("overflow-hidden rounded-2xl border", a.border)}>
      <header
        className={cn(
          "flex items-center gap-2.5 border-b border-[var(--card-border)] px-4 py-2.5",
          a.header,
        )}
      >
        <span className={cn("flex h-7 w-7 items-center justify-center rounded-lg", a.chip)}>
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className={cn("text-[11px] font-bold uppercase tracking-wider", a.title)}>
            {title}
          </div>
          {subtitle && (
            <div className="mt-0.5 text-[10px] normal-case text-[var(--muted)]">{subtitle}</div>
          )}
        </div>
        {badge}
      </header>
      <div className="space-y-3.5 bg-[var(--card-bg)]/20 p-4">{children}</div>
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
        "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-all",
        active
          ? "border-[#A78BFA]/50 bg-[#A78BFA]/10 text-[#A78BFA]"
          : "border-[var(--card-border)] text-[var(--muted)] hover:border-[var(--muted)]/40 hover:text-[var(--foreground)]",
      )}
    >
      <Icon className="h-3 w-3" />
      {children}
    </button>
  );
}

export function LeadForm({ open, onOpenChange, onSubmit, initialData, onSaveDraft }: LeadFormProps) {
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
    isDirty,
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

  // Progressive disclosure — keep the first paint calm; reveal extras on demand.
  const [showAutofill, setShowAutofill] = useState(false);
  const [showIndustryDetail, setShowIndustryDetail] = useState(false);
  const [extras, setExtras] = useState({ website: false, email: false, notes: false });
  const [industryMgrOpen, setIndustryMgrOpen] = useState(false);

  // Re-derive what's revealed each time the dialog opens (so editing a lead that
  // already has a website/email/notes/niche shows those fields straight away).
  useEffect(() => {
    if (!open) return;
    setShowAutofill(false);
    setShowIndustryDetail(!!initialData?.industry_detail);
    setExtras({
      website: !!initialData?.website_url,
      email: !!initialData?.email,
      notes: !!initialData?.management_info,
    });
  }, [open, initialData]);

  // ANY dismissal with unsaved content (✕, Cancel, Escape, click-outside) saves
  // a draft rather than losing it — the form is never an accidental dead-end.
  // (A successful submit closes via the controller's onClose, which bypasses this.)
  const handleOpenChange = (v: boolean) => {
    if (!v && submitting) return;
    if (!v && onSaveDraft && isDirty) {
      onSaveDraft(form);
    }
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
  const platformColor = PLATFORM_CONFIG[form.platform].color;

  const hideExtra = (key: "website" | "email" | "notes") => {
    setExtras((p) => ({ ...p, [key]: false }));
    if (key === "website") update("website_url", "");
    else if (key === "email") update("email", "");
    else update("management_info", "");
  };

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
          <div className="flex items-center justify-between gap-3 border-b border-[var(--card-border)] px-5 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#FF8899]/20 to-[#A78BFA]/20">
                <UserPlus className="h-5 w-5 text-[#FF8899]" />
              </div>
              <div>
                <Dialog.Title className="text-lg font-bold leading-tight text-[var(--foreground)]">
                  {isEdit ? "Edit Lead" : "Add New Lead"}
                </Dialog.Title>
                <p className="mt-0.5 text-xs text-[var(--muted)]">
                  {isEdit ? "Update this prospect's details" : "Just a name to start — add the rest as you go"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              {!isEdit && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-medium text-[var(--muted)] transition-colors hover:bg-[var(--card-bg)] hover:text-[var(--foreground)]"
                  title="Clear all fields"
                >
                  <RotateCcw className="h-3 w-3" />
                  Clear
                </button>
              )}
              <button
                type="button"
                onClick={() => handleOpenChange(false)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--muted)] transition-colors hover:bg-[var(--card-bg)] hover:text-[var(--foreground)]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Scrollable body */}
          <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
            {/* ── Business ─────────────────────────────────────────────── */}
            <Section icon={Building2} title="Business" accent="indigo">
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <InputField
                    label={<>Merchant Name</>}
                    required
                    icon={Store}
                    iconColor="text-indigo-500"
                    inputRef={nameRef}
                    value={form.merchant_name}
                    onChange={(e) => update("merchant_name", e.target.value)}
                    error={errors.merchant_name}
                    placeholder="e.g. عالم القلعة"
                  />
                </div>
                <SelectField
                  label="Platform"
                  value={form.platform}
                  onChange={(e) => update("platform", e.target.value as LeadSourcePlatform)}
                  leading={<PlatformIcon className="h-4 w-4" style={{ color: platformColor }} />}
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
                </SelectField>
              </div>

              {/* Industry + inline management + optional niche detail */}
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <FieldLabel>Industry</FieldLabel>
                  <button
                    type="button"
                    onClick={() => setIndustryMgrOpen(true)}
                    className="flex items-center gap-1 text-[11px] font-medium text-indigo-500 transition-colors hover:text-indigo-600 hover:underline"
                  >
                    <Settings2 className="h-3 w-3" /> Manage
                  </button>
                </div>
                <SelectField
                  value={form.industry_id ?? ""}
                  onChange={(e) => update("industry_id", e.target.value || null)}
                >
                  <option value="">Select industry</option>
                  {(industries ?? [])
                    .filter((i) => i.is_active)
                    .map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.name_ar || i.name}
                      </option>
                    ))}
                </SelectField>

                {showIndustryDetail ? (
                  <div className="mt-2">
                    <InputField
                      icon={Tag}
                      iconColor="text-indigo-400"
                      value={form.industry_detail}
                      onChange={(e) => update("industry_detail", e.target.value)}
                      placeholder="Specify the niche — e.g. herbs & natural products"
                      onHide={() => {
                        setShowIndustryDetail(false);
                        update("industry_detail", "");
                      }}
                    />
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowIndustryDetail(true)}
                    className="mt-2 flex items-center gap-1 text-[11px] font-medium text-[var(--muted)] transition-colors hover:text-[var(--foreground)]"
                  >
                    <Plus className="h-3 w-3" /> Specify the niche
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <InputField
                  label="Handle"
                  icon={AtSign}
                  iconColor="text-pink-500"
                  dir="ltr"
                  value={form.handle}
                  onChange={(e) => update("handle", e.target.value)}
                  placeholder="username"
                />
                <InputField
                  label="Platform URL"
                  kind="url"
                  dir="ltr"
                  value={form.platform_url}
                  onChange={(e) => update("platform_url", e.target.value)}
                  placeholder="https://…"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <InputField
                  label="Follower Count"
                  kind="number"
                  value={form.follower_count || ""}
                  onChange={(e) => update("follower_count", Number(e.target.value) || 0)}
                  placeholder="0"
                />
                <InputField
                  label="Posts"
                  kind="number"
                  value={form.post_count || ""}
                  onChange={(e) => update("post_count", Number(e.target.value) || 0)}
                  placeholder="0"
                />
              </div>

              {/* Auto-fill — collapsed behind a button to keep the form calm */}
              {ANALYZABLE_PLATFORMS.has(form.platform) &&
                (showAutofill ? (
                  <div className="space-y-2.5 rounded-xl border border-dashed border-[#A78BFA]/40 bg-[#A78BFA]/[0.05] p-3">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-[#A78BFA]">
                        <Sparkles className="h-3.5 w-3.5" />
                        Auto-fill from {PLATFORM_CONFIG[form.platform].label}
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowAutofill(false)}
                        className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--muted)] hover:bg-[var(--card-bg)] hover:text-[var(--foreground)]"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        autoFocus
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
                        className={cn(BASE_INPUT, "flex-1 pl-3.5")}
                        placeholder="@username or profile URL"
                        disabled={isAnalyzing}
                      />
                      <button
                        type="button"
                        onClick={handleAnalyze}
                        disabled={isAnalyzing || !analyzeHandle.trim()}
                        className={cn(
                          "flex h-11 items-center gap-2 whitespace-nowrap rounded-xl px-4 text-sm font-bold text-white transition-all",
                          "bg-gradient-to-r from-[#FF8899] to-[#A78BFA] hover:brightness-105",
                          (isAnalyzing || !analyzeHandle.trim()) && "cursor-not-allowed opacity-50",
                        )}
                      >
                        {isAnalyzing ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Search className="h-4 w-4" />
                        )}
                        {isAnalyzing ? "Analyzing…" : "Analyze"}
                      </button>
                    </div>
                    {analyzeError && (
                      <p className="flex items-center gap-1 text-[11px] font-medium text-red-500">
                        <AlertCircle className="h-3 w-3" /> {analyzeError}
                      </p>
                    )}
                    {analyzeSuccess && (
                      <p className="flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                        <Check className="h-3 w-3" /> Profile loaded — fields above were auto-filled.
                      </p>
                    )}
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowAutofill(true)}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[#A78BFA]/40 bg-[#A78BFA]/[0.04] py-2.5 text-[12px] font-semibold text-[#A78BFA] transition-colors hover:bg-[#A78BFA]/[0.09]"
                  >
                    <Sparkles className="h-4 w-4" />
                    Auto-fill from {PLATFORM_CONFIG[form.platform].label} — followers, posts &amp; more
                  </button>
                ))}
            </Section>

            {/* ── Contact ──────────────────────────────────────────────── */}
            <Section
              icon={Phone}
              title="Contact"
              accent="emerald"
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
                <InputField
                  label="Management Name"
                  icon={UserPlus}
                  iconColor="text-emerald-500"
                  value={form.management_name}
                  onChange={(e) => update("management_name", e.target.value)}
                  placeholder="Owner / Manager"
                />
                <div>
                  <FieldLabel>Page Phone</FieldLabel>
                  {form.contact_via_dm ? (
                    <div
                      className={cn(
                        BASE_INPUT,
                        "flex cursor-default select-none items-center gap-2 pl-3.5 text-[var(--muted)]",
                      )}
                    >
                      <MessageCircle className="h-4 w-4 shrink-0 text-[#A78BFA]" />
                      Direct messages only
                    </div>
                  ) : (
                    <div className="relative">
                      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-emerald-500">
                        <Phone className="h-4 w-4" />
                      </span>
                      <input
                        type="tel"
                        inputMode="tel"
                        dir="ltr"
                        value={form.page_phone}
                        onChange={(e) => update("page_phone", e.target.value)}
                        onBlur={() =>
                          form.page_phone && update("page_phone", normalizeIraqiPhone(form.page_phone))
                        }
                        className={cn(
                          BASE_INPUT,
                          "pl-9 font-mono",
                          errors.page_phone && "field-error animate-shake",
                        )}
                        data-error={!!errors.page_phone}
                        placeholder="07XXXXXXXXX"
                      />
                      {errors.page_phone && (
                        <p className="field-error-text">
                          <AlertCircle className="h-3 w-3" /> {errors.page_phone}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Additional numbers — revealed on demand via "Add number" */}
              {!form.contact_via_dm && (
                <div>
                  {form.phone_numbers.length > 0 && (
                    <div className="mb-2 space-y-2">
                      {form.phone_numbers.map((phone, idx) => (
                        <div key={idx} className="flex items-start gap-2">
                          <input
                            type="text"
                            value={phone.title}
                            onChange={(e) => updatePhone(idx, "title", e.target.value)}
                            className={cn(BASE_INPUT, "h-10 w-1/3 pl-3")}
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
                                BASE_INPUT,
                                "h-10 pl-3 font-mono",
                                errors[`phone_${idx}`] && "field-error animate-shake",
                              )}
                              data-error={!!errors[`phone_${idx}`]}
                              placeholder="07XXXXXXXXX"
                            />
                            {errors[`phone_${idx}`] && (
                              <p className="field-error-text">
                                <AlertCircle className="h-3 w-3" /> {errors[`phone_${idx}`]}
                              </p>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => removePhone(idx)}
                            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-red-400 transition-colors hover:bg-red-50 dark:hover:bg-red-500/10"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  {form.phone_numbers.length < 3 && (
                    <button
                      type="button"
                      onClick={addPhone}
                      className="flex items-center gap-1.5 text-[11px] font-medium text-emerald-600 transition-colors hover:underline"
                    >
                      <Plus className="h-3 w-3" /> Add another number
                    </button>
                  )}
                </div>
              )}

              {/* Optional extras — hidden until the employee asks for them */}
              {extras.website && (
                <InputField
                  label="Website"
                  kind="url"
                  dir="ltr"
                  value={form.website_url}
                  onChange={(e) => update("website_url", e.target.value)}
                  placeholder="https://yourshop.com"
                  onHide={() => hideExtra("website")}
                />
              )}
              {extras.email && (
                <InputField
                  label="Email"
                  kind="email"
                  dir="ltr"
                  value={form.email}
                  onChange={(e) => update("email", e.target.value)}
                  placeholder="shop@example.com"
                  error={errors.email}
                  onHide={() => hideExtra("email")}
                />
              )}
              {extras.notes && (
                <TextAreaField
                  label="Notes"
                  value={form.management_info}
                  onChange={(e) => update("management_info", e.target.value)}
                  placeholder="Additional management details…"
                  onHide={() => hideExtra("notes")}
                />
              )}

              {(!extras.website || !extras.email || !extras.notes) && (
                <div className="flex flex-wrap gap-2 pt-0.5">
                  {!extras.website && (
                    <AddChip icon={Globe} onClick={() => setExtras((p) => ({ ...p, website: true }))}>
                      Website
                    </AddChip>
                  )}
                  {!extras.email && (
                    <AddChip icon={Mail} onClick={() => setExtras((p) => ({ ...p, email: true }))}>
                      Email
                    </AddChip>
                  )}
                  {!extras.notes && (
                    <AddChip icon={StickyNote} onClick={() => setExtras((p) => ({ ...p, notes: true }))}>
                      Note
                    </AddChip>
                  )}
                </div>
              )}
            </Section>

            {/* ── Audience ─────────────────────────────────────────────── */}
            <Section
              icon={BarChart3}
              title="Audience"
              accent="violet"
              badge={
                hasPrediction ? (
                  <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                    <TrendingUp className="h-3 w-3" />~{estimatedDailyOrders}/day
                  </span>
                ) : undefined
              }
            >
              <div className="grid grid-cols-4 gap-2.5">
                {(
                  [
                    ["avg_view_count", "Views"],
                    ["avg_like_count", "Likes"],
                    ["avg_comments_count", "Comments"],
                    ["avg_order_count", "Orders/day"],
                  ] as const
                ).map(([key, label]) => (
                  <div key={key}>
                    <FieldLabel>{label}</FieldLabel>
                    <div className="relative">
                      <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-blue-500">
                        <Hash className="h-3.5 w-3.5" />
                      </span>
                      <input
                        type="number"
                        min={0}
                        value={form[key] || ""}
                        onChange={(e) => update(key, Number(e.target.value) || 0)}
                        className={cn(
                          BASE_INPUT,
                          "pl-7 pr-2 font-mono tabular-nums",
                          key === "avg_order_count" && isOrdersOverride && "border-emerald-400/60",
                        )}
                        placeholder="0"
                      />
                    </div>
                  </div>
                ))}
              </div>
              {isOrdersOverride && (
                <p className="-mt-1 text-[10px] text-[var(--muted)]">
                  Orders/day overrides the views-based forecast
                </p>
              )}

              {hasPrediction && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 dark:border-emerald-500/20 dark:bg-emerald-500/10">
                  <div className="mb-2.5 flex items-center gap-2">
                    <TrendingUp className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
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
                        <div className="text-xl font-black tabular-nums text-emerald-700 dark:text-emerald-300">
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

            {/* ── Location ─────────────────────────────────────────────── */}
            <Section
              icon={MapPin}
              title="Location"
              accent="amber"
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
              {form.is_online_only ? (
                <div>
                  <FieldLabel>Location</FieldLabel>
                  <div
                    className={cn(
                      BASE_INPUT,
                      "flex cursor-default select-none items-center gap-2 pl-3.5 text-[var(--muted)]",
                    )}
                  >
                    <Globe className="h-4 w-4 shrink-0 text-[#A78BFA]" />
                    No physical location
                  </div>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <SelectField
                      label="Governorate"
                      value={form.governorate_code}
                      onChange={(e) => update("governorate_code", e.target.value)}
                      leading={<MapPin className="h-4 w-4 text-amber-500" />}
                    >
                      <option value="">Select governorate</option>
                      {IRAQ_GOVERNORATES.map((g) => (
                        <option key={g.code} value={g.code}>
                          {g.name} — {g.name_en}
                        </option>
                      ))}
                    </SelectField>
                    <InputField
                      label="City / Area"
                      icon={MapPin}
                      iconColor="text-amber-500"
                      value={form.city}
                      onChange={(e) => update("city", e.target.value)}
                      placeholder="e.g. Amarah"
                    />
                  </div>

                  <TextAreaField
                    label="Address"
                    value={form.address}
                    onChange={(e) => update("address", e.target.value)}
                    placeholder="Full address (optional)"
                  />

                  {/* Branches — additional physical locations, each with its own phone(s) */}
                  <div>
                    <div className="mb-1.5 flex items-center justify-between">
                      <label className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--muted)]">
                        <Building2 className="h-3 w-3" /> Branches
                      </label>
                      <button
                        type="button"
                        onClick={addBranch}
                        className="flex items-center gap-1 text-[11px] font-medium text-amber-600 transition-colors hover:underline"
                      >
                        <Plus className="h-3 w-3" /> Add branch
                      </button>
                    </div>

                    {form.branches.length === 0 ? (
                      <p className="text-[11px] italic text-[var(--muted)]">
                        Single location — the fields above are the main branch. Add more for
                        multi-branch stores.
                      </p>
                    ) : (
                      <div className="space-y-2.5">
                        {form.branches.map((branch, bi) => (
                          <div
                            key={bi}
                            className="space-y-2.5 rounded-xl border border-[var(--card-border)] bg-white/60 p-3 dark:bg-[var(--card-bg)]/40"
                          >
                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                value={branch.name}
                                onChange={(e) => updateBranch(bi, "name", e.target.value)}
                                className={cn(BRANCH_INPUT, "flex-1")}
                                placeholder="Branch name (e.g. Mansour)"
                              />
                              <button
                                type="button"
                                onClick={() => removeBranch(bi)}
                                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-red-400 transition-colors hover:bg-red-50 dark:hover:bg-red-500/10"
                                title="Remove branch"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                              <input
                                type="text"
                                value={branch.city}
                                onChange={(e) => updateBranch(bi, "city", e.target.value)}
                                className={BRANCH_INPUT}
                                placeholder="City"
                              />
                              <input
                                type="text"
                                value={branch.address}
                                onChange={(e) => updateBranch(bi, "address", e.target.value)}
                                className={BRANCH_INPUT}
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
                                      className={cn(BRANCH_INPUT, "w-1/3")}
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
                                          BRANCH_INPUT,
                                          "font-mono",
                                          errors[errKey] && "field-error animate-shake",
                                        )}
                                        data-error={!!errors[errKey]}
                                        placeholder="07XXXXXXXXX"
                                      />
                                      {errors[errKey] && (
                                        <p className="field-error-text">
                                          <AlertCircle className="h-3 w-3" /> {errors[errKey]}
                                        </p>
                                      )}
                                    </div>
                                    {branch.phones.length > 1 && (
                                      <button
                                        type="button"
                                        onClick={() => removeBranchPhone(bi, pi)}
                                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-red-400 transition-colors hover:bg-red-50 dark:hover:bg-red-500/10"
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </button>
                                    )}
                                  </div>
                                );
                              })}
                              {branch.phones.length < 3 && (
                                <button
                                  type="button"
                                  onClick={() => addBranchPhone(bi)}
                                  className="flex items-center gap-1 text-[11px] font-medium text-amber-600 transition-colors hover:underline"
                                >
                                  <Plus className="h-3 w-3" /> Add number
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </Section>
          </div>

          {/* Sticky Footer */}
          <div className="flex items-center justify-between gap-3 border-t border-[var(--card-border)] bg-[var(--card-bg)]/50 px-5 py-3.5">
            <button
              type="button"
              onClick={() => handleOpenChange(false)}
              disabled={submitting}
              className="text-sm font-medium text-[var(--muted)] transition-colors hover:text-[var(--foreground)] disabled:opacity-50"
            >
              Cancel
            </button>

            {/* Live prediction chip */}
            {hasPrediction ? (
              <div className="hidden items-center gap-1.5 rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-1.5 dark:border-emerald-500/20 dark:bg-emerald-500/10 sm:flex">
                <TrendingUp className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                <span className="text-xs font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">
                  ~{estimatedDailyOrders}/day · {formatIQD(estimatedMonthlyRevenue)}/mo
                </span>
              </div>
            ) : (
              <span className="hidden text-[11px] text-[var(--muted)] sm:block">
                Add audience metrics to forecast orders
              </span>
            )}

            <div className="flex items-center gap-2">
              {!isEdit && (
                <button
                  type="button"
                  onClick={() => submit(true)}
                  disabled={submitting}
                  className="flex items-center gap-1.5 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] px-3 py-2.5 text-xs font-semibold text-[var(--foreground)] transition-all hover:brightness-105 disabled:opacity-50"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Save &amp; New
                </button>
              )}
              <button
                type="button"
                onClick={() => submit(false)}
                disabled={submitting}
                className={cn(
                  "flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold text-white shadow-sm transition-all",
                  "bg-gradient-to-r from-[#FF8899] to-[#A78BFA] hover:brightness-105",
                  submitting && "cursor-not-allowed opacity-70",
                )}
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <UserPlus className="h-4 w-4" />
                )}
                {submitting ? "Saving…" : isEdit ? "Save Changes" : "Add Lead"}
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>

      <LeadIndustryManager
        isOpen={industryMgrOpen}
        onClose={() => setIndustryMgrOpen(false)}
      />
    </Dialog.Root>
  );
}
