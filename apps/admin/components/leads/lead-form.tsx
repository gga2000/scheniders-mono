"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { useIndustries } from "@/hooks/use-industries";
import type { LeadFormData, LeadPhoneNumber, LeadSourcePlatform, LeadPriority } from "@/types/leads";
import { PLATFORM_CONFIG, LEAD_PRIORITY_CONFIG } from "@/types/leads";
import { X, Plus, Trash2, TrendingUp, Search, Loader2, Sparkles } from "lucide-react";
import { adminFetch } from "@/lib/admin-fetch";
import * as Dialog from "@radix-ui/react-dialog";

interface LeadFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: LeadFormData) => void;
  initialData?: Partial<LeadFormData>;
  isLoading?: boolean;
}

const EMPTY_PHONE: LeadPhoneNumber = { title: "", number: "" };

const DEFAULT_FORM: LeadFormData = {
  merchant_name: "",
  industry_id: null,
  platform: "instagram",
  platform_url: "",
  follower_count: 0,
  management_name: "",
  management_info: "",
  page_phone: "",
  phone_numbers: [{ ...EMPTY_PHONE }],
  avg_view_count: 0,
  avg_like_count: 0,
  avg_comments_count: 0,
  avg_order_count: 0,
  address: "",
  city: "",
  governorate_code: "",
  priority: "medium",
  assigned_to: null,
  tags: [],
  source_campaign: "",
  source_medium: "",
};

const ANALYZABLE_PLATFORMS = new Set(["instagram"]);

