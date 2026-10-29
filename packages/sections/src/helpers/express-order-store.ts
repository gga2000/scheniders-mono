// =====================================================================
// express-order-store — how far the shopper is through the express form
// =====================================================================
// The express form (inside pdp_direct_order) and the smart sticky bar are
// separate sections; neither can pass props to the other. This store is
// the wire, like `variant-store`: the form writes its progress while it is
// mounted, the bar reads it to pick its label and its tap target. Keyed by
// product id, not persisted — progress belongs to this page view.
//
// Phase 1 carries only `form`; Phase 4a adds `addons` beside it. It is read
// only by sections that opted in (`primary_kind: "form_aware"`, slice 1f).
// With nothing registered every reader sees `UNREGISTERED` and keeps
// today's behaviour.
// =====================================================================

import { create } from "zustand";
import type { FieldKey } from "../pdp_direct_order.client";
import { EXPRESS_FIELD_ORDER } from "../pdp_express/model";

/** The fields a shopper must fill before the order can go: the express
 *  field order without the optional backup number. */
export const EXPRESS_REQUIRED_FIELDS: readonly FieldKey[] = EXPRESS_FIELD_ORDER.filter(
  (k) => k !== "alt_phone",
);

export interface ExpressFormProgress {
  /** True while an express form for this product is mounted. */
  registered: boolean;
  /** Required fields that are empty or invalid, in express field order. */
  missing: readonly FieldKey[];
  /** DOM id of the first missing field, or null when none is missing. */
  firstMissingId: string | null;
  /** That field's label in the current locale, or null. */
  firstMissingLabel: string | null;
  /** DOM id of the form's submit button, once it has one. */
  submitId: string | null;
  /** DOM id of the form element ("" when nothing is registered). */
  formId: string;
}

/** What the form reports on every change. */
export type ExpressFormReport = Pick<
  ExpressFormProgress,
  "missing" | "firstMissingId" | "firstMissingLabel" | "submitId"
>;

/** The one value readers see for a product with no mounted form. A single
 *  frozen object, so a selector returning it never re-renders a reader. */
export const UNREGISTERED: ExpressFormProgress = Object.freeze({
  registered: false,
  missing: EXPRESS_REQUIRED_FIELDS,
  firstMissingId: null,
  firstMissingLabel: null,
  submitId: null,
  formId: "",
});

interface ExpressOrderState {
  forms: Record<string, ExpressFormProgress>;
  /** Called by the form on mount; returns the unmount cleanup. */
  registerForm: (productId: string, formId: string) => () => void;
  /** Called by the form on every change. Ignored while not registered. */
  reportForm: (productId: string, report: ExpressFormReport) => void;
}

export const useExpressOrderStore = create<ExpressOrderState>()((set) => ({
  forms: {},
  registerForm: (productId, formId) => {
    set((s) => ({
      forms: {
        ...s.forms,
        [productId]: { ...UNREGISTERED, registered: true, formId },
      },
    }));
    return () =>
      set((s) => {
        // A newer form for the same product may have registered since;
        // only this form's own entry is removed.
        if (s.forms[productId]?.formId !== formId) return s;
        return {
          forms: Object.fromEntries(
            Object.entries(s.forms).filter(([id]) => id !== productId),
          ),
        };
      });
  },
  reportForm: (productId, report) =>
    set((s) => {
      const current = s.forms[productId];
      if (!current) return s;
      return { forms: { ...s.forms, [productId]: { ...current, ...report } } };
    }),
}));

/** The progress for `productId`, or `UNREGISTERED`. */
export function expressFormOf(
  state: Pick<ExpressOrderState, "forms">,
  productId: string,
): ExpressFormProgress {
  return state.forms[productId] ?? UNREGISTERED;
}

/** Hook form of `expressFormOf`, for the sections that read it. */
export function useExpressFormProgress(productId: string): ExpressFormProgress {
  return useExpressOrderStore((s) => expressFormOf(s, productId));
}

export type ExpressFormStage = "none" | "untouched" | "partial" | "complete";

/**
 * The four states the smart sticky bar renders (spec §1.8):
 *   none      — no express form is mounted for the product;
 *   untouched — every required field is still missing;
 *   partial   — some, not all, are missing;
 *   complete  — nothing required is missing.
 */
export function expressFormStage(progress: ExpressFormProgress): ExpressFormStage {
  if (!progress.registered) return "none";
  if (progress.missing.length === 0) return "complete";
  const allMissing = EXPRESS_REQUIRED_FIELDS.every((k) => progress.missing.includes(k));
  return allMissing ? "untouched" : "partial";
}
