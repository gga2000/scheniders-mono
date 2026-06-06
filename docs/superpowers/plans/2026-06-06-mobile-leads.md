# Mobile Leads Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a phone-optimized `/leads` and `/leads/[id]` experience in `apps/admin` (active below 768px) — scannable list + FAB, fast "Smart Sheet" register flow, tap-to-advance pipeline, mobile detail + quick note — while the desktop UI stays byte-for-byte unchanged.

**Architecture:** A `mounted`-guarded `useIsMobile()` (<768px) branch in each leads route renders either the **existing desktop JSX moved verbatim** into a `*-desktop-view` component, or a new mobile tree under `components/leads/mobile/`. Shared logic (form controller, phone/stage helpers) is extracted into pure modules consumed by both desktop and mobile so nothing is duplicated. All data/mutations reuse existing hooks; no backend or DB changes.

**Tech Stack:** Next.js 16 App Router, React 19, TanStack Query (incl. `useInfiniteQuery`), Zustand (`useLeadStore`), `@radix-ui/react-dialog`, Tailwind v4, framer-motion, lucide-react, Vitest (node env, pure logic only).

**Branch:** `feat/mobile-leads` (already created). **Dev server:** `pnpm dev:admin` → http://localhost:3002.

**Spec:** `docs/superpowers/specs/2026-06-06-mobile-leads-design.md`

---

## File structure

**New — pure logic / hooks**
- `apps/admin/components/leads/lead-phone.ts` — Iraqi phone normalize/validate (moved out of `lead-form.tsx`).
- `apps/admin/components/leads/lead-stage.ts` — `getNextStages(status)` from `LEAD_STATUS_FLOW`.
- `apps/admin/components/leads/use-lead-form-controller.ts` — all add/edit-lead form state + behavior.
- `apps/admin/hooks/use-is-mobile.ts` — shared `<768px` breakpoint hook.
- `apps/admin/hooks/use-infinite-leads.ts` — infinite-scroll leads list for mobile.

**New — mobile UI** (`apps/admin/components/leads/mobile/`)
- `bottom-sheet.tsx` — reusable bottom-sheet primitive (Radix Dialog).
- `lead-mobile-row.tsx` — one list row.
- `advance-stage-sheet.tsx` — pick next pipeline stage.
- `quick-note-sheet.tsx` — add a note/activity.
- `lead-register-sheet.tsx` — Smart Sheet register flow.
- `leads-mobile-view.tsx` — mobile home (header, search, chips, list, FAB).
- `lead-mobile-detail.tsx` — mobile detail (header, tabs, sticky action bar).

**New — desktop extractions (verbatim moves, no design change)**
- `apps/admin/components/leads/leads-desktop-view.tsx`
- `apps/admin/components/leads/lead-detail-desktop.tsx`
- `apps/admin/components/leads/lead-detail-tabs.tsx` — shared tab bodies extracted from the detail page.

**New — test infra**
- `apps/admin/vitest.config.ts`
- tests colocated: `*.test.ts` next to `lead-phone.ts` / `lead-stage.ts`.

**Edited (behavior-preserving)**
- `apps/admin/components/leads/lead-form.tsx` — consumes `use-lead-form-controller`.
- `apps/admin/components/layout/admin-shell.tsx` — imports shared `useIsMobile`.
- `apps/admin/app/(dashboard)/leads/page.tsx` — desktop/mobile switch.
- `apps/admin/app/(dashboard)/leads/[id]/page.tsx` — desktop/mobile switch.
- `vitest.workspace.ts` — add admin config.
- `apps/admin/package.json` — add `test` script.

**Ordering rationale:** pure logic + infra first (Tasks 1–7), then the *risky* verbatim desktop extractions isolated and verified before any mobile UI builds on them (Tasks 8, 13), then mobile UI (Tasks 9–12, 14), then final verification (Task 15).

---

## Task 1: Minimal Vitest setup for admin (node env, no new deps)

**Files:**
- Create: `apps/admin/vitest.config.ts`
- Modify: `vitest.workspace.ts`
- Modify: `apps/admin/package.json` (add `test` script)

- [ ] **Step 1: Create the config** — node environment, `@/*` + `@scheniders/shared` aliases, pure `*.test.ts` only (no jsdom/React → no new dependencies).

```ts
// apps/admin/vitest.config.ts
import { defineConfig } from "vitest/config";
import path from "node:path";

// Node-env Vitest for the admin app — pure logic/unit tests only.
// Mirrors the Next.js `@/*` alias so tests import modules like the app does.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      "@scheniders/shared": path.resolve(__dirname, "../../packages/shared/src"),
    },
  },
  test: {
    environment: "node",
    globals: false,
    include: [
      "components/**/*.test.ts",
      "hooks/**/*.test.ts",
      "lib/**/*.test.ts",
    ],
  },
});
```

- [ ] **Step 2: Register it in the workspace**

In `vitest.workspace.ts`, add `"apps/admin/vitest.config.ts"` to the array:

```ts
export default [
  "apps/storefront/vitest.config.ts",
  "apps/platform/vitest.config.mts",
  "apps/admin/vitest.config.ts",
  "packages/shared",
];
```

- [ ] **Step 3: Add a `test` script to admin** — in `apps/admin/package.json` `"scripts"`, add:

```json
"test": "vitest run"
```

- [ ] **Step 4: Verify the runner resolves the admin project** (no tests yet is fine)

Run: `pnpm exec vitest run apps/admin`
Expected: exits 0 with "No test files found" (or runs 0 files) — confirms config parses and the workspace picks it up.

- [ ] **Step 5: Commit**

```bash
git add apps/admin/vitest.config.ts vitest.workspace.ts apps/admin/package.json
git commit -m "test(admin): add minimal node-env vitest setup"
```

---

## Task 2: Extract Iraqi phone helpers (TDD)

These currently live inside `lead-form.tsx` (lines ~100-113). Move them to a pure module so both the form controller and tests can use them.

**Files:**
- Create: `apps/admin/components/leads/lead-phone.ts`
- Create: `apps/admin/components/leads/lead-phone.test.ts`
- Modify: `apps/admin/components/leads/lead-form.tsx` (import from new module, delete inline copies)

- [ ] **Step 1: Write the failing test**

```ts
// apps/admin/components/leads/lead-phone.test.ts
import { describe, it, expect } from "vitest";
import { normalizeIraqiPhone, isValidIraqiPhone } from "./lead-phone";

describe("normalizeIraqiPhone", () => {
  it("strips +964 / 00964 and re-adds leading 0", () => {
    expect(normalizeIraqiPhone("+9647701234567")).toBe("07701234567");
    expect(normalizeIraqiPhone("009647701234567")).toBe("07701234567");
    expect(normalizeIraqiPhone("7701234567")).toBe("07701234567");
  });
  it("keeps a well-formed local number", () => {
    expect(normalizeIraqiPhone("07701234567")).toBe("07701234567");
  });
  it("converts Arabic-Indic digits", () => {
    expect(normalizeIraqiPhone("٠٧٧٠١٢٣٤٥٦٧")).toBe("07701234567");
  });
  it("returns empty string for empty input", () => {
    expect(normalizeIraqiPhone("")).toBe("");
  });
});