export function LeadForm({ open, onOpenChange, onSubmit, initialData, isLoading }: LeadFormProps) {
  const [form, setForm] = useState<LeadFormData>(DEFAULT_FORM);
  const [analyzeHandle, setAnalyzeHandle] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [analyzeSuccess, setAnalyzeSuccess] = useState(false);
  const { data: industries } = useIndustries();

  useEffect(() => {
    if (open) {
      setForm(initialData ? { ...DEFAULT_FORM, ...initialData } : DEFAULT_FORM);
      setAnalyzeHandle("");
      setAnalyzeError(null);
      setAnalyzeSuccess(false);
    }
  }, [open, initialData]);

  const update = <K extends keyof LeadFormData>(key: K, value: LeadFormData[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleAnalyze = async () => {
    if (!analyzeHandle.trim() || !ANALYZABLE_PLATFORMS.has(form.platform)) return;
    setIsAnalyzing(true);
    setAnalyzeError(null);
    setAnalyzeSuccess(false);
    try {
      const res = await adminFetch("/api/leads/analyze-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform: form.platform, handle: analyzeHandle.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Analysis failed");

      const p = json.profile;
      setForm((prev) => ({
        ...prev,
        merchant_name: p.merchant_name || prev.merchant_name,
        follower_count: p.follower_count || prev.follower_count,
        avg_view_count: p.avg_view_count || prev.avg_view_count,
        avg_like_count: p.avg_like_count || prev.avg_like_count,
        avg_comments_count: p.avg_comments_count || prev.avg_comments_count,
        platform_url: p.platform_url || prev.platform_url,
        management_info: p.bio ? (prev.management_info ? prev.management_info + "\n" + p.bio : p.bio) : prev.management_info,
      }));
      setAnalyzeSuccess(true);
    } catch (err) {
      setAnalyzeError(err instanceof Error ? err.message : "Failed to analyze profile");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const addPhone = () => {
    if (form.phone_numbers.length < 3) {
      update("phone_numbers", [...form.phone_numbers, { ...EMPTY_PHONE }]);
    }
  };

  const removePhone = (idx: number) => {
    update("phone_numbers", form.phone_numbers.filter((_, i) => i !== idx));
  };

  const updatePhone = (idx: number, field: keyof LeadPhoneNumber, value: string) => {
    const updated = [...form.phone_numbers];
    updated[idx] = { ...updated[idx], [field]: value };
    update("phone_numbers", updated);
  };

  // Prediction calculation
  const estimatedDailyOrders = Math.round(form.avg_view_count / 1000);
  const selectedIndustry = industries?.find((i) => i.id === form.industry_id);
  const avgOrderValue = selectedIndustry?.avg_order_value_iqd ?? 25000;
  const estimatedMonthlyRevenue = estimatedDailyOrders * 30 * avgOrderValue;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(form);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50" />
        <Dialog.Content className="fixed right-0 top-0 bottom-0 w-full max-w-xl bg-[var(--background)] z-50 overflow-y-auto shadow-2xl">
          <form onSubmit={handleSubmit} className="p-6 space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between sticky top-0 bg-[var(--background)] pb-4 border-b border-[var(--card-border)] z-10">
              <h2 className="text-xl font-bold text-[var(--foreground)]">
                {initialData ? "Edit Lead" : "Add New Lead"}
              </h2>
              <Dialog.Close asChild>
                <button className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[var(--card-bg)] transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </Dialog.Close>
            </div>

            {/* Section 1: Business Info */}
            <fieldset className="space-y-4">
              <legend className="text-sm font-bold text-[var(--foreground)] uppercase tracking-wider mb-3">Business Information</legend>

              <div>
                <label className="block text-xs font-medium text-[var(--muted)] mb-1">Merchant Name *</label>
                <input
                  type="text"
                  required
                  value={form.merchant_name}
                  onChange={(e) => update("merchant_name", e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-[var(--card-bg)] border border-[var(--card-border)] text-sm text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30"
                  placeholder="Enter merchant name"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[var(--muted)] mb-1">Platform *</label>
                  <select
                    value={form.platform}
                    onChange={(e) => update("platform", e.target.value as LeadSourcePlatform)}
                    className="w-full px-4 py-2.5 rounded-xl bg-[var(--card-bg)] border border-[var(--card-border)] text-sm"
                  >
                    {(Object.entries(PLATFORM_CONFIG) as [LeadSourcePlatform, typeof PLATFORM_CONFIG.instagram][]).map(
                      ([key, config]) => (
                        <option key={key} value={key}>{config.label}</option>
                      )
                    )}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--muted)] mb-1">Industry</label>
                  <select
                    value={form.industry_id ?? ""}
                    onChange={(e) => update("industry_id", e.target.value || null)}
                    className="w-full px-4 py-2.5 rounded-xl bg-[var(--card-bg)] border border-[var(--card-border)] text-sm"
                  >
                    <option value="">Select industry</option>
                    {(industries ?? []).filter((i) => i.is_active).map((i) => (
                      <option key={i.id} value={i.id}>{i.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[var(--muted)] mb-1">Platform URL</label>
                  <input
                    type="url"
                    value={form.platform_url}
                    onChange={(e) => update("platform_url", e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl bg-[var(--card-bg)] border border-[var(--card-border)] text-sm"
                    placeholder="https://..."
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--muted)] mb-1">Follower Count</label>
                  <input
                    type="number"
                    min={0}
                    value={form.follower_count || ""}
                    onChange={(e) => update("follower_count", Number(e.target.value) || 0)}
                    className="w-full px-4 py-2.5 rounded-xl bg-[var(--card-bg)] border border-[var(--card-border)] text-sm"
                    placeholder="0"
                  />
                </div>
              </div>

              {/* Analyze Profile */}
              {ANALYZABLE_PLATFORMS.has(form.platform) && (
                <div className="rounded-xl border border-dashed border-[var(--primary)]/40 bg-[var(--primary)]/[0.04] p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-[var(--primary)]" />
                    <span className="text-xs font-bold text-[var(--primary)] uppercase tracking-wider">
                      Auto-Fill from {PLATFORM_CONFIG[form.platform].label}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={analyzeHandle}
                      onChange={(e) => { setAnalyzeHandle(e.target.value); setAnalyzeError(null); setAnalyzeSuccess(false); }}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAnalyze(); } }}
                      className="flex-1 px-4 py-2.5 rounded-xl bg-[var(--card-bg)] border border-[var(--card-border)] text-sm text-[var(--foreground)] placeholder:text-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30"
                      placeholder={form.platform === "facebook" ? "Page name or URL" : "@username or profile URL"}
                      disabled={isAnalyzing}
                    />
                    <button
                      type="button"
                      onClick={handleAnalyze}
                      disabled={isAnalyzing || !analyzeHandle.trim()}
                      className={cn(
                        "flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all whitespace-nowrap",
                        "bg-[var(--primary)] text-[var(--primary-fg)] hover:brightness-110",
                        (isAnalyzing || !analyzeHandle.trim()) && "opacity-50 cursor-not-allowed",
                      )}
                    >
                      {isAnalyzing ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Search className="w-4 h-4" />
                      )}
                      {isAnalyzing ? "Analyzing..." : "Analyze"}
                    </button>
                  </div>
                  {analyzeError && (
                    <p className="text-xs text-red-500 font-medium">{analyzeError}</p>
                  )}
                  {analyzeSuccess && (
                    <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                      Profile data loaded! Fields below have been auto-filled.
                    </p>
                  )}
                </div>
              )}
            </fieldset>

            {/* Section 2: Contact Info */}
            <fieldset className="space-y-4">
              <legend className="text-sm font-bold text-[var(--foreground)] uppercase tracking-wider mb-3">Contact Information</legend>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[var(--muted)] mb-1">Management Name</label>
                  <input
                    type="text"
                    value={form.management_name}
                    onChange={(e) => update("management_name", e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl bg-[var(--card-bg)] border border-[var(--card-border)] text-sm"
                    placeholder="Owner / Manager"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--muted)] mb-1">Page Phone</label>
                  <input
                    type="tel"
                    value={form.page_phone}
                    onChange={(e) => update("page_phone", e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl bg-[var(--card-bg)] border border-[var(--card-border)] text-sm"
                    placeholder="07xxxxxxxxx"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--muted)] mb-1">Management Info</label>
                <textarea
                  value={form.management_info}
                  onChange={(e) => update("management_info", e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-[var(--card-bg)] border border-[var(--card-border)] text-sm resize-none"
                  rows={2}
                  placeholder="Additional management details..."
                />
              </div>

              {/* Phone Numbers (repeater) */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-medium text-[var(--muted)]">Phone Numbers</label>
                  {form.phone_numbers.length < 3 && (
                    <button
                      type="button"
                      onClick={addPhone}
                      className="flex items-center gap-1 text-xs text-[var(--primary)] hover:underline"
                    >
                      <Plus className="w-3 h-3" /> Add
                    </button>
                  )}
                </div>
                <div className="space-y-2">
                  {form.phone_numbers.map((phone, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <input
                        type="text"
                        value={phone.title}
                        onChange={(e) => updatePhone(idx, "title", e.target.value)}
                        className="w-1/3 px-3 py-2 rounded-xl bg-[var(--card-bg)] border border-[var(--card-border)] text-sm"
                        placeholder="Title"
                      />
                      <input
                        type="tel"
                        value={phone.number}
                        onChange={(e) => updatePhone(idx, "number", e.target.value)}
                        className="flex-1 px-3 py-2 rounded-xl bg-[var(--card-bg)] border border-[var(--card-border)] text-sm"
                        placeholder="07xxxxxxxxx"
                      />
                      {form.phone_numbers.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removePhone(idx)}
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </fieldset>

            {/* Section 3: Social Metrics + Prediction */}
            <fieldset className="space-y-4">
              <legend className="text-sm font-bold text-[var(--foreground)] uppercase tracking-wider mb-3">Social Metrics</legend>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[var(--muted)] mb-1">Avg View Count</label>
                  <input
                    type="number"
                    min={0}
                    value={form.avg_view_count || ""}
                    onChange={(e) => update("avg_view_count", Number(e.target.value) || 0)}
                    className="w-full px-4 py-2.5 rounded-xl bg-[var(--card-bg)] border border-[var(--card-border)] text-sm"
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--muted)] mb-1">Avg Like Count</label>
                  <input
                    type="number"
                    min={0}
                    value={form.avg_like_count || ""}
                    onChange={(e) => update("avg_like_count", Number(e.target.value) || 0)}
                    className="w-full px-4 py-2.5 rounded-xl bg-[var(--card-bg)] border border-[var(--card-border)] text-sm"
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--muted)] mb-1">Avg Comments Count</label>
                  <input
                    type="number"
                    min={0}
                    value={form.avg_comments_count || ""}
                    onChange={(e) => update("avg_comments_count", Number(e.target.value) || 0)}
                    className="w-full px-4 py-2.5 rounded-xl bg-[var(--card-bg)] border border-[var(--card-border)] text-sm"
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--muted)] mb-1">Avg Order Count</label>
                  <input
                    type="number"
                    min={0}
                    value={form.avg_order_count || ""}
                    onChange={(e) => update("avg_order_count", Number(e.target.value) || 0)}
                    className="w-full px-4 py-2.5 rounded-xl bg-[var(--card-bg)] border border-[var(--card-border)] text-sm"
                    placeholder="0"
                  />
                </div>
              </div>

              {/* Live Prediction Box */}
              {form.avg_view_count > 0 && (
                <div className="bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingUp className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    <span className="text-xs font-bold text-emerald-700 dark:text-emerald-300 uppercase tracking-wider">Order Prediction</span>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <div className="text-2xl font-black text-emerald-700 dark:text-emerald-300">{estimatedDailyOrders}</div>
                      <div className="text-xs text-emerald-600/70 dark:text-emerald-400/70">orders/day</div>
                    </div>
                    <div>
                      <div className="text-2xl font-black text-emerald-700 dark:text-emerald-300">{(estimatedDailyOrders * 30).toLocaleString()}</div>
                      <div className="text-xs text-emerald-600/70 dark:text-emerald-400/70">orders/month</div>
                    </div>
                    <div>
                      <div className="text-2xl font-black text-emerald-700 dark:text-emerald-300">{(estimatedMonthlyRevenue / 1000).toFixed(0)}K</div>
                      <div className="text-xs text-emerald-600/70 dark:text-emerald-400/70">IQD/month</div>
                    </div>
                  </div>
                </div>
              )}
            </fieldset>

            {/* Section 4: Location */}
            <fieldset className="space-y-4">
              <legend className="text-sm font-bold text-[var(--foreground)] uppercase tracking-wider mb-3">Location</legend>
              <div>
                <label className="block text-xs font-medium text-[var(--muted)] mb-1">Address</label>
                <textarea
                  value={form.address}
                  onChange={(e) => update("address", e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-[var(--card-bg)] border border-[var(--card-border)] text-sm resize-none"
                  rows={2}
                  placeholder="Full address (optional)"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--muted)] mb-1">City</label>
                <input
                  type="text"
                  value={form.city}
                  onChange={(e) => update("city", e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-[var(--card-bg)] border border-[var(--card-border)] text-sm"
                  placeholder="City"
                />
              </div>
            </fieldset>

            {/* Section 5: Assignment */}
            <fieldset className="space-y-4">
              <legend className="text-sm font-bold text-[var(--foreground)] uppercase tracking-wider mb-3">Assignment & Priority</legend>
              <div>
                <label className="block text-xs font-medium text-[var(--muted)] mb-1">Priority</label>
                <select
                  value={form.priority}
                  onChange={(e) => update("priority", e.target.value as LeadPriority)}
                  className="w-full px-4 py-2.5 rounded-xl bg-[var(--card-bg)] border border-[var(--card-border)] text-sm"
                >
                  {(Object.entries(LEAD_PRIORITY_CONFIG) as [LeadPriority, typeof LEAD_PRIORITY_CONFIG.low][]).map(
                    ([key, config]) => (
                      <option key={key} value={key}>{config.label}</option>
                    )
                  )}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[var(--muted)] mb-1">Source Campaign</label>
                  <input
                    type="text"
                    value={form.source_campaign}
                    onChange={(e) => update("source_campaign", e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl bg-[var(--card-bg)] border border-[var(--card-border)] text-sm"
                    placeholder="Campaign name"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--muted)] mb-1">Source Medium</label>
                  <input
                    type="text"
                    value={form.source_medium}
                    onChange={(e) => update("source_medium", e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl bg-[var(--card-bg)] border border-[var(--card-border)] text-sm"
                    placeholder="e.g., social, direct"
                  />
                </div>
              </div>
            </fieldset>

            {/* Submit */}
            <div className="sticky bottom-0 bg-[var(--background)] pt-4 border-t border-[var(--card-border)] flex gap-3">
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="flex-1 py-3 rounded-xl border border-[var(--card-border)] text-sm font-medium text-[var(--foreground)] hover:bg-[var(--card-bg)] transition-colors"
                >
                  Cancel
                </button>
              </Dialog.Close>
              <button
                type="submit"
                disabled={isLoading || !form.merchant_name}
                className={cn(
                  "flex-1 py-3 rounded-xl text-sm font-bold transition-all",
                  "bg-[var(--primary)] text-[var(--primary-fg)] hover:brightness-110",
                  (isLoading || !form.merchant_name) && "opacity-50 cursor-not-allowed"
                )}
              >
                {isLoading ? "Saving..." : initialData ? "Update Lead" : "Add Lead"}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
