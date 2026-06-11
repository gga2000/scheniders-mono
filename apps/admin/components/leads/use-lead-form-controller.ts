"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { LeadFormData, LeadPhoneNumber, LeadBranch } from "@/types/leads";
import { useIndustries } from "@/hooks/use-industries";
import { adminFetch } from "@/lib/admin-fetch";
import { toast } from "sonner";
import { normalizeIraqiPhone, isValidIraqiPhone } from "./lead-phone";

export const EMPTY_PHONE: LeadPhoneNumber = { title: "", number: "" };
export const EMPTY_BRANCH: LeadBranch = { name: "", city: "", address: "", phones: [{ ...EMPTY_PHONE }] };

export const DEFAULT_FORM: LeadFormData = {
  merchant_name: "",
  industry_id: null,
  industry_detail: "",
  platform: "instagram",
  platform_url: "",
  handle: "",
  follower_count: 0,
  post_count: 0,
  management_name: "",
  management_info: "",
  page_phone: "",
  // Additional numbers start empty — employees reveal a row via "Add number".
  phone_numbers: [],
  contact_via_dm: false,
  website_url: "",
  email: "",
  avg_view_count: 0,
  avg_like_count: 0,
  avg_comments_count: 0,
  avg_order_count: 0,
  address: "",
  city: "",
  governorate_code: "",
  is_online_only: false,
  branches: [],
  priority: "medium",
  assigned_to: null,
  tags: [],
  source_campaign: "",
  source_medium: "",
};

export const ANALYZABLE_PLATFORMS = new Set(["instagram"]);

const isValidEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

interface UseLeadFormControllerArgs {
  open: boolean;
  onSubmit: (data: LeadFormData) => Promise<boolean> | boolean | void;
  initialData?: Partial<LeadFormData>;
  /** Called after a successful single save (lets the host close the sheet/dialog). */
  onClose: () => void;
}