describe("isValidIraqiPhone", () => {
  it("accepts 10-11 digit 07 numbers", () => {
    expect(isValidIraqiPhone("07701234567")).toBe(true);
    expect(isValidIraqiPhone("+9647701234567")).toBe(true);
  });
  it("rejects non-Iraqi / too-short numbers", () => {
    expect(isValidIraqiPhone("12345")).toBe(false);
    expect(isValidIraqiPhone("0801234567")).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `pnpm exec vitest run apps/admin/components/leads/lead-phone.test.ts`
Expected: FAIL — `Failed to resolve import "./lead-phone"`.

- [ ] **Step 3: Create the module** (verbatim from the current `lead-form.tsx` logic)

```ts
// apps/admin/components/leads/lead-phone.ts
// Iraqi phone normalizer — handles Arabic-Indic numerals, +964 / 00964 / leading-0.
const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";

export function normalizeIraqiPhone(input: string): string {
  if (!input) return "";
  let d = input
    .replace(/[٠-٩]/g, (x) => String(AR_DIGITS.indexOf(x)))
    .replace(/\D/g, "");
  if (d.startsWith("00964")) d = d.slice(5);
  else if (d.startsWith("964")) d = d.slice(3);
  d = d.replace(/^0+/, "");
  if (d.startsWith("7")) d = "0" + d;
  return d;
}

export const isValidIraqiPhone = (v: string) => /^07\d{8,9}$/.test(normalizeIraqiPhone(v));
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `pnpm exec vitest run apps/admin/components/leads/lead-phone.test.ts`
Expected: PASS (6 assertions).

- [ ] **Step 5: Update `lead-form.tsx` to import from the module**

In `apps/admin/components/leads/lead-form.tsx`: delete the inline `AR_DIGITS`, `normalizeIraqiPhone`, and `isValidIraqiPhone` definitions (the block around lines 100-113) and add near the top imports:

```ts
import { normalizeIraqiPhone, isValidIraqiPhone } from "./lead-phone";
```

- [ ] **Step 6: Verify type-check passes and form is unchanged**

Run: `pnpm --filter @scheniders/admin exec tsc --noEmit` (or `pnpm type-check`)
Expected: no errors. The desktop Add/Edit Lead dialog behaves identically.

- [ ] **Step 7: Commit**

```bash
git add apps/admin/components/leads/lead-phone.ts apps/admin/components/leads/lead-phone.test.ts apps/admin/components/leads/lead-form.tsx
git commit -m "refactor(admin/leads): extract Iraqi phone helpers to lead-phone.ts (tested)"
```

---

## Task 3: Stage-flow helper (TDD)

**Files:**
- Create: `apps/admin/components/leads/lead-stage.ts`
- Create: `apps/admin/components/leads/lead-stage.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/admin/components/leads/lead-stage.test.ts
import { describe, it, expect } from "vitest";
import { getNextStages } from "./lead-stage";

describe("getNextStages", () => {
  it("returns forward transitions for an active stage", () => {
    expect(getNextStages("new")).toEqual(["contacted", "lost"]);
    expect(getNextStages("interested")).toEqual(["store_built", "converted", "lost"]);
  });
  it("returns no transitions for a terminal converted lead", () => {
    expect(getNextStages("converted")).toEqual([]);
  });
  it("allows re-opening a lost lead", () => {
    expect(getNextStages("lost")).toEqual(["new"]);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `pnpm exec vitest run apps/admin/components/leads/lead-stage.test.ts`
Expected: FAIL — cannot resolve `./lead-stage`.

- [ ] **Step 3: Create the helper**

```ts
// apps/admin/components/leads/lead-stage.ts
import { LEAD_STATUS_FLOW, type LeadStatus } from "@/types/leads";

/** Valid next pipeline stages for a lead in `status` (per LEAD_STATUS_FLOW). */
export function getNextStages(status: LeadStatus): LeadStatus[] {
  return LEAD_STATUS_FLOW[status] ?? [];
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `pnpm exec vitest run apps/admin/components/leads/lead-stage.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/admin/components/leads/lead-stage.ts apps/admin/components/leads/lead-stage.test.ts
git commit -m "feat(admin/leads): add getNextStages pipeline helper (tested)"
```

---

## Task 4: Extract the lead-form controller hook

Move all add/edit-lead state + behavior out of `lead-form.tsx` into a hook so the desktop dialog and the mobile sheet share one source of truth. The desktop dialog's rendered output must stay identical.

**Files:**
- Create: `apps/admin/components/leads/use-lead-form-controller.ts`
- Modify: `apps/admin/components/leads/lead-form.tsx`

- [ ] **Step 1: Create the controller hook** — lift `DEFAULT_FORM`, `EMPTY_PHONE`, `ANALYZABLE_PLATFORMS`, all `useState`/`useEffect`/handlers, the analyze call, validation, prediction math, and `submit` out of `lead-form.tsx` verbatim. Keep `nameRef` here so both views can focus the name field. (The Cmd/Ctrl+Enter listener stays in the desktop view — see Step 2.)

```ts
// apps/admin/components/leads/use-lead-form-controller.ts
"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { LeadFormData, LeadPhoneNumber } from "@/types/leads";
import { useIndustries } from "@/hooks/use-industries";
import { adminFetch } from "@/lib/admin-fetch";
import { toast } from "sonner";
import { normalizeIraqiPhone, isValidIraqiPhone } from "./lead-phone";

export const EMPTY_PHONE: LeadPhoneNumber = { title: "", number: "" };

export const DEFAULT_FORM: LeadFormData = {
  merchant_name: "", industry_id: null, platform: "instagram", platform_url: "",
  follower_count: 0, management_name: "", management_info: "", page_phone: "",
  phone_numbers: [{ ...EMPTY_PHONE }], contact_via_dm: false, website_url: "",
  avg_view_count: 0, avg_like_count: 0, avg_comments_count: 0, avg_order_count: 0,
  address: "", city: "", governorate_code: "", is_online_only: false,
  priority: "medium", assigned_to: null, tags: [], source_campaign: "", source_medium: "",
};

export const ANALYZABLE_PLATFORMS = new Set(["instagram"]);

interface UseLeadFormControllerArgs {
  open: boolean;
  onSubmit: (data: LeadFormData) => Promise<boolean> | boolean | void;
  initialData?: Partial<LeadFormData>;
  /** Called after a successful single save (lets the host close the sheet/dialog). */
  onClose: () => void;
}

export function useLeadFormController({ open, onSubmit, initialData, onClose }: UseLeadFormControllerArgs) {
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

  const resetForm = useCallback(() => {
    setForm(initialData ? { ...DEFAULT_FORM, ...initialData } : DEFAULT_FORM);
    setAnalyzeHandle(""); setAnalyzeError(null); setAnalyzeSuccess(false); setErrors({});
  }, [initialData]);

  useEffect(() => { if (open) resetForm(); }, [open, resetForm]);

  const update = <K extends keyof LeadFormData>(key: K, value: LeadFormData[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => (prev[key as string] ? { ...prev, [key as string]: "" } : prev));
  };

  const handleAnalyze = async () => {
    if (!analyzeHandle.trim() || !ANALYZABLE_PLATFORMS.has(form.platform)) return;
    setIsAnalyzing(true); setAnalyzeError(null); setAnalyzeSuccess(false);
    try {
      const res = await adminFetch("/api/leads/analyze-profile", {
        method: "POST", headers: { "Content-Type": "application/json" },
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
    } finally { setIsAnalyzing(false); }
  };

  const addPhone = () => {
    if (form.phone_numbers.length < 3) update("phone_numbers", [...form.phone_numbers, { ...EMPTY_PHONE }]);
  };
  const removePhone = (idx: number) =>
    update("phone_numbers", form.phone_numbers.filter((_, i) => i !== idx));
  const updatePhone = (idx: number, field: keyof LeadPhoneNumber, value: string) => {
    const updated = [...form.phone_numbers];
    updated[idx] = { ...updated[idx], [field]: value };
    update("phone_numbers", updated);
    if (field === "number") setErrors((p) => ({ ...p, [`phone_${idx}`]: "" }));
  };

  const estimatedDailyOrders = Math.round(form.avg_view_count / 1000);
  const selectedIndustry = industries?.find((i) => i.id === form.industry_id);
  const avgOrderValue = selectedIndustry?.avg_order_value_iqd ?? 25000;
  const estimatedMonthlyRevenue = estimatedDailyOrders * 30 * avgOrderValue;
  const hasPrediction = form.avg_view_count > 0;

  const validate = (): boolean => {
    const next: Record<string, string> = {};
    if (!form.merchant_name.trim()) next.merchant_name = "Merchant name is required";
    if (!form.contact_via_dm) {
      if (form.page_phone.trim() && !isValidIraqiPhone(form.page_phone))
        next.page_phone = "Enter a valid Iraqi number (07XXXXXXXXX)";
      form.phone_numbers.forEach((p, i) => {
        if (p.number.trim() && !isValidIraqiPhone(p.number)) next[`phone_${i}`] = "Invalid number";
      });
    }
    setErrors(next);
    if (Object.keys(next).length > 0) {
      setTimeout(() => {
        document.querySelector(".field-error")?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 50);
      return false;
    }
    return true;
  };

  const submit = async (keepOpen: boolean) => {
    if (submitting) return;
    if (!validate()) return;
    const normalized: LeadFormData = {
      ...form,
      merchant_name: form.merchant_name.trim(),
      website_url: form.website_url.trim(),
      page_phone: form.contact_via_dm || !form.page_phone ? "" : normalizeIraqiPhone(form.page_phone),
      phone_numbers: form.contact_via_dm ? [] : form.phone_numbers
        .map((p) => ({ title: p.title.trim(), number: p.number ? normalizeIraqiPhone(p.number) : "" }))
        .filter((p) => p.number || p.title),
      ...(form.is_online_only ? { address: "", city: "", governorate_code: "" } : {}),
    };
    setSubmitting(true);
    try {
      const result = await onSubmit(normalized);
      if (result === false) { toast.error("Couldn't save the lead. Please try again."); return; }
      toast.success(isEdit ? "Lead updated" : `${normalized.merchant_name} added to pipeline`);
      if (keepOpen && !isEdit) { resetForm(); setTimeout(() => nameRef.current?.focus(), 60); }
      else onClose();
    } catch { toast.error("Something went wrong while saving."); }
    finally { setSubmitting(false); }
  };

  return {
    form, errors, submitting, isEdit, industries, nameRef,
    analyzeHandle, setAnalyzeHandle, isAnalyzing, analyzeError, analyzeSuccess,
    estimatedDailyOrders, estimatedMonthlyRevenue, hasPrediction, avgOrderValue,
    update, resetForm, handleAnalyze, addPhone, removePhone, updatePhone, submit,
  };
}
```

- [ ] **Step 2: Refactor `lead-form.tsx` to consume the controller** — keep ALL existing JSX/markup/classes exactly as-is; only replace the local state/logic with the hook. Concretely:
  - Delete the moved constants (`EMPTY_PHONE`, `DEFAULT_FORM`, `ANALYZABLE_PLATFORMS`) and all the moved state/handlers/derived values/`submit`.
  - Import the hook + the constant the JSX still references:
    ```ts
    import { useLeadFormController, ANALYZABLE_PLATFORMS } from "./use-lead-form-controller";
    ```
  - Inside the component, replace the removed block with:
    ```ts
    const handleOpenChange = (v: boolean) => { if (!v && submitting) return; onOpenChange(v); };
    const {
      form, errors, submitting, isEdit, industries, nameRef,
      analyzeHandle, setAnalyzeHandle, isAnalyzing, analyzeError, analyzeSuccess,
      estimatedDailyOrders, estimatedMonthlyRevenue, hasPrediction,
      update, resetForm, handleAnalyze, addPhone, removePhone, updatePhone, submit,
    } = useLeadFormController({ open, onSubmit, initialData, onClose: () => onOpenChange(false) });
    ```
    (Note: `handleOpenChange` references `submitting`, so declare it *after* the hook call. Keep `useIndustries` usage removed from the view — read `industries` from the hook return.)
  - Keep the desktop-only Cmd/Ctrl+Enter `useEffect` exactly as it is (it calls `submit(false)`), since `submit` now comes from the hook.

- [ ] **Step 3: Verify type-check + desktop form unchanged**

Run: `pnpm type-check`
Expected: 0 errors. Then with `pnpm dev:admin`, open `/leads` at desktop width, click **Add Lead** → the dialog looks and behaves exactly as before (analyze auto-fill, validation shake, Save & New, Cmd+Enter). Open a lead → **Edit** prefills correctly.

- [ ] **Step 4: Commit**

```bash
git add apps/admin/components/leads/use-lead-form-controller.ts apps/admin/components/leads/lead-form.tsx
git commit -m "refactor(admin/leads): extract useLeadFormController (desktop dialog unchanged)"
```

---

## Task 5: Shared `useIsMobile` hook

**Files:**
- Create: `apps/admin/hooks/use-is-mobile.ts`
- Modify: `apps/admin/components/layout/admin-shell.tsx`

- [ ] **Step 1: Create the hook** (lifted verbatim from `admin-shell.tsx`, breakpoint `< 768`)

```ts
// apps/admin/hooks/use-is-mobile.ts
"use client";

import { useState, useEffect } from "react";

const MOBILE_BREAKPOINT = 768;

/** True when the viewport is narrower than 768px. Returns `false` until mounted. */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  return isMobile;
}
```

- [ ] **Step 2: Use it in `admin-shell.tsx`** — delete the local `useIsMobile` function (lines ~45-56) and import the shared one:

```ts
import { useIsMobile } from "@/hooks/use-is-mobile";
```

(The existing `const isMobile = useIsMobile();` call stays.)

- [ ] **Step 3: Verify** — `pnpm type-check` passes; the sidebar still collapses to the mobile drawer below 768px and is unchanged above.

- [ ] **Step 4: Commit**

```bash
git add apps/admin/hooks/use-is-mobile.ts apps/admin/components/layout/admin-shell.tsx
git commit -m "refactor(admin): extract shared useIsMobile hook"
```

---

## Task 6: `BottomSheet` primitive

A reusable bottom-anchored sheet on Radix Dialog (already a dep), with slide-up + a drag-handle affordance. Used by all three mobile sheets.

**Files:**
- Create: `apps/admin/components/leads/mobile/bottom-sheet.tsx`

- [ ] **Step 1: Create the component**

```tsx
// apps/admin/components/leads/mobile/bottom-sheet.tsx
"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { cn } from "@/lib/utils";

interface BottomSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: React.ReactNode;
  /** Full height (≈92vh) for big forms; otherwise auto height capped at 88vh. */
  fullHeight?: boolean;
  children: React.ReactNode;
  /** Optional sticky footer (e.g. action buttons). */
  footer?: React.ReactNode;
}

export function BottomSheet({ open, onOpenChange, title, fullHeight, children, footer }: BottomSheetProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm lead-overlay-in" />
        <Dialog.Content
          aria-describedby={undefined}
          className={cn(
            "fixed inset-x-0 bottom-0 z-50 flex flex-col rounded-t-3xl border-t border-[var(--card-border)]",
            "bg-[var(--background)] shadow-2xl lead-sheet-in outline-none",
            fullHeight ? "h-[92vh]" : "max-h-[88vh]",
          )}
        >
          {/* drag handle */}
          <div className="flex justify-center pt-2.5 pb-1 shrink-0">
            <span className="h-1.5 w-10 rounded-full bg-[var(--card-border)]" />
          </div>
          {title && (
            <Dialog.Title className="px-5 pb-3 pt-1 text-base font-bold text-[var(--foreground)] shrink-0">
              {title}
            </Dialog.Title>
          )}
          <div className="flex-1 overflow-y-auto overscroll-contain px-5 pb-5">{children}</div>
          {footer && (
            <div className="shrink-0 border-t border-[var(--card-border)] bg-[var(--card-bg)]/60 px-5 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
              {footer}
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
```

- [ ] **Step 2: Add the slide-up keyframe** — append to `apps/admin/app/globals.css` (next to the existing `lead-overlay-in` / `lead-modal-in` animations):

```css
@keyframes lead-sheet-up {
  from { transform: translateY(100%); }
  to { transform: translateY(0); }
}
.lead-sheet-in { animation: lead-sheet-up 0.28s cubic-bezier(0.16, 1, 0.3, 1); }
```

(First confirm `lead-overlay-in` exists in `globals.css`; if the project keeps these animations elsewhere, add the keyframe in the same file.)

- [ ] **Step 3: Verify** — `pnpm type-check` passes. (Visual check happens once a sheet consumes it in Task 10.)

- [ ] **Step 4: Commit**

```bash
git add apps/admin/components/leads/mobile/bottom-sheet.tsx apps/admin/app/globals.css
git commit -m "feat(admin/leads): add mobile BottomSheet primitive"
```

---

## Task 7: `useInfiniteLeads` hook

Infinite-scroll list for mobile, over the same `/api/leads` endpoint and the same `useLeadStore` filters used by `useLeads`.

**Files:**
- Create: `apps/admin/hooks/use-infinite-leads.ts`

- [ ] **Step 1: Create the hook**

```ts
// apps/admin/hooks/use-infinite-leads.ts
"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import type { Lead } from "@/types/leads";
import { useLeadStore } from "@/store/use-lead-store";
import { adminFetch } from "@/lib/admin-fetch";

interface LeadsPage { leads: Lead[]; total: number; page: number; limit: number; }

const LIMIT = 20;

export function useInfiniteLeads() {
  const {
    statusFilter, platformFilter, priorityFilter, tierFilter, industryFilter,
    assigneeFilter, hasStoreFilter, scoreRange, searchQuery, sortBy,
  } = useLeadStore();

  return useInfiniteQuery<LeadsPage>({
    queryKey: [
      "leads", "infinite", statusFilter, platformFilter, priorityFilter, tierFilter,
      industryFilter, assigneeFilter, hasStoreFilter, scoreRange, searchQuery, sortBy,
    ],
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams();
      params.set("page", String(pageParam));
      params.set("limit", String(LIMIT));
      if (statusFilter) params.set("status", statusFilter);
      if (platformFilter) params.set("platform", platformFilter);
      if (priorityFilter) params.set("priority", priorityFilter);
      if (tierFilter) params.set("tier", tierFilter);
      if (industryFilter) params.set("industry_id", industryFilter);
      if (assigneeFilter) params.set("assigned_to", assigneeFilter);
      if (hasStoreFilter !== null) params.set("has_store", String(hasStoreFilter));
      if (scoreRange[0] > 0) params.set("score_min", String(scoreRange[0]));
      if (scoreRange[1] < 100) params.set("score_max", String(scoreRange[1]));
      if (searchQuery) params.set("search", searchQuery);
      if (sortBy) params.set("sort", sortBy);
      const res = await adminFetch(`/api/leads?${params}`);
      if (!res.ok) throw new Error("Failed to fetch leads");
      return res.json();
    },
    getNextPageParam: (lastPage) => {
      const loaded = lastPage.page * lastPage.limit;
      return loaded < lastPage.total ? lastPage.page + 1 : undefined;
    },
    staleTime: 30_000,
  });
}
```

- [ ] **Step 2: Verify** — `pnpm type-check` passes.

- [ ] **Step 3: Commit**

```bash
git add apps/admin/hooks/use-infinite-leads.ts
git commit -m "feat(admin/leads): add useInfiniteLeads hook"
```

---

## Task 8: Isolate desktop view + add the mobile switch (mobile = placeholder for now)

This is the **risky verbatim move**. Do it as a pure cut/paste and verify desktop is unchanged before any mobile UI exists.

**Files:**
- Create: `apps/admin/components/leads/leads-desktop-view.tsx`
- Modify: `apps/admin/app/(dashboard)/leads/page.tsx`

- [ ] **Step 1: Move the page body into `LeadsDesktopView`** — create `leads-desktop-view.tsx` with `"use client";`, move the **entire current `LeadsPage` body** (all imports it uses, the `compactIQD`/`countFmt`/`leadPhone`/`toIntlIraqi`/`CountUp` helpers, the `kpis` array, and the full returned JSX) into an exported `export function LeadsDesktopView() { ... }`. Do not change a single class or element — this is a cut/paste so desktop output is byte-identical.

- [ ] **Step 2: Replace `page.tsx` with the switch**

```tsx
// apps/admin/app/(dashboard)/leads/page.tsx
"use client";

import { useIsMobile } from "@/hooks/use-is-mobile";
import { LeadsDesktopView } from "@/components/leads/leads-desktop-view";

export default function LeadsPage() {
  const isMobile = useIsMobile();
  // `useIsMobile` is false until mounted, so SSR/first paint renders desktop markup;
  // on a phone it swaps to the mobile view after mount (no hydration mismatch).
  if (isMobile) {
    return (
      <div className="p-5 text-sm text-[var(--muted)]">Mobile leads — coming in Task 12.</div>
    );
  }
  return <LeadsDesktopView />;
}
```

- [ ] **Step 3: Verify desktop is unchanged + mobile branch renders**

Run: `pnpm type-check` (expect 0 errors). With `pnpm dev:admin`:
  - At width ≥768px, `/leads` is pixel-identical to before (KPI strip, table/kanban/cards, filters, bulk bar, dialogs).
  - In responsive mode at 375px, you see the "coming in Task 12" placeholder (confirms the switch works).

- [ ] **Step 4: Commit**

```bash
git add apps/admin/components/leads/leads-desktop-view.tsx apps/admin/app/(dashboard)/leads/page.tsx
git commit -m "refactor(admin/leads): isolate desktop view behind useIsMobile switch"
```

---

## Task 9: `LeadMobileRow`

**Files:**
- Create: `apps/admin/components/leads/mobile/lead-mobile-row.tsx`

A single dense, tappable list row. Mirrors the palette used in `lead-card.tsx` / the desktop table.

- [ ] **Step 1: Create the component**

```tsx
// apps/admin/components/leads/mobile/lead-mobile-row.tsx
"use client";

import { useRouter } from "next/navigation";
import type { Lead } from "@/types/leads";
import { LEAD_STATUS_CONFIG, LEAD_STATUS_UI, LEAD_PRIORITY_UI, LEAD_TIER_CONFIG, PLATFORM_CONFIG } from "@/types/leads";

function compactFollowers(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K`;
  return String(n);
}

interface LeadMobileRowProps {
  lead: Lead;
  /** Open the advance-stage sheet for this lead. */
  onStatusTap: (lead: Lead) => void;
}

export function LeadMobileRow({ lead, onStatusTap }: LeadMobileRowProps) {
  const router = useRouter();
  const tier = LEAD_TIER_CONFIG[lead.tier];
  const statusCfg = LEAD_STATUS_CONFIG[lead.status];
  const statusUi = LEAD_STATUS_UI[lead.status];
  const platform = PLATFORM_CONFIG[lead.platform];
  const priorityColor = LEAD_PRIORITY_UI[lead.priority];

  return (
    <button
      type="button"
      onClick={() => router.push(`/leads/${lead.id}`)}
      className="flex w-full items-center gap-3 rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] p-3 text-left active:scale-[0.99] transition-transform"
    >
      <div
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-base font-bold"
        style={{ backgroundColor: `${tier.color}1A`, color: tier.color, border: `1px solid ${tier.color}40` }}
      >
        {lead.merchant_name.trim().charAt(0).toUpperCase() || "?"}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate font-semibold text-[var(--foreground)]">{lead.merchant_name}</div>
        <div className="mt-0.5 truncate text-xs text-[var(--muted)]">
          <span style={{ color: platform.color }}>{platform.label}</span>
          {" · "}{compactFollowers(lead.follower_count)}
          {" · "}<span style={{ color: tier.color }}>{tier.label}</span>
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <span
          role="button"
          tabIndex={0}
          onClick={(e) => { e.stopPropagation(); onStatusTap(lead); }}
          className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold"
          style={{ backgroundColor: statusUi.soft, color: statusUi.solid }}
        >
          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: statusUi.solid }} />
          {statusCfg.label}
        </span>
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: priorityColor }} />
      </div>
    </button>
  );
}
```

> Note: the status pill is a nested interactive element inside the row button. Because a `<button>` can't legally contain another `<button>`, the pill is a `role="button"` `<span>` with `stopPropagation` so tapping it opens the stage sheet rather than navigating.

- [ ] **Step 2: Verify** — `pnpm type-check` passes.

- [ ] **Step 3: Commit**

```bash
git add apps/admin/components/leads/mobile/lead-mobile-row.tsx
git commit -m "feat(admin/leads): add LeadMobileRow"
```

---

## Task 10: `AdvanceStageSheet` + `QuickNoteSheet`

**Files:**
- Create: `apps/admin/components/leads/mobile/advance-stage-sheet.tsx`
- Create: `apps/admin/components/leads/mobile/quick-note-sheet.tsx`

- [ ] **Step 1: Create `AdvanceStageSheet`** — lists valid next stages via `getNextStages`; tapping one calls `useUpdateLead`.

```tsx
// apps/admin/components/leads/mobile/advance-stage-sheet.tsx
"use client";

import type { Lead, LeadStatus } from "@/types/leads";
import { LEAD_STATUS_CONFIG, LEAD_STATUS_UI } from "@/types/leads";
import { getNextStages } from "../lead-stage";
import { useUpdateLead } from "@/hooks/use-lead-mutations";
import { BottomSheet } from "./bottom-sheet";
import { toast } from "sonner";

interface AdvanceStageSheetProps {
  lead: Lead | null;
  onClose: () => void;
}

export function AdvanceStageSheet({ lead, onClose }: AdvanceStageSheetProps) {
  const updateLead = useUpdateLead();
  const stages = lead ? getNextStages(lead.status) : [];

  const move = (status: LeadStatus) => {
    if (!lead) return;
    updateLead.mutate(
      { id: lead.id, data: { status } },
      {
        onSuccess: () => { toast.success(`Moved to ${LEAD_STATUS_CONFIG[status].label}`); onClose(); },
        onError: () => toast.error("Couldn't update the stage."),
      },
    );
  };

  return (
    <BottomSheet open={!!lead} onOpenChange={(o) => !o && onClose()} title={lead ? `Move "${lead.merchant_name}"` : ""}>
      {stages.length === 0 ? (
        <p className="py-6 text-center text-sm text-[var(--muted)]">No further stages from here.</p>
      ) : (
        <div className="flex flex-col gap-2 py-1">
          {stages.map((s) => {
            const ui = LEAD_STATUS_UI[s];
            return (
              <button
                key={s}
                type="button"
                disabled={updateLead.isPending}
                onClick={() => move(s)}
                className="flex items-center gap-3 rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] px-4 py-3.5 text-left font-bold active:scale-[0.99] transition-transform disabled:opacity-50"
                style={{ color: ui.solid }}
              >
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: ui.solid }} />
                {LEAD_STATUS_CONFIG[s].label}
              </button>
            );
          })}
        </div>
      )}
    </BottomSheet>
  );
}
```

- [ ] **Step 2: Create `QuickNoteSheet`** — note text + activity-type tabs; reuses `useCreateActivity`. Mirrors the type list from `lead-activity-timeline.tsx`.

```tsx
// apps/admin/components/leads/mobile/quick-note-sheet.tsx
"use client";

import { useState, useEffect } from "react";
import type { LeadActivityType } from "@/types/leads";
import { useCreateActivity } from "@/hooks/use-lead-activities";
import { BottomSheet } from "./bottom-sheet";
import { cn } from "@/lib/utils";
import { StickyNote, Phone, MessageCircle, Calendar, Loader2 } from "lucide-react";

const TYPES: { type: LeadActivityType; label: string; icon: typeof StickyNote; color: string }[] = [
  { type: "note", label: "Note", icon: StickyNote, color: "#3B82F6" },
  { type: "call", label: "Call", icon: Phone, color: "#22C55E" },
  { type: "whatsapp", label: "WhatsApp", icon: MessageCircle, color: "#22C55E" },
  { type: "meeting", label: "Meeting", icon: Calendar, color: "#F59E0B" },
];

interface QuickNoteSheetProps {
  leadId: string | null;
  leadName?: string;
  onClose: () => void;
}

export function QuickNoteSheet({ leadId, leadName, onClose }: QuickNoteSheetProps) {
  const [type, setType] = useState<LeadActivityType>("note");
  const [text, setText] = useState("");
  const createActivity = useCreateActivity();

  useEffect(() => { if (leadId) { setType("note"); setText(""); } }, [leadId]);

  const save = () => {
    const trimmed = text.trim();
    if (!trimmed || !leadId) return;
    const cfg = TYPES.find((t) => t.type === type);
    createActivity.mutate(
      { leadId, activity_type: type, title: `${cfg?.label ?? type} added`, description: trimmed },
      { onSuccess: () => onClose() },
    );
  };

  const footer = (
    <button
      type="button"
      onClick={save}
      disabled={!text.trim() || createActivity.isPending}
      className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#FF8899] to-[#A78BFA] py-3.5 font-bold text-white disabled:opacity-50"
    >
      {createActivity.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      Add {TYPES.find((t) => t.type === type)?.label}
    </button>
  );

  return (
    <BottomSheet open={!!leadId} onOpenChange={(o) => !o && onClose()} title={leadName ? `Log on "${leadName}"` : "Add note"} footer={footer}>
      <div className="mb-3 flex flex-wrap gap-2 pt-1">
        {TYPES.map(({ type: t, label, icon: Icon, color }) => {
          const active = type === t;
          return (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              className={cn("flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition-colors",
                !active && "border border-[var(--card-border)] text-[var(--muted)]")}
              style={active ? { backgroundColor: color, color: "#fff" } : undefined}
            >
              <Icon className="h-3.5 w-3.5" /> {label}
            </button>
          );
        })}
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={4}
        autoFocus
        placeholder={`Add a ${TYPES.find((t) => t.type === type)?.label.toLowerCase()}…`}
        className="w-full resize-none rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] p-3.5 text-sm text-[var(--foreground)] placeholder:text-[var(--muted)] outline-none focus:border-[var(--primary)]"
      />
    </BottomSheet>
  );
}
```

- [ ] **Step 3: Verify** — `pnpm type-check` passes.

- [ ] **Step 4: Commit**

```bash
git add apps/admin/components/leads/mobile/advance-stage-sheet.tsx apps/admin/components/leads/mobile/quick-note-sheet.tsx
git commit -m "feat(admin/leads): add AdvanceStageSheet and QuickNoteSheet"
```

---

## Task 11: `LeadRegisterSheet` (Smart Sheet)

The headline register flow — a `BottomSheet` driven by `useLeadFormController`, with the analyze hero on top, essentials always visible, advanced fields under a collapsible "More details", and a `Save & New` / `Add Lead` footer.

**Files:**
- Create: `apps/admin/components/leads/mobile/lead-register-sheet.tsx`

- [ ] **Step 1: Create the component.** Structure (use the same field styling tokens as `lead-form.tsx` — a local `FIELD`/`LABEL` const string identical to the form's):

  - Props: `{ open: boolean; onOpenChange: (o: boolean) => void; onSubmit: (data: LeadFormData) => Promise<boolean>; initialData?: Partial<LeadFormData>; }`.
  - `const c = useLeadFormController({ open, onSubmit, initialData, onClose: () => onOpenChange(false) });`
  - Wrap everything in `<BottomSheet open={open} onOpenChange={onOpenChange} fullHeight title={c.isEdit ? "Edit Lead" : "Add Lead"} footer={…}>`.
  - **Body, in order:**
    1. **Analyze hero** (only when `ANALYZABLE_PLATFORMS.has(c.form.platform)`): dashed `#A78BFA` card — label "✨ Auto-fill from Instagram", an input bound to `c.analyzeHandle`/`c.setAnalyzeHandle` (Enter → `c.handleAnalyze()`), and an **Analyze** button (`bg-gradient-to-r from-[#FF8899] to-[#A78BFA]`, spinner when `c.isAnalyzing`). Show `c.analyzeError` (red) / `c.analyzeSuccess` (emerald) lines. Reuse the exact copy from `lead-form.tsx` lines ~496-551.
    2. **Merchant name\*** — `c.form.merchant_name` → `c.update("merchant_name", …)`, `ref={c.nameRef}`, error shake when `c.errors.merchant_name`.
    3. **Platform** select + **Followers** number (two-col grid), bound to `c.form.platform` / `c.form.follower_count`.
    4. **Phone** — `c.form.page_phone` (type=tel, inputMode=tel, dir="ltr", `onBlur` → normalize via `c.update`), with a **DMs only** pill toggling `c.form.contact_via_dm` (when on, show the "Direct messages only" placeholder, exactly like the desktop form). Show `c.errors.page_phone`.
    5. **Priority** chips (4) bound to `c.form.priority` — same active-style as `lead-form.tsx` lines ~847-879.
    6. **Collapsible "More details"** — a `useState(false)` toggle button (`▸ / ▾ More details`) that reveals: Industry select (from `c.industries`), the 4 audience inputs (`avg_view_count` / `avg_like_count` / `avg_comments_count` / `avg_order_count`) and, when `c.hasPrediction`, the green prediction card (`~{c.estimatedDailyOrders}/day · {c.estimatedMonthlyRevenue}`), Website url, City (respect `is_online_only` pill), and Notes (`management_info`).
  - **Footer:** when `!c.isEdit`, a **Save & New** button → `c.submit(true)`; always an **Add Lead / Save Changes** button → `c.submit(false)` (gradient, spinner when `c.submitting`).
  - All inputs ≥44px tall for touch (`h-11`). LTR only; keep `dir="ltr"` on phone/url inputs.

- [ ] **Step 2: Verify** — `pnpm type-check` passes. (Live check in Task 12 once the FAB opens it.)

- [ ] **Step 3: Commit**

```bash
git add apps/admin/components/leads/mobile/lead-register-sheet.tsx
git commit -m "feat(admin/leads): add LeadRegisterSheet (Smart Sheet)"
```

---

## Task 12: `LeadsMobileView` + wire into the page

**Files:**
- Create: `apps/admin/components/leads/mobile/leads-mobile-view.tsx`
- Modify: `apps/admin/app/(dashboard)/leads/page.tsx`

- [ ] **Step 1: Create `LeadsMobileView`.** Structure:

  - State: `const [registerOpen, setRegisterOpen] = useState(false);` `const [stageLead, setStageLead] = useState<Lead | null>(null);`
  - Data: `const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, isError } = useInfiniteLeads();` `const leads = data?.pages.flatMap((p) => p.leads) ?? [];` `const total = data?.pages[0]?.total ?? 0;`
  - Store: `const { searchQuery, setSearchQuery, statusFilter, setStatusFilter } = useLeadStore();`
  - Counts: `const { data: analytics } = useLeadAnalytics();` use `analytics?.by_status` for chip counts (omit when undefined).
  - Mutations for register: `const createLead = useCreateLead();` with a `handleCreate` returning `Promise<boolean>` (same pattern as the desktop view).
  - **Layout (single scroll column, `p-4 space-y-4 pb-24`):**
    1. **Header:** small icon tile + `Potential Merchants` (text-xl bold) and a muted line `‹n› prospects in pipeline` (use `total`).
    2. **Sticky search:** wrapper `sticky top-0 z-20 -mx-4 px-4 py-2 bg-[var(--background)]/85 backdrop-blur`; a search `<input>` bound to `searchQuery`/`setSearchQuery` with a leading `Search` icon and a clear `X` when non-empty.
    3. **Stage chips:** horizontally scrollable row (`flex gap-2 overflow-x-auto -mx-4 px-4`). First chip **All** (active when `statusFilter === null`, click → `setStatusFilter(null)`), then one chip per `LEAD_STATUS_CONFIG` entry (active when `statusFilter === key`, click toggles to that key or back to null). Active chip uses `{backgroundColor: ui.solid+'26', borderColor: ui.solid, color: ui.solid}`; inactive uses `ui.soft`/`ui.solid` (mirror `lead-filter-bar.tsx` lines ~198-214). Append the count from `analytics.by_status[key]` when present.
    4. **List:** `isError` → a small retry block; `isLoading` → 6 skeleton rows (`h-16 rounded-2xl bg-[var(--card-border)]/40 animate-pulse`); empty → an "No prospects yet" block with an **Add Lead** button opening the register sheet; else `leads.map((l) => <LeadMobileRow key={l.id} lead={l} onStatusTap={setStageLead} />)`.
    5. **Load more:** when `hasNextPage`, a full-width button "Load more" → `fetchNextPage()` (spinner when `isFetchingNextPage`). (Infinite-on-scroll via IntersectionObserver is a nice-to-have; the button is the MVP and is explicit.)
  - **FAB:** fixed bottom-right circular gradient button (`fixed bottom-6 right-5 z-30 h-14 w-14 rounded-2xl bg-gradient-to-br from-[#FF8899] to-[#A78BFA] shadow-lg`), `Plus` icon, `onClick={() => setRegisterOpen(true)}`. Add `pb` safe-area inset.
  - **Sheets:** render `<LeadRegisterSheet open={registerOpen} onOpenChange={setRegisterOpen} onSubmit={handleCreate} />` and `<AdvanceStageSheet lead={stageLead} onClose={() => setStageLead(null)} />`.

- [ ] **Step 2: Wire it into the page switch** — replace the Task 8 placeholder:

```tsx
// apps/admin/app/(dashboard)/leads/page.tsx
"use client";

import { useIsMobile } from "@/hooks/use-is-mobile";
import { LeadsDesktopView } from "@/components/leads/leads-desktop-view";
import { LeadsMobileView } from "@/components/leads/mobile/leads-mobile-view";

export default function LeadsPage() {
  const isMobile = useIsMobile();
  return isMobile ? <LeadsMobileView /> : <LeadsDesktopView />;
}
```

- [ ] **Step 3: Verify on a phone viewport**

Run: `pnpm type-check` + `pnpm lint` (expect clean). With `pnpm dev:admin` at 375px:
  - Header + search + stage chips render; no KPI strip.
  - Typing in search filters the list; tapping a stage chip filters + shows the count.
  - Tapping a row navigates to `/leads/[id]`; tapping a status pill opens the stage sheet and moving updates the row.
  - The **＋** FAB opens the register sheet; **Analyze** auto-fills; **Add Lead** saves and the lead appears at the top; **Save & New** clears for the next entry.
  - At ≥768px the desktop page is still unchanged.

- [ ] **Step 4: Commit**

```bash
git add apps/admin/components/leads/mobile/leads-mobile-view.tsx apps/admin/app/(dashboard)/leads/page.tsx
git commit -m "feat(admin/leads): mobile leads home (list + search + chips + FAB)"
```

---

## Task 13: Isolate desktop detail + shared tabs + detail switch (mobile = placeholder)

**Files:**
- Create: `apps/admin/components/leads/lead-detail-tabs.tsx`
- Create: `apps/admin/components/leads/lead-detail-desktop.tsx`
- Modify: `apps/admin/app/(dashboard)/leads/[id]/page.tsx`

- [ ] **Step 1: Extract shared tab bodies** — move `OverviewContent`, `SocialContent`, `CompetitorsContent`, `StoreContent` and their local helpers (`relativeTime`, `daysBetween`, `stalenessColor`, `fmt`, `SCORE_KEYS`) **verbatim** from `leads/[id]/page.tsx` into `lead-detail-tabs.tsx`, exporting each component. (`LeadActivityTimeline` and `LeadFollowUpList` already live in their own files.)

- [ ] **Step 2: Move the desktop detail body** — create `lead-detail-desktop.tsx` (`"use client"`) exporting `LeadDetailDesktop()` containing the current `LeadDetailPage` body verbatim (the loading/error/not-found blocks, header card, prediction card, quick-stats, score breakdown, tab nav, tab content, and dialogs), importing the tab components from `lead-detail-tabs.tsx`. No markup changes.

- [ ] **Step 3: Replace `[id]/page.tsx` with the switch**

```tsx
// apps/admin/app/(dashboard)/leads/[id]/page.tsx
"use client";

import { useIsMobile } from "@/hooks/use-is-mobile";
import { LeadDetailDesktop } from "@/components/leads/lead-detail-desktop";

export default function LeadDetailPage() {
  const isMobile = useIsMobile();
  if (isMobile) return <div className="p-5 text-sm text-[var(--muted)]">Mobile detail — coming in Task 14.</div>;
  return <LeadDetailDesktop />;
}
```

- [ ] **Step 4: Verify** — `pnpm type-check` passes; desktop `/leads/[id]` unchanged at ≥768px; placeholder at 375px.

- [ ] **Step 5: Commit**

```bash
git add apps/admin/components/leads/lead-detail-tabs.tsx apps/admin/components/leads/lead-detail-desktop.tsx apps/admin/app/(dashboard)/leads/[id]/page.tsx
git commit -m "refactor(admin/leads): isolate desktop detail + shared tabs behind switch"
```

---

## Task 14: `LeadMobileDetail` + wire into the detail switch

**Files:**
- Create: `apps/admin/components/leads/mobile/lead-mobile-detail.tsx`
- Modify: `apps/admin/app/(dashboard)/leads/[id]/page.tsx`

- [ ] **Step 1: Create `LeadMobileDetail`.** Structure:

  - `const { id } = useParams<{ id: string }>();` `const { data, isLoading, isError } = useLeadDetail(id);`
  - State: `const [tab, setTab] = useState<"Overview"|"Activity"|"Follow-ups"|"Social"|"Competitors"|"Store">("Overview");` `const [noteOpen, setNoteOpen] = useState(false);` `const [stageOpen, setStageOpen] = useState(false);`
  - Loading → centered spinner; error/not-found → back link + message (reuse the desktop copy).
  - `const { lead, activities, follow_ups, social_links, competitors } = data;`
  - **Layout (`pb-24`):**
    1. Back link to `/leads` (`ArrowLeft` + "Back").
    2. **Stacked header card:** avatar (gradient), name (text-xl), management name, badge row (platform / tier / priority / status) and the lead-score ring — reuse the desktop header markup but stacked full-width.
    3. **Scrollable tab bar:** `flex gap-1 overflow-x-auto border-b border-[var(--card-border)]` with the 6 tabs; active tab gets the underline treatment (same as desktop).
    4. **Tab content** — render the shared components from `lead-detail-tabs.tsx`: `Overview` → `<OverviewContent lead={lead} />`; `Activity` → `<LeadActivityTimeline activities={activities} leadId={lead.id} />`; `Follow-ups` → `<LeadFollowUpList followUps={follow_ups} leadId={lead.id} />`; `Social` → `<SocialContent socialLinks={social_links} />`; `Competitors` → `<CompetitorsContent competitors={competitors} />`; `Store` → `<StoreContent lead={lead} />`.
  - **Sticky bottom action bar:** `fixed inset-x-0 bottom-0 z-30 flex gap-2 border-t border-[var(--card-border)] bg-[var(--background)]/95 px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur`. Four equal buttons:
    - **Call** → `window.location.href = 'tel:'+phone` where `phone = lead.page_phone?.trim() || lead.phone_numbers?.find(p=>p.number?.trim())?.number || null`; if none → `toast.info("No phone number on file")`.
    - **WhatsApp** → convert the phone to intl (`964…`) and `window.open('https://wa.me/'+intl)`; if none → `toast.info`.
    - **Note** → `setNoteOpen(true)`.
    - **Advance** → `setStageOpen(true)`.
  - **Sheets:** `<QuickNoteSheet leadId={noteOpen ? lead.id : null} leadName={lead.merchant_name} onClose={() => setNoteOpen(false)} />` and `<AdvanceStageSheet lead={stageOpen ? lead : null} onClose={() => setStageOpen(false)} />`.
  - Add the `tel:`/`wa.me` helpers as small local functions (mirror `leads-desktop-view.tsx`'s `leadPhone`/`toIntlIraqi`).

- [ ] **Step 2: Wire into the switch** — replace the Task 13 placeholder:

```tsx
// apps/admin/app/(dashboard)/leads/[id]/page.tsx
"use client";

import { useIsMobile } from "@/hooks/use-is-mobile";
import { LeadDetailDesktop } from "@/components/leads/lead-detail-desktop";
import { LeadMobileDetail } from "@/components/leads/mobile/lead-mobile-detail";

export default function LeadDetailPage() {
  const isMobile = useIsMobile();
  return isMobile ? <LeadMobileDetail /> : <LeadDetailDesktop />;
}
```

- [ ] **Step 3: Verify on a phone viewport** — `pnpm type-check` + `pnpm lint` clean. At 375px: header stacks, tabs scroll horizontally, content renders, the bottom bar's Note/Advance sheets work and update the lead; Call/WhatsApp open the right intents. Desktop detail unchanged at ≥768px.

- [ ] **Step 4: Commit**

```bash
git add apps/admin/components/leads/mobile/lead-mobile-detail.tsx apps/admin/app/(dashboard)/leads/[id]/page.tsx
git commit -m "feat(admin/leads): mobile lead detail (tabs + sticky action bar)"
```

---

## Task 15: Full verification + cleanup

**Files:** none (verification) — small fixes only if something fails.

- [ ] **Step 1: Unit tests** — `pnpm exec vitest run apps/admin` → all pass (phone + stage helpers).
- [ ] **Step 2: Lint + type-check (the CI gate)** — `pnpm lint` and `pnpm type-check` → clean (no new errors/warnings beyond the repo baseline).
- [ ] **Step 3: Desktop regression** — at ≥768px, `/leads` and `/leads/[id]` are visually identical to `main` (compare against a screenshot if unsure). The shell sidebar still behaves.
- [ ] **Step 4: Mobile happy-path** at 375px (Chrome responsive or a real phone on the LAN): register a lead via FAB (with and without Analyze; with DMs-only) → appears in list; search + stage-chip filter; tap status pill → advance stage; open detail → add a note → it shows in Activity; advance stage from the bottom bar; Call/WhatsApp open correct intents.
- [ ] **Step 5: Stop the brainstorming companion server** (if still running): `bash /Users/ali/.claude/skills/brainstorming/scripts/stop-server.sh /Users/ali/scheniders-mono/.superpowers/brainstorm/*` (or just leave it — it auto-exits after 30 min idle).
- [ ] **Step 6: Final commit** (only if Step 1-4 produced fixes)

```bash
git add -A
git commit -m "test(admin/leads): verify mobile leads + desktop unchanged"
```
