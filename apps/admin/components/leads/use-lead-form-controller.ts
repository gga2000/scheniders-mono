"use client";

import { useState, useEffect, useEffectEvent, useRef, useCallback } from "react";
import type { LeadFormData, LeadPhoneNumber, LeadBranch } from "@/types/leads";
import { useIndustries } from "@/hooks/use-industries";
import { useLeaveGuard } from "@/hooks/use-leave-guard";
import { adminFetch } from "@/lib/admin-fetch";
import { toast } from "sonner";
import { isValidIraqiPhone } from "./lead-phone";
import { leadFormChanges, normalizeLeadForm } from "./lead-form-data";
import { LEAD_GONE_TOAST, LeadGoneError, LeadListsChangedError, type LeadList } from "@/lib/lead-update";

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

/** `form` with `lists` taken from `from`. */
function withLists(form: LeadFormData, from: LeadFormData, lists: readonly LeadList[]): LeadFormData {
  const next = { ...form };
  const take = <K extends LeadList>(list: K) => {
    next[list] = from[list];
  };
  lists.forEach(take);
  return next;
}

/**
 * The clash toast's id: one clash toast at a time (a second clash updates it),
 * closed once a later save is not refused over the lists, so a saved lead
 * never sits under "Nothing was saved".
 */
export const CLASH_TOAST = "lead-clash";

const isValidEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

/** What a host's save answered: saved, failed, or had nothing to send. */
export type LeadFormSubmitResult = boolean | "unchanged";

/**
 * A dismissal with unsaved content saves a draft: the whole form (a new
 * lead), what changed since it opened and the form as it opened (a resumed
 * draft, which sends only its changes, as the lead page does).
 */
export type LeadFormDraftSave = (data: LeadFormData, changes: Partial<LeadFormData>, opened: LeadFormData) => void;

interface UseLeadFormControllerArgs {
  open: boolean;
  /**
   * `data` is the whole saved form; `changes` only the fields that differ from
   * the form as it opened; `opened` the form as it opened.
   */
  onSubmit: (
    data: LeadFormData,
    changes: Partial<LeadFormData>,
    opened: LeadFormData,
  ) => Promise<LeadFormSubmitResult> | LeadFormSubmitResult | void;
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

  // The form as it was on open: what a save is compared with, and how unsaved
  // edits are spotted so an accidental dismissal can be auto-saved as a draft.
  const [opened, setOpened] = useState<LeadFormData>(DEFAULT_FORM);
  // The lists a save was refused over, until the colleague's copy arrives.
  const [clash, setClash] = useState<LeadList[] | null>(null);

  const resetForm = useCallback(() => {
    const initial = initialData ? { ...DEFAULT_FORM, ...initialData } : DEFAULT_FORM;
    setForm(initial);
    setOpened(initial);
    setAnalyzeHandle("");
    setAnalyzeError(null);
    setAnalyzeSuccess(false);
    setErrors({});
    setClash(null);
  }, [initialData]);

  // A save refused because a colleague changed lists meanwhile reads the lead
  // again (useUpdateLead). Once their lists arrive they replace this form's
  // copy, as shown and as opened; every other typed field stays, so the next
  // Save sends this person's changes over the colleague's lists.
  if (clash && initialData) {
    const fresh: LeadFormData = { ...DEFAULT_FORM, ...initialData };
    if (clash.some((list) => JSON.stringify(fresh[list]) !== JSON.stringify(opened[list]))) {
      setOpened(withLists(opened, fresh, clash));
      setForm((prev) => withLists(prev, fresh, clash));
      setClash(null);
    }
  }

  /** True when the form differs from its opened state (has unsaved content). */
  const isDirty = JSON.stringify(form) !== JSON.stringify(opened);
  useLeaveGuard(open && isDirty);

  /** On a dismissal: hand unsaved content to the host's draft save. */
  const saveDraftOnClose = (onSaveDraft: LeadFormDraftSave | undefined) => {
    if (onSaveDraft && isDirty) onSaveDraft(form, leadFormChanges(opened, normalizeLeadForm(form)), opened);
  };

  // The form starts from the lead as it is when the form opens, and only then.
  // Hosts pass a new starting object on every render (a save in flight, a
  // colleague's change read in the background); starting over on that would
  // throw away what this person typed. A colleague's change is still safe:
  // a save sends only the fields this person changed.
  const resetOnOpen = useEffectEvent(() => resetForm());
  useEffect(() => {
    if (open) resetOnOpen();
  }, [open]);

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

    const normalized = normalizeLeadForm(form);
    // Only what this person changed goes to an existing lead, so a colleague's
    // edit made while this form was open is not written back over.
    const changes = leadFormChanges(opened, normalized);

    setSubmitting(true);
    setClash(null);
    try {
      const result = await onSubmit(normalized, changes, opened);
      // The save was not refused over the lists: the last clash's words no
      // longer hold. Closed here, not as the save starts: sonner closes a
      // toast a frame or two late, and a quick second clash under the same id
      // would be closed with it.
      toast.dismiss(CLASH_TOAST);
      if (result === false) {
        toast.error("Couldn't save the lead. Please try again.");
        return;
      }
      if (result === "unchanged") {
        toast.info("Nothing changed");
        onClose();
        return;
      }
      toast.success(isEdit ? "Lead updated" : `${normalized.merchant_name} added to pipeline`);
      if (keepOpen && !isEdit) {
        resetForm();
        setTimeout(() => nameRef.current?.focus(), 60);
      } else {
        onClose();
      }
    } catch (error) {
      if (error instanceof LeadListsChangedError) {
        // Long enough to read: the form is about to show the colleague's lists.
        setClash(error.lists);
        toast.error(error.message, { id: CLASH_TOAST, duration: 15_000 });
        return;
      }
      toast.dismiss(CLASH_TOAST);
      if (error instanceof LeadGoneError) {
        toast.error(error.message, { id: LEAD_GONE_TOAST });
        return;
      }
      // A refused save rejects with the server's own words ("A lead can only
      // go to an active staff member."); "try again" would never help there.
      toast.error(error instanceof Error && error.message ? error.message : "Something went wrong while saving.");
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
    saveDraftOnClose,
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