export function useLeadFormController({
  open,
  onSubmit,
  initialData,
  onClose,
}: UseLeadFormControllerArgs) {
  const [form, setForm] = useState<LeadFormData>(DEFAULT_FORM);
  const [analyzeHandle, setAnalyzeHandle] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [analyzeSuccess, setAnalyzeSuccess] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const { data: industries } = useIndustries();
  const nameRef = useRef<HTMLInputElement>(null);

  const isEdit = !!initialData;

  // Snapshot of the form as it was on open — used to detect unsaved edits so an
  // accidental dismissal can be auto-saved as a draft.
  const baselineRef = useRef<string>("");

  const resetForm = useCallback(() => {
    const initial = initialData ? { ...DEFAULT_FORM, ...initialData } : DEFAULT_FORM;
    setForm(initial);
    baselineRef.current = JSON.stringify(initial);
    setAnalyzeHandle("");
    setAnalyzeError(null);
    setAnalyzeSuccess(false);
    setErrors({});
  }, [initialData]);

  /** True when the form differs from its opened state (has unsaved content). */
  const isDirty = JSON.stringify(form) !== baselineRef.current;

  useEffect(() => {
    if (open) resetForm();
  }, [open, resetForm]);

  const update = <K extends keyof LeadFormData>(key: K, value: LeadFormData[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => (prev[key as string] ? { ...prev, [key as string]: "" } : prev));
  };

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
        handle: p.handle || prev.handle,
        follower_count: p.follower_count || prev.follower_count,
        post_count: p.post_count || prev.post_count,
        avg_view_count: p.avg_view_count || prev.avg_view_count,
        avg_like_count: p.avg_like_count || prev.avg_like_count,
        avg_comments_count: p.avg_comments_count || prev.avg_comments_count,
        platform_url: p.platform_url || prev.platform_url,
        management_info: p.bio
          ? prev.management_info
            ? prev.management_info + "\n" + p.bio
            : p.bio
          : prev.management_info,
      }));
      setAnalyzeSuccess(true);
    } catch (err) {
      setAnalyzeError(err instanceof Error ? err.message : "Failed to analyze profile");
    } finally {
      setIsAnalyzing(false);
    }
  };

  // ── Phone helpers ──────────────────────────────────────────────────────
  const addPhone = () => {
    if (form.phone_numbers.length < 3) {
      update("phone_numbers", [...form.phone_numbers, { ...EMPTY_PHONE }]);
    }
  };
  const removePhone = (idx: number) =>
    update("phone_numbers", form.phone_numbers.filter((_, i) => i !== idx));
  const updatePhone = (idx: number, field: keyof LeadPhoneNumber, value: string) => {
    const updated = [...form.phone_numbers];
    updated[idx] = { ...updated[idx], [field]: value };
    update("phone_numbers", updated);
    if (field === "number") setErrors((p) => ({ ...p, [`phone_${idx}`]: "" }));
  };

  // ── Branch helpers ─────────────────────────────────────────────────────
  const addBranch = () =>
    update("branches", [...form.branches, { ...EMPTY_BRANCH, phones: [{ ...EMPTY_PHONE }] }]);
  const removeBranch = (bi: number) =>
    update("branches", form.branches.filter((_, i) => i !== bi));
  const updateBranch = (bi: number, field: "name" | "city" | "address", value: string) => {
    const next = [...form.branches];
    next[bi] = { ...next[bi], [field]: value };
    update("branches", next);
  };
  const addBranchPhone = (bi: number) => {
    if (form.branches[bi].phones.length >= 3) return;
    const next = [...form.branches];
    next[bi] = { ...next[bi], phones: [...next[bi].phones, { ...EMPTY_PHONE }] };
    update("branches", next);
  };
  const removeBranchPhone = (bi: number, pi: number) => {
    const next = [...form.branches];
    next[bi] = { ...next[bi], phones: next[bi].phones.filter((_, i) => i !== pi) };
    update("branches", next);
  };
  const updateBranchPhone = (
    bi: number,
    pi: number,
    field: keyof LeadPhoneNumber,
    value: string,
  ) => {
    const next = [...form.branches];
    const phones = [...next[bi].phones];
    phones[pi] = { ...phones[pi], [field]: value };
    next[bi] = { ...next[bi], phones };
    update("branches", next);
    if (field === "number") setErrors((p) => ({ ...p, [`branch_${bi}_phone_${pi}`]: "" }));
  };

  // ── Live prediction ───────────────────────────────────────────────────
  // Views funnel: 1% of views become interested, 1% of those buy → views / 10,000.
  const viewsBasedDailyOrders = Math.round(form.avg_view_count / 10000);
  // A manually entered avg orders/day overrides the views estimate.
  const isOrdersOverride = form.avg_order_count > 0;
  const estimatedDailyOrders = isOrdersOverride ? form.avg_order_count : viewsBasedDailyOrders;
  const selectedIndustry = industries?.find((i) => i.id === form.industry_id);
  const avgOrderValue = selectedIndustry?.avg_order_value_iqd ?? 25000;
  const estimatedMonthlyRevenue = estimatedDailyOrders * 30 * avgOrderValue;
  const hasPrediction = estimatedDailyOrders > 0;

  // ── Validation ────────────────────────────────────────────────────────
  const validate = (): boolean => {
    const next: Record<string, string> = {};
    if (!form.merchant_name.trim()) next.merchant_name = "Merchant name is required";
    if (form.email.trim() && !isValidEmail(form.email)) next.email = "Enter a valid email";
    // DM-only pages have no phone — skip all phone validation.
    if (!form.contact_via_dm) {
      if (form.page_phone.trim() && !isValidIraqiPhone(form.page_phone))
        next.page_phone = "Enter a valid Iraqi number (07XXXXXXXXX)";
      form.phone_numbers.forEach((p, i) => {
        if (p.number.trim() && !isValidIraqiPhone(p.number)) next[`phone_${i}`] = "Invalid number";
      });
    }
    // Branch phone numbers (online-only stores have no physical branches).
    if (!form.is_online_only) {
      form.branches.forEach((b, bi) => {
        b.phones.forEach((p, pi) => {
          if (p.number.trim() && !isValidIraqiPhone(p.number))
            next[`branch_${bi}_phone_${pi}`] = "Invalid number";
        });
      });
    }
    setErrors(next);
    if (Object.keys(next).length > 0) {
      setTimeout(() => {
        document
          .querySelector(".field-error")
          ?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 50);
      return false;
    }
    return true;
  };

  // ── Submit ────────────────────────────────────────────────────────────
  const submit = async (keepOpen: boolean) => {
    if (submitting) return;
    if (!validate()) return;

    const normalized: LeadFormData = {
      ...form,
      merchant_name: form.merchant_name.trim(),
      industry_detail: form.industry_detail.trim(),
      // Store the handle without a leading "@" (users may type "@name").
      handle: form.handle.trim().replace(/^@+/, ""),
      website_url: form.website_url.trim(),
      email: form.email.trim().toLowerCase(),
      // DM-only pages keep no phone numbers.
      page_phone: form.contact_via_dm || !form.page_phone ? "" : normalizeIraqiPhone(form.page_phone),
      phone_numbers: form.contact_via_dm
        ? []
        : form.phone_numbers
            .map((p) => ({
              title: p.title.trim(),
              number: p.number ? normalizeIraqiPhone(p.number) : "",
            }))
            .filter((p) => p.number || p.title),
      // Online-only pages have no physical location (or branches).
      ...(form.is_online_only ? { address: "", city: "", governorate_code: "", branches: [] } : {}),
      // Trim/normalize branches; drop fully-empty ones and blank phone rows.
      branches: form.is_online_only
        ? []
        : form.branches
            .map((b) => ({
              name: b.name.trim(),
              city: b.city.trim(),
              address: b.address.trim(),
              phones: b.phones
                .map((p) => ({
                  title: p.title.trim(),
                  number: p.number ? normalizeIraqiPhone(p.number) : "",
                }))
                .filter((p) => p.number || p.title),
            }))
            .filter((b) => b.name || b.city || b.address || b.phones.length > 0),
    };

    setSubmitting(true);
    try {
      const result = await onSubmit(normalized);
      if (result === false) {
        toast.error("Couldn't save the lead. Please try again.");
        return;
      }
      toast.success(isEdit ? "Lead updated" : `${normalized.merchant_name} added to pipeline`);
      if (keepOpen && !isEdit) {
        resetForm();
        setTimeout(() => nameRef.current?.focus(), 60);
      } else {
        onClose();
      }
    } catch {
      toast.error("Something went wrong while saving.");
    } finally {
      setSubmitting(false);
    }
  };

  return {
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
    avgOrderValue,
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
  };
}
